# Multiblock 动态多方块系统：结构定义与序列化 (`module.multiblock`)

<BranchContextCard branch="1.21.11" />

`module.multiblock`（构件名 `anvillib-multiblock-neoforge-1.21.11`，包名 `dev.anvilcraft.lib.v2.multiblock`）提供了一套**支持数据包 JSON 驱动、主线程快照 + 后台线程池异步周期性成形/解体检测、`Codec` `SavedDataType` 世界持久化以及双端状态自动同步**的动态多方块结构框架。

在传统多方块实现中，如果每 Tick 在服务端主线程遍历所有多方块控制器周围几十个坐标的 `BlockState` 和 `BlockEntity` NBT，当世界中存在上百座多方块机器时会严重拖慢服务器 TPS。`module.multiblock` 通过以下设计解决了这一痛点：
1. **数据驱动定义（`MultiblockDefinition`）**：挂载在数据包注册表 `anvillib:multiblock_definitions` 下，支持按坐标点集构建（`Builder`）或像有序合成配方一样用多层字符网格构建（`SeriaBuilder` / `DefinitionSerialization`）；
2. **主线程快照 + 后台异步检测（`MultiblockCheckSnapshot`）**：定期检查时，主线程仅拷贝待测坐标的 `BlockState` 引用（以及需要检查 NBT 的方块实体的 `CompoundTag`），随即将耗时的谓词匹配提交到 `AnvilLib-MultiblockCheck` 守护线程池并发执行，完成后通过 `server.execute(...)` 回到主线程更新状态并广播网络包。

本模块按功能拆分为 3 篇子文档：
- **本篇（结构定义与序列化）**：详解 `AnvilLibMultiblock`、`AnvilLibMultiblockConfig`、`LibRegistries`、`MultiblockDefinition`（含 `Builder` 与 `SeriaBuilder`）及 `DefinitionSerialization`。
- **[控制器、世界状态与异步检测管理器](./controller-and-state)**：详解 `IController`、`SimpleController`、`ControllerRecord`、`ControllerInfo`、`MultiblockState`、`MultiblockPart`、`MultiblockCheckSnapshot` 与 `DynamicMultiblockManager`。
- **[多方块生命周期事件与网络同步](./events-and-network)**：详解 `DynamicMultiblockEvent`（`Form` / `Unform`）、`BlockEventListener`、`MultiblockFormPacket` 与 `MultiblockUnformPacket`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.11`，则已自动包含本模块；若仅需单独引入 `multiblock` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-multiblock-neoforge-1.21.11:2.0.0")
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
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.properties.SlabType;

public final class ModMultiblockDefinitions {
    public static final ResourceKey<MultiblockDefinition> BLAST_FURNACE = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "blast_furnace")
    );

    public static final ResourceKey<MultiblockDefinition> ANVIL_ALTAR = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "anvil_altar")
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

## 四、 核心类与配置 API 详解

### 1. `MultiblockDefinition` 与 `DefinitionSerialization`

| 类 / 记录名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| **`MultiblockDefinition`** | • `public static final Codec<MultiblockDefinition> CODEC`<br>• `public static final Codec<Holder<MultiblockDefinition>> HOLDER_CODEC`<br>• `public static Builder builder()`<br>• `public static SeriaBuilder seriaBuilder()`<br>• `public boolean isController(BlockState state)`<br>• `public boolean test(Level level, BlockPos controllerPos)`<br>• `public Set<Vec3i> getAllOffsets()` / `public Map<Vec3i, BlockStatePredicate> definition()` | 不可变的多方块结构定义记录，同时也是注册表 `anvillib:multiblock_definitions` 的元素类型。 |
| **`MultiblockDefinition.Builder`** | • `addController(...)`（重载支持 `Block`、`BlockStatePredicate`、`BlockStatePredicate.Builder`、`TagKey<Block>`、`Block...`）<br>• `add(Vec3i offset, ...)`（同上全套重载）<br>• `build()` | 基于显式局部偏移坐标的构建器（强制校验原点 `Vec3i.ZERO` 必须已定义且至少有 1 个方块）。 |
| **`MultiblockDefinition.SeriaBuilder`** | • `layer(String... layer)`（按 Y 轴从下到上叠加二维平面层）<br>• `mapController(...)`（映射字符 `'0'`）<br>• `map(char key, ...)`（禁止显式映射空格 `' '`）<br>• `build()`（内部构建 `DefinitionSerialization` 再解包） | 基于可视化 ASCII 字符层网格的构建器，内部自动定位 `'0'` 并计算其余字符的相对偏移。 |
| **`DefinitionSerialization`** | • `public static final MapCodec<DefinitionSerialization> CODEC`<br>• `public static final Codec<DefinitionSerialization> DIRECT_CODEC`<br>• `public Map<Vec3i, BlockStatePredicate> getDefinition()` | 负责与 `layers` / `mapping` 格式 JSON 双向编解码，所有层维度不等长、缺失 `'0'` 或存在未映射字符时将立即报错。 |

### 2. `AnvilLibMultiblock`、`AnvilLibMultiblockConfig` 与 `LibRegistries`

| 类名 | 常量 / 配置字段 / 方法 | 说明 |
| :--- | :--- | :--- |
| **`AnvilLibMultiblock`** | • `MAIN_ID = "anvillib"`、`MOD_ID = "anvillib_multiblock"`<br>• `CONFIG`（`AnvilLibMultiblockConfig` 实例）<br>• `Identifier of(String path)` | 模块主类，自动注册网络包、配置与客户端 DataGen。 |
| **`AnvilLibMultiblockConfig`** | • `unformedMultiblockCheckInterval`（默认 `10` Tick，范围 `[5, 100]`）<br>• `formedMultiblockCheckInterval`（默认 `20` Tick，范围 `[5, 100]`）<br>• `asyncThreadPoolSize`（默认 `4` 线程，范围 `[1, 16]`）<br>• `maxChecksPerTick`（默认 `128` 次/Tick，范围 `[1, 512]`） | `@Config(group = "anvillib", name = "anvillib_multiblock")`，用于调优多方块检测间隔与后台异步线程池吞吐量。 |
| **`LibRegistries`** | `public static final ResourceKey<Registry<MultiblockDefinition>> DEFINITIONS_KEY` | 数据包注册表键 `anvillib:multiblock_definitions`。 |
