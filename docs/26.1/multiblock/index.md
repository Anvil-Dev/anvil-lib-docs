# Multiblock 多方块定义、构建器与数据包注册 (`module.multiblock`)

<BranchContextCard branch="26.1" />

`module.multiblock`（构件名 `anvillib-multiblock-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.multiblock`）提供了一套**基于数据包注册表定义、支持主线程快照 + 后台线程池异步轮询校验、通过 SavedData 持久化成形状态并自动向客户端同步**的动态多方块结构框架。

本模块按功能拆分为 3 篇子文档：
- **本篇（多方块定义、构建器与数据包注册）**：详解 `AnvilLibMultiblock`、`AnvilLibMultiblockConfig`、`MultiblockDefinition`（含 `Builder` 与 `SeriaBuilder`）、`DefinitionSerialization` 与 `LibRegistries`。
- **[控制器、成形状态与动态管理器](./controller-and-state)**：详解 `IController`、`SimpleController`、`ControllerRecord`、`ControllerInfo`、`DynamicMultiblockManager`、`MultiblockState`、`MultiblockPart` 与 `MultiblockCheckSnapshot`。
- **[多方块事件与网络同步包](./events-and-network)**：详解 `DynamicMultiblockEvent`（`Form` / `Unform`）、`BlockEventListener`、`MultiblockFormPacket` 与 `MultiblockUnformPacket`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `multiblock` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-multiblock-neoforge-26.1:2.0.0")
}
```

---

## 二、 核心概念：多方块是如何定义与序列化的？

一个多方块结构由 **`MultiblockDefinition`** 描述。其核心是一个不可变映射 `Map<Vec3i, BlockStatePredicate>`：
- **局部原点 `Vec3i.ZERO` `(0, 0, 0)`**：固定代表**控制器方块（Controller）**所在的位置；
- **相对偏移 `Vec3i`**：代表每个组成部分相对于控制器的三维偏移 `(dx, dy, dz)`；
- **状态与 NBT 谓词 `BlockStatePredicate`**（来自 `module.util`）：描述该位置需要满足的方块、方块标签、方块状态属性或方块实体 NBT 条件。

虽然底层是 `Map<Vec3i, BlockStatePredicate>`，但在 JSON 数据包序列化时，`MultiblockDefinition.CODEC` 会通过 **`DefinitionSerialization`** 将其转化为直观的二维字符网格切片：
- `"grid"`：三维字符串数组 `String[y][z]`（外层数组从底向上按 `Y` 层排列，内层数组按 `Z` 行排列，每个字符串内の字符按 `X` 列排列）；
- **字符 `'0'`**：固定代表控制器方块（局部坐标 `(0, 0, 0)`）；
- **空格 `' '`**：代表忽略该位置（任意方块均可，不纳入检测）；
- **其他单字符（如 `'#'`、`'A'`）**：在 `"mapping"` 字典中映射到具体的 `BlockStatePredicate`。

---

## 三、 完整代码示例

`MultiblockDefinition` 提供两种构建器：
1. **`MultiblockDefinition.seriaBuilder()`（字符网格构建器，推荐）**：像写合成表一样逐层（`layer`）画出结构，并用 `mapController(...)` 和 `map(char, ...)` 绑定谓词；
2. **`MultiblockDefinition.builder()`（坐标偏移构建器）**：适合稀疏结构或程序化生成的结构，直接按 `Vec3i` 偏移添加方块要求。

### 1. 在数据包 Bootstrap 中注册多方块定义

多方块定义存储在数据包注册表 `LibRegistries.DEFINITIONS_KEY`（注册表路径 `anvillib:definitions`，数据包 JSON 目录为 `data/<namespace>/anvillib/definitions/<path>.json`）：

```java
package com.example.mymod.data;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.multiblock.dynamic.definition.MultiblockDefinition;
import dev.anvilcraft.lib.v2.multiblock.init.LibRegistries;
import dev.anvilcraft.lib.v2.util.predicate.BlockStatePredicate;
import net.minecraft.core.Vec3i;
import net.minecraft.data.worldgen.BootstrapContext;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FurnaceBlock;

public final class ModMultiblockDefinitions {
    public static final ResourceKey<MultiblockDefinition> BLAST_KILN = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "blast_kiln")
    );

    public static final ResourceKey<MultiblockDefinition> BEACON_PILLAR = ResourceKey.create(
        LibRegistries.DEFINITIONS_KEY,
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "beacon_pillar")
    );

    private ModMultiblockDefinitions() {
    }

    public static void bootstrap(BootstrapContext<MultiblockDefinition> ctx) {
        // 方式 1：使用 seriaBuilder() 按层构建 3x2x3 的鼓风窑（'0' 为控制器，' ' 为空气/任意）
        MultiblockDefinition blastKiln = MultiblockDefinition.seriaBuilder()
            .layer( // Y = 0 底层
                "BBB",
                "B0B",
                "BBB"
            )
            .layer( // Y = 1 顶层
                "GGG",
                "G G",
                "GGG"
            )
            // 绑定 '0' 控制器方块（要求是处于点亮状态的熔炉，或自定义控制器方块）
            .mapController(
                Blocks.FURNACE,
                Blocks.FURNACE.defaultBlockState().setValue(FurnaceBlock.LIT, true)
            )
            // 绑定 'B' 为石砖标签
            .map('B', BlockStatePredicate.builder().of(BlockTags.STONE_BRICKS))
            // 绑定 'G' 为玻璃方块
            .map('G', Blocks.GLASS)
            .build();

        ctx.register(BLAST_KILN, blastKiln);

        // 方式 2：使用 builder() 直接按相对坐标偏移构建
        MultiblockDefinition beaconPillar = MultiblockDefinition.builder()
            .addController(ModBlocks.PILLAR_CORE.get())
            .add(new Vec3i(0, 1, 0), Blocks.IRON_BLOCK)
            .add(new Vec3i(0, 2, 0), Blocks.GOLD_BLOCK)
            .add(new Vec3i(0, 3, 0), Blocks.DIAMOND_BLOCK)
            .build();

        ctx.register(BEACON_PILLAR, beaconPillar);
    }
}
```

### 2. 对应的 JSON 数据包文件格式 (`data/my_mod/anvillib/definitions/blast_kiln.json`)

```json
{
  "grid": [
    [
      "BBB",
      "B0B",
      "BBB"
    ],
    [
      "GGG",
      "G G",
      "GGG"
    ]
  ],
  "mapping": {
    "0": {
      "blocks": "minecraft:furnace",
      "state": {
        "lit": "true"
      }
    },
    "B": {
      "blocks": "#minecraft:stone_bricks"
    },
    "G": {
      "blocks": "minecraft:glass"
    }
  }
}
```

---

## 四、 公开类与构建器 API 详解

### 1. `MultiblockDefinition`（多方块结构定义）

位于 `dev.anvilcraft.lib.v2.multiblock.dynamic.definition.MultiblockDefinition`。

| 常量 / 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `MultiblockDefinition.CODEC` | `MapCodec<MultiblockDefinition>` | 通过 `DefinitionSerialization.CODEC.xmap(...)` 实现的 `MapCodec`。 |
| `MultiblockDefinition.STREAM_CODEC` | `StreamCodec<RegistryFriendlyByteBuf, MultiblockDefinition>` | 网络流编解码器。 |
| `public MultiblockDefinition(Map<Vec3i, BlockStatePredicate> definition)` | — | 直接使用相对坐标到方块状态谓词的映射构造定义（必须包含 `Vec3i.ZERO` 作为控制器谓词）。 |
| `public static Builder builder()` | `MultiblockDefinition.Builder` | 创建基于 `Vec3i` 相对偏移的构建器。 |
| `public static SeriaBuilder seriaBuilder()` | `MultiblockDefinition.SeriaBuilder` | 创建基于字符网格切片（`layer` + `map`）的构建器。 |
| `public @Unmodifiable Map<BlockPos, BlockStatePredicate> toGlobal(BlockPos centerPos)` | `Map<BlockPos, BlockStatePredicate>` | 将所有局部偏移加上控制器世界坐标 `centerPos`，返回世界坐标下的检测表。 |
| `public boolean isController(LevelAccessor level, BlockState state, @Nullable BlockEntity entity)` | `boolean` | 检测给定方块状态与方块实体是否满足 `Vec3i.ZERO` 处的控制器谓词。 |

### 2. `MultiblockDefinition.Builder`（坐标偏移构建器）

| 方法签名 | 说明 |
| :--- | :--- |
| `add(Vec3i localPos, BlockStatePredicate.Builder predicate)` | 在相对偏移 `localPos` 处添加自定义构建器谓词。 |
| `add(Vec3i localPos, Block block)` | 要求 `localPos` 处为指定 `Block`。 |
| `add(Vec3i localPos, BlockState state)` | 要求 `localPos` 处匹配 `state` 的属性。 |
| `add(Vec3i localPos, Block block, BlockState state)` | 要求 `localPos` 处为 `block` 且匹配 `state` 属性。 |
| `add(Vec3i localPos, CompoundTag tag)` | 要求 `localPos` 处方块实体匹配指定 `CompoundTag` NBT。 |
| `add(Vec3i localPos, Block block, CompoundTag tag)` | 要求 `localPos` 处为 `block` 且方块实体匹配 `tag`。 |
| `add(Vec3i localPos, BlockState state, CompoundTag tag)` | 要求匹配 `state` 属性与 `tag` NBT。 |
| `add(Vec3i localPos, Block block, BlockState state, CompoundTag tag)` | 同时要求匹配 `block`、`state` 与 `tag`。 |
| `addController(...)`（共 8 个与 `add` 参数对应的重载） | 等同于向 `Vec3i.ZERO` `(0, 0, 0)` 位置添加控制器方块谓词。 |
| `public MultiblockDefinition build()` | 构建不可变的 `MultiblockDefinition`。 |

### 3. `MultiblockDefinition.SeriaBuilder`（字符网格切片构建器）

| 方法签名 | 说明 |
| :--- | :--- |
| `public SeriaBuilder layer(String... layer)` | 按从下往上（Y 轴递增）顺序追加一层平面切片。每层中的多个字符串代表 Z 轴各行，每个字符串内的字符代表 X 轴各列。**注意**：所有层的字符串数组长度需保持一致。 |
| `public SeriaBuilder map(char key, ...)`（共 8 个重载，参数同 `Builder#add`） | 将网格中的字符 `key` 映射到对应的 `BlockStatePredicate`。 |
| `public SeriaBuilder mapController(...)`（共 8 个重载） | 等同于 `this.map('0', ...)`，为网格中的 `'0'` 字符绑定控制器方块谓词。 |
| `public MultiblockDefinition build()` | 通过 `new DefinitionSerialization(result, this.mapping).toDefinition()` 解析网格并返回 `MultiblockDefinition`。若网格中出现了未在 `mapping` 中定义的非空格字符，会抛出 `IllegalArgumentException("Undefined key '...' found")`。 |

### 4. `DefinitionSerialization`（网格序列化中间记录）

```java
public record DefinitionSerialization(String[][] grid, Char2ObjectMap<BlockStatePredicate> mapping)
```

| 常量 / 方法签名 | 说明 |
| :--- | :--- |
| `DefinitionSerialization.CODEC` / `STREAM_CODEC` | 网格与字符映射表的 `MapCodec` 与 `StreamCodec`。 |
| `public MultiblockDefinition toDefinition()` | 先在 `grid` 中搜索字符 `'0'` 的坐标作为控制器原点 `offset`（未找到则取 `Vec3i.ZERO`），再将所有非空格字符的坐标减去 `offset` 转换为 `MultiblockDefinition`。 |
| `public static DefinitionSerialization fromDefinition(MultiblockDefinition definition)` | 将基于 `Vec3i` 的 `MultiblockDefinition` 逆向紧凑编码回 `String[][] grid` 与字符映射表（控制器固定分配 `'0'`，其余不同谓词按 `'A'..'Z'`、`'a'..'z'`、`'1'..'9'`、符号及汉字顺序自动分配唯一字符）。 |

### 5. `AnvilLibMultiblock`、`AnvilLibMultiblockConfig` 与 `LibRegistries`

| 类名 | 常量 / 字段签名 | 说明 |
| :--- | :--- | :--- |
| `AnvilLibMultiblock` | `MAIN_ID = "anvillib"`<br>`MOD_ID = "anvillib_multiblock"`<br>`CONFIG` (`AnvilLibMultiblockConfig`)<br>`public static Identifier of(String path)` | 模块主类，自动注册网络包通道与配置文件 `config/anvillib/anvillib_multiblock-common.toml`。 |
| `AnvilLibMultiblockConfig` | `public int unformedMultiblockCheckInterval = 10` (`[5, 100]`)<br>`public int formedMultiblockCheckInterval = 20` (`[5, 100]`)<br>`public int asyncThreadPoolSize = 4` (`[1, 16]`)<br>`public int maxChecksPerTick = 128` (`[1, 512]`) | • `unformedMultiblockCheckInterval`：未成形多方块每隔多少 Tick 检测一次（默认 10 Tick = 0.5 秒）；<br>• `formedMultiblockCheckInterval`：已成形多方块每隔多少 Tick 复检一次（默认 20 Tick = 1 秒）；<br>• `asyncThreadPoolSize`：后台异步检测线程池最大线程数；<br>• `maxChecksPerTick`：单 Tick 最多提交异步检测的多方块数量上限。 |
| `LibRegistries` | `public static final ResourceKey<Registry<MultiblockDefinition>> DEFINITIONS_KEY` | 数据包注册表键 `anvillib:definitions`，在 `DataPackRegistryEvent.NewRegistry` 中开启服务端至客户端自动同步。 |
