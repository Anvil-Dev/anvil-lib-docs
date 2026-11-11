# Multiblock 动态多方块系统：结构定义与序列化 (`module.multiblock`)

<BranchContextCard branch="1.21.1" />

`module.multiblock`（构件名 `anvillib-multiblock-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.multiblock`）提供了一套**支持数据包 JSON 驱动、主线程快照 + 后台线程池异步周期性成形/解体检测、SavedData 世界持久化以及双端状态自动同步**的动态多方块结构框架。

在传统多方块实现中，如果每 Tick 在服务端主线程遍历所有多方块控制器周围几十个坐标的 `BlockState` 和 `BlockEntity` NBT，当世界中存在上百座多方块机器时会严重拖慢服务器 TPS。`module.multiblock` 通过以下设计解决了这一痛点：
1. **数据驱动定义（`MultiblockDefinition`）**：挂载在数据包注册表 `anvillib:multiblock_definitions` 下，支持按坐标点集构建（`Builder`）或像有序合成配方一样用多层字符网格构建（`SeriaBuilder` / `DefinitionSerialization`）；
2. **主线程快照 + 后台异步检测（`MultiblockCheckSnapshot`）**：定期检查时，主线程仅拷贝待测坐标的 `BlockState` 引用（以及需要检查 NBT 的方块实体的 `CompoundTag`），随即将耗时的谓词匹配提交到 `AnvilLib-MultiblockCheck` 守护线程池并发执行，完成后通过 `server.execute(...)` 回到主线程更新状态并广播网络包！

本模块按功能拆分为 3 篇子文档：
- **本篇（结构定义与序列化）**：详解 `AnvilLibMultiblock`、`AnvilLibMultiblockConfig`、`LibRegistries`、`MultiblockDefinition`（含 `Builder` 与 `SeriaBuilder`）及 `DefinitionSerialization`。
- **[控制器、世界状态与异步检测管理器](./controller-and-state)**：详解 `IController`、`SimpleController`、`ControllerRecord`、`ControllerInfo`、`MultiblockState`、`MultiblockPart`、`MultiblockCheckSnapshot` 与 `DynamicMultiblockManager`。
- **[多方块生命周期事件与网络同步](./events-and-network)**：详解 `DynamicMultiblockEvent`（`Form` / `Unform`）、`BlockEventListener`、`MultiblockFormPacket` 与 `MultiblockUnformPacket`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.1`，则已自动包含本模块；若仅需单独引入 `multiblock` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-multiblock-neoforge-1.21.1:2.0.0")
}
```

---

## 二、 多方块结构定义与 JSON 格式 (`MultiblockDefinition`)

### 1. 核心约定：控制器固定在局部原点 `Vec3i.ZERO` / 字符 `'0'`

在 `MultiblockDefinition` 中，所有组成方块的坐标均为**相对于控制器方块的局部偏移坐标 `Vec3i`**：
- **控制器自身必须位于局部原点 `Vec3i.ZERO` `(0, 0, 0)`**（调用 `MultiblockDefinition#isController` 时固定检测 `definition.get(Vec3i.ZERO)`）；
- 当使用字符网格构建器 `SeriaBuilder` 或编写 JSON 数据包时：
  - **字符 `'0'` 固定代表控制器方块（即局部坐标 `(0, 0, 0)`）**，整个三维字符网格中**必须且只能出现一次 `'0'`**（若未出现或出现多次，反序列化会抛出 `IllegalArgumentException`）；
  - **空格字符 `' '` 代表忽略该位置**（不对该坐标做任何方块限制）。

### 2. 数据包 JSON 示例：`data/my_mod/anvillib/multiblock_definitions/blast_furnace.json`

`LibRegistries.DEFINITIONS_KEY`（`anvillib:multiblock_definitions`）是一个数据包注册表，因此多方块定义文件存放在 `data/<namespace>/anvillib/multiblock_definitions/<name>.json`：

```json
{
  "layers": [
    [
      "BBB",
      "BBB",
      "BBB"
    ],
    [
      "BCB",
      "C0C",
      "BCB"
    ],
    [
      "BBB",
      "BBB",
      "BBB"
    ]
  ],
  "mapping": {
    "0": {
      "blocks": "my_mod:blast_controller"
    },
    "B": {
      "blocks": "minecraft:bricks"
    },
    "C": {
      "blocks": "minecraft:copper_block"
    }
  }
}
```

---

## 三、 完整代码示例：使用 `SeriaBuilder` 或 `Builder` 在代码中构建 `MultiblockDefinition`

你可以在 DataGen（通过 `DatapackBuiltinEntriesProvider` 生成数据包条目）中用 **`MultiblockDefinition.seriaBuilder()`**（推荐，直观对应 JSON 字符网格）或 **`MultiblockDefinition.builder()`**（适合稀疏结构）构建定义：

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.multiblock.dynamic.definition.MultiblockDefinition;
import dev.anvilcraft.lib.v2.multiblock.init.LibRegistries;
import dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate;
import net.minecraft.core.RegistrySetBuilder;
import net.minecraft.core.Vec3i;
import net.minecraft.data.worldgen.BootstrapContext;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.properties.SlabType;

public final class ModMultiblockDefinitions {
    public static final ResourceKey<MultiblockDefinition> BLAST_FURNACE = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "blast_furnace")
    );

    public static final ResourceKey<MultiblockDefinition> ANVIL_ALTAR = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "anvil_altar")
    );

    private ModMultiblockDefinitions() {
    }

    public static void bootstrap(BootstrapContext<MultiblockDefinition> ctx) {
        // 方式 1：使用 SeriaBuilder 字符网格构建 3x3x3 高炉（字符 '0' 为控制器原点）
        MultiblockDefinition blastFurnace = MultiblockDefinition.seriaBuilder()
            .layer(
                "BBB",
                "BBB",
                "BBB"
            )
            .layer(
                "BCB",
                "C0C",
                "BCB"
            )
            .layer(
                "BBB",
                "BBB",
                "BBB"
            )
            .mapController(ModBlocks.BLAST_CONTROLLER.get())
            .map('B', Blocks.BRICKS)
            .map('C', Blocks.COPPER_BLOCK)
            .build();
        ctx.register(BLAST_FURNACE, blastFurnace);

        // 方式 2：使用坐标点集 Builder 构建稀疏祭坛结构
        MultiblockDefinition anvilAltar = MultiblockDefinition.builder()
            .addController(Blocks.ANVIL)
            .add(new Vec3i(0, -1, 0), Blocks.IRON_BLOCK)
            .add(
                new Vec3i(1, 0, 0),
                BlockStatePredicate.builder()
                    .of(Blocks.SMOOTH_STONE_SLAB)
                    .with(SlabBlock.TYPE, SlabType.BOTTOM)
            )
            .add(
                new Vec3i(-1, 0, 0),
                BlockStatePredicate.builder()
                    .of(Blocks.SMOOTH_STONE_SLAB)
                    .with(SlabBlock.TYPE, SlabType.BOTTOM)
            )
            .build();
        ctx.register(ANVIL_ALTAR, anvilAltar);
    }

    public static void registerToBuilder(RegistrySetBuilder builder) {
        builder.add(LibRegistries.DEFINITIONS_KEY, ModMultiblockDefinitions::bootstrap);
    }
}
```

---

## 四、 公开类与配置 API 详解

### 1. `MultiblockDefinition`、`Builder`、`SeriaBuilder` 与 `DefinitionSerialization`

位于 `dev.anvilcraft.lib.v2.multiblock.dynamic.definition`。

| 类 / 记录名 | 关键常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`MultiblockDefinition`** | • `public static final MapCodec<MultiblockDefinition> CODEC`<br>• `public static final StreamCodec<RegistryFriendlyByteBuf, MultiblockDefinition> STREAM_CODEC`<br>• `public static Builder builder()`<br>• `public static SeriaBuilder seriaBuilder()`<br>• `public Map<Vec3i, BlockStatePredicate> definition()`<br>• `public Map<BlockPos, BlockStatePredicate> toGlobal(BlockPos centerPos)`<br>• `public boolean isController(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | 多方块定义记录。`toGlobal(centerPos)` 将所有局部偏移坐标 `Vec3i` 加上控制器世界坐标 `centerPos`，返回世界坐标映射表。 |
| **`MultiblockDefinition.Builder`** | • `add(Vec3i localPos, BlockStatePredicate.Builder / Block / BlockState / CompoundTag ...)`（共 8 个重载）<br>• `addController(BlockStatePredicate.Builder / Block / BlockState / CompoundTag ...)`（共 8 个重载，固定写入 `Vec3i.ZERO`）<br>• `MultiblockDefinition build()` | 按局部偏移坐标构建 `MultiblockDefinition`。 |
| **`MultiblockDefinition.SeriaBuilder`** | • `layer(String... layer)`：按从下往上（Y 轴递增）顺序添加一层字符网格<br>• `map(char key, BlockStatePredicate.Builder / Block / BlockState / CompoundTag ...)`（共 8 个重载）<br>• `mapController(...)`（共 8 个重载，等价于 `map('0', ...)`）<br>• `MultiblockDefinition build()` | 按三维字符矩阵构建 `MultiblockDefinition`。 |
| **`DefinitionSerialization`** | • `public record DefinitionSerialization(String[][] layers, Char2ObjectMap<BlockStatePredicate> mapping)`<br>• `public MultiblockDefinition toDefinition()`<br>• `public static DefinitionSerialization fromDefinition(MultiblockDefinition definition)` | 负责在三维字符网格与 `Map<Vec3i, BlockStatePredicate>` 之间双向转换（反算网格时若超过 62 种不同谓词会抛出 `IllegalArgumentException`）。 |

### 2. `LibRegistries`、`AnvilLibMultiblock` 与 `AnvilLibMultiblockConfig`

| 类 / 常量名 | 类型与默认值 | 说明 |
| :--- | :--- | :--- |
| `LibRegistries.DEFINITIONS_KEY` | `ResourceKey<Registry<MultiblockDefinition>>` | 数据包注册表键 `anvillib:multiblock_definitions`（已在 `DataPackRegistryEvent.NewRegistry` 中配置客户端同步）。 |
| `AnvilLibMultiblock.CONFIG` | `AnvilLibMultiblockConfig` | 全局配置实例（配置文件 `anvillib_multiblock-common.toml`，使用 `SIDEBAR` 侧栏样式）。 |
| `CONFIG.formedMultiblockCheckInterval` | `int`（默认 `100` Tick = 5 秒，范围 `[5, 400]`） | **已成形**多方块的周期性复检间隔（Tick）。 |
| `CONFIG.unformedMultiblockCheckInterval` | `int`（默认 `20` Tick = 1 秒，范围 `[5, 400]`） | **未成形**多方块的周期性重试检测间隔（Tick）。 |
| `CONFIG.asyncThreadPoolSize` | `int`（默认 `2`，范围 `[1, 16]`） | 异步检测线程池的最大线程数（实际大小取 `clamp(availableProcessors - 1, 1, asyncThreadPoolSize)`）。 |
| `CONFIG.maxChecksPerTick` | `int`（默认 `64`，范围 `[1, 1024]`） | 单个 Tick 最多提交异步检测的多方块实例数上限，防止突发洪峰。 |
