---
title: Multiblock 定义系统
prev: false
next: false
---

# 定义系统

## MultiblockDefinition

描述多方块结构的不可变记录，核心为 `Map<Vec3i, BlockStatePredicate>`，将相对位置映射到方块谓词。

```java
public record MultiblockDefinition(
    @Unmodifiable Map<Vec3i, BlockStatePredicate> definition
) {
    public static Builder builder();
    public static SeriaBuilder seriaBuilder();
    ...
}
```

### 核心方法

| 方法                                                               | 说明                              |
|------------------------------------------------------------------|---------------------------------|
| `toGlobal(BlockPos centerPos)`                                   | 将相对位置转为以 `centerPos` 为原点的绝对位置映射 |
| `isController(LevelAccessor, BlockState, @Nullable BlockEntity)` | 检测 `ZERO` 位置的谓词是否匹配（判断某处是否为控制器） |

### 序列化

提供 `CODEC` (`MapCodec<MultiblockDefinition>`) 和 `STREAM_CODEC`。内部通过 `DefinitionSerialization`
将定义转换为人类可读的栅格格式进行序列化。

## Builder（代码方式）

```java
MultiblockDefinition definition = MultiblockDefinition.builder()
    .addController(Blocks.DIAMOND_BLOCK)                    // 位置 (0,0,0)
    .add(new Vec3i(0, 1, 0), Blocks.GOLD_BLOCK)             // 上方金块
    .add(new Vec3i(0, -1, 0), Blocks.IRON_BLOCK)            // 下方铁块
    .add(new Vec3i(1, 0, 0), BlockStatePredicate.builder()  // X+1 橡木原木横放
        .of(Blocks.OAK_LOG)
        .with(BlockStateProperties.AXIS, Direction.Axis.X)
        .build())
    .add(new Vec3i(0, 0, 1), tag)                           // Z+1 带 NBT
    .build();
```

### Builder 方法

| 方法                                           | 说明                            |
|----------------------------------------------|-------------------------------|
| `add(Vec3i, BlockStatePredicate.Builder)`    | 添加位置的谓词                       |
| `add(Vec3i, Block)`                          | 添加位置的方块匹配                     |
| `add(Vec3i, CompoundTag)`                    | 添加位置的 NBT 匹配                  |
| `add(Vec3i, Block, CompoundTag)`             | 添加位置的方块+NBT 匹配                |
| `addController(BlockStatePredicate.Builder)` | 设置控制器位置 (`Vec3i.ZERO`) 的谓词    |
| `addController(Block)`                       | 设置控制器方块                       |
| `addController(CompoundTag)`                 | 设置控制器 NBT                     |
| `addController(Block, CompoundTag)`          | 设置控制器方块+NBT                   |
| `build()`                                    | 构建不可变的 `MultiblockDefinition` |

## SeriaBuilder（栅格方式）

使用 ASCII 字符画定义多层多方块结构，适合视觉化设计。

```java
MultiblockDefinition definition = MultiblockDefinition.seriaBuilder()
    .mapController(Blocks.DIAMOND_BLOCK)       // '0' = 控制器
    .map('G', Blocks.GOLD_BLOCK)
    .map('I', Blocks.IRON_BLOCK)
    .map('S', BlockStatePredicate.builder()    // 'S' = 石砖半砖
        .of(Blocks.STONE_BRICK_SLAB)
        .with(BlockStateProperties.SLAB_TYPE, SlabType.BOTTOM)
        .build())
    .layer(          // Y=0 (底层)
        "III",
        "ISI",
        "III"
    )
    .layer(          // Y=1 (中层: 控制器)
        " G ",
        "G0G",
        " G "
    )
    .layer(          // Y=2 (顶层)
        "GGG",
        "G G",
        "GGG"
    )
    .build();
```

### 栅格规则

- 每层为一个 `String[]`，每个字符串代表 Z 方向的一行
- 字符串中的字符表示 X 方向的位置
- 多个 layer 沿 Y 轴堆叠（按添加顺序从下到上）
- 空格字符 `' '` 表示该位置不需要匹配
- `'0'` 固定为控制器位置，要求必须定义
- 构建时自动以控制器位置为中心偏移所有坐标

### SeriaBuilder 方法

| 方法                                           | 说明                         |
|----------------------------------------------|----------------------------|
| `layer(String... layer)`                     | 添加一层（数组每项为 Z 行，内容为 X 字符序列） |
| `map(char key, BlockStatePredicate.Builder)` | 将字符映射到谓词                   |
| `map(char key, Block)`                       | 将字符映射到方块                   |
| `map(char key, CompoundTag)`                 | 将字符映射到 NBT                 |
| `map(char key, Block, CompoundTag)`          | 将字符映射到方块+NBT               |
| `mapController(...)`                         | 将控制器标记（'0'）映射到指定谓词/方块      |
| `build()`                                    | 构建 `MultiblockDefinition`  |

## DefinitionSerialization（内部格式）

`package-private` 记录类，处理栅格格式与 `MultiblockDefinition` 之间的转换。

```java
record DefinitionSerialization(
    String[][] grid,                            // Y → Z → X 字符
    Char2ObjectMap<BlockStatePredicate> mapping // 字符 → 谓词映射
)
```

**`toDefinition()`**: 找到 `'0'` 作为原点，将所有非空格字符转换为相对位置的谓词条目。

**`fromDefinition(definition)`**: 反向转换：从不定型定义重建栅格，自动分配字符键（`A-Z`, `a-z`, `0-9`, 特殊字符...直至中文字符）。

**键分配顺序**: `A-Z` → `a-z` → `1-9` → 特殊字符 → 汉字 `一` 起

## JSON 序列化格式

```json
{
  "grid": [
    [
      [" ", "G", " "],
      ["G", "0", "G"],
      [" ", "G", " "]
    ]
  ],
  "mapping": {
    "0": { "block": "mymod:controller" },
    "G": { "block": "minecraft:gold_block" }
  }
}
```

- `grid[Y][Z][X]` 为单个字符
- 数据包路径: `data/<namespace>/anvillib/definitions/<name>.json`

## 注册表

```java
// 定义注册表 Key
ResourceKey<Registry<MultiblockDefinition>> key = LibRegistries.DEFINITIONS_KEY;
// → anvillib:definitions
```

通过 `DataPackRegistryEvent.NewRegistry` 注册为同步数据包注册表，使用 `CODEC.codec()` 同时作为 save 和 network codec。
