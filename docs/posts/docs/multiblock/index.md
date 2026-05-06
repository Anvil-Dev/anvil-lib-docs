---
title: Multiblock 多方块
prev: false
next: false
---

# 动态多方块系统 (Multiblock Module)

包 `dev.anvilcraft.lib.v2.multiblock` 提供了一套完整的**动态多方块结构**系统。支持通过数据包或代码定义多方块形状、异步检测方块匹配、自动追踪结构状态（成型/未成型），并通过网络同步到客户端。

## 1. 核心概念

- **定义 (`MultiblockDefinition`)**：描述多方块结构中每个相对位置需要的方块/谓词。存储在数据包注册表 `anvillib:definitions` 中。
- **控制器 (`IController`)**：多方块的"大脑"，绑定到特定方块 + 定义 ID 的组合，提供成型/取消成型回调。
- **状态 (`MultiblockState`)**：运行时的多方块实例，跟踪控制器位置、定义引用和当前成型状态。
- **管理器 (`DynamicMultiblockManager`)**：每个维度的全局管理器，持久化为 `SavedData`。
- **异步检测**：通过独立线程池进行谓词匹配，避免阻塞主线程。

## 2. 模块主类

### AnvilLibMultiblock

模组入口，`@Mod("anvillib_multiblock")`。

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_multiblock";
public static final AnvilLibMultiblockConfig CONFIG;

public static Identifier of(String path) { ... }
```

## 3. 定义多方块结构

### 通过构建器（代码方式）

```java
MultiblockDefinition definition = MultiblockDefinition.builder()
    .addController(Blocks.DIAMOND_BLOCK)         // 位置 (0,0,0) 必须是钻石块
    .add(new Vec3i(0, 1, 0), Blocks.GOLD_BLOCK)  // 上方必须是金块
    .add(new Vec3i(0, -1, 0), Blocks.IRON_BLOCK) // 下方必须是铁块
    .add(new Vec3i(1, 0, 0), BlockStatePredicate.builder()
        .of(Blocks.OAK_LOG)
        .with(BlockStateProperties.AXIS, Direction.Axis.X)
        .build())
    .build();
```

### 通过 SeriesBuilder（栅格方式）

```java
MultiblockDefinition definition = MultiblockDefinition.seriaBuilder()
    .mapController(Blocks.DIAMOND_BLOCK)         // '0' = 控制器
    .map('G', Blocks.GOLD_BLOCK)
    .map('I', Blocks.IRON_BLOCK)
    .layer(
        "   ",
        " G ",
        "   "
    )
    .layer(
        " G ",
        "G0G",
        " G "
    )
    .layer(
        "   ",
        " I ",
        "   "
    )
    .build();
```

每层为一个 String 数组，每个字符串代表一行（X 轴），数组顺序为 Z 轴。多个层沿 Y 轴堆叠。

### MultiblockDefinition 方法

| 方法 | 说明 |
|------|------|
| `builder()` | 返回程序化 `Builder` |
| `seriaBuilder()` | 返回栅格化 `SeriaBuilder` |
| `toGlobal(BlockPos centerPos)` | 将相对位置转为绝对位置 |
| `isController(LevelAccessor, BlockState, BlockEntity)` | 检测某处是否匹配控制器谓词 |

## 4. 控制器

### IController

控制器接口，定义多方块的行为。

```java
public interface IController {
    Block getBlock();                    // 控制器方块
    Identifier getDefinitionId();        // 关联的定义 ID
    default void onFormed(Level level, MultiblockState state) { }
    default void onUnformed(Level level, MultiblockState state) { }
    default BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state) {
        return pos;  // 可覆盖以调整控制器位置
    }
}
```

### SimpleController

便捷抽象基类，接受方块和定义 ID 作为构造参数：

```java
public class MyController extends SimpleController {
    public MyController() {
        super(MyBlocks.MULTIBLOCK_CONTROLLER,
              ResourceLocation.fromNamespaceAndPath("mymod", "my_multiblock"));
    }

    @Override
    public void onFormed(Level level, MultiblockState state) {
        // 成型时执行——如更新纹理、启动粒子效果
    }

    @Override
    public void onUnformed(Level level, MultiblockState state) {
        // 取消成型时执行——如恢复默认纹理
    }
}
```

### ControllerRecord

静态注册表，映射 `(Block, Identifier)` → `IController`。

```java
// 在模组初始化中注册
ControllerRecord.register(new MyController());

// 查询控制器（自动回退到检查方块是否直接实现 IController）
IController controller = ControllerRecord.get(block, definitionId);
```

## 5. 运行时管理

### DynamicMultiblockManager

每个维度的全局管理器，通过 `SavedData` 持久化。

```java
// 获取某维度的管理器
DynamicMultiblockManager manager = DynamicMultiblockManager.get(level);

// 查询
MultiblockState state = manager.getAt(controllerPos);
boolean exists = manager.containsAt(controllerPos);

// 手动管理（通常由事件自动处理）
manager.add(new MultiblockState(controllerPos, definitionKey));
manager.removeAt(controllerPos);
manager.updateFormed(level, state, true); // 标记成型并广播
```

| 静态方法 | 说明 |
|---------|------|
| `get(Level)` | 获取维度的管理器实例（服务端从 SavedData 读取，客户端使用内存缓存） |
| `onPlace(ServerLevel, BlockPos, BlockState)` | 方块放置时检查是否匹配控制器 |
| `onBreak(Level, BlockPos)` | 方块破坏时处理取消成型 |
| `shutdownExecutor()` | 关闭异步检测线程池（服务端停止时调用） |

### MultiblockState

```java
MultiblockState state = new MultiblockState(
    controllerPos,
    ResourceKey.create(LibRegistries.DEFINITIONS_KEY, id)
);

boolean formed = state.isFormed();
Holder.Reference<MultiblockDefinition> def = state.getDefinition(registryAccess);
```

提供 `CODEC` 和 `STREAM_CODEC` 用于序列化和网络传输。

## 6. 异步检测机制

`DynamicMultiblockManager` 使用异步线程池检测多方块成型状态，避免阻塞主线程：

1. 每个服务端 tick，收集未成型和已成型的多方块状态
2. 在主线程构建不可变快照（`MultiblockCheckSnapshot`）
3. 提交到线程池异步检测谓词匹配
4. 结果回主线程，调用 `updateFormed` → `IController.onFormed/onUnformed`
5. 状态变更时广播 `MultiblockFormPacket` / `MultiblockUnformPacket`

### 配置参数 (AnvilLibMultiblockConfig)

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `unformedMultiblockCheckInterval` | 10 | 5-100 | 未成型多方块检测间隔（tick） |
| `formedMultiblockCheckInterval` | 20 | 5-100 | 已成型多方块检测间隔（tick） |
| `asyncThreadPoolSize` | 4 | 1-16 | 异步检测线程池大小 |
| `maxChecksPerTick` | 128 | 1-512 | 每 tick 最大检测数量 |

## 7. 事件驱动

`BlockEventListener` 自动监听以下事件：

| 事件 | 处理 |
|------|------|
| `BlockEvent.EntityPlaceEvent` | 调用 `DynamicMultiblockManager.onPlace()` |
| `BlockEvent.BreakEvent` | 调用 `DynamicMultiblockManager.onBreak()` |
| `LevelTickEvent.Post` | 调用 `checkMultiblockFormed()` 执行异步检测 |
| `ServerStoppedEvent` | 调用 `shutdownExecutor()` 清理线程池 |

## 8. 网络同步

两个客户端数据包自动在状态变更时广播：

- **`MultiblockFormPacket`** (`anvillib:multiblock_form`)：通知客户端多方块已成型，触发客户端 `onFormed` 回调
- **`MultiblockUnformPacket`** (`anvillib:multiblock_unform`)：通知客户端多方块已取消成型，触发客户端 `onUnformed` 回调

两种数据包均实现 `IClientboundPacket`，通过 `NetworkRegistrar` 自动注册。

## 9. 数据包注册表

```java
// 定义注册表 Key
ResourceKey<Registry<MultiblockDefinition>> key =
    LibRegistries.DEFINITIONS_KEY; // anvillib:definitions
```

多方块定义通过 NeoForge 数据包系统加载。在 `data/<namespace>/anvillib/definitions/` 目录下放置 JSON 文件即可定义多方块结构。

## 10. 完整示例

### 步骤 1：创建控制器方块

```java
public class MyMultiblockController extends SimpleController {
    public MyMultiblockController() {
        super(MyBlocks.CONTROLLER,
              ResourceLocation.fromNamespaceAndPath("mymod", "my_multiblock"));
    }

    @Override
    public void onFormed(Level level, MultiblockState state) {
        if (level instanceof ServerLevel sl) {
            // 发送成型粒子、更新方块状态等
        }
    }
}
```

### 步骤 2：注册控制器

```java
// 在模组构造中
ControllerRecord.register(new MyMultiblockController());
```

### 步骤 3：定义多方块结构 (JSON 数据包)

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

### 步骤 4：放置控制器方块

在游戏中按定义放置方块后，系统自动检测并触发 `onFormed` 回调。

## 注意事项

1. **控制器位置**：定义中 `'0'` 或 `Vec3i.ZERO` 为控制器位置。`correctPos()` 可在方块非精确位于 ZERO 时修正。
2. **异步安全**：`BlockStatePredicate.testOffThread()` 在异步线程中调用，确保谓词实现不访问 `Level`。
3. **持久化**：`MultiblockState` 作为 `SavedData` 持久化，跨重启保留成型状态。
4. **客户端同步**：状态变更通过 `IClientboundPacket` 自动同步到所有在线玩家。
5. **性能**：异步线程池大小和检测间隔应根据多方块数量调整。大量多方块时建议增大 `asyncThreadPoolSize` 和 `maxChecksPerTick`。
6. **定义注册表**：多方块定义是数据包注册表，支持 `/reload` 热重载。
