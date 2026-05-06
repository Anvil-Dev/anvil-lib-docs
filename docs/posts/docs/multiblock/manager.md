---
title: Multiblock 运行时管理
prev: false
next: false
---

# 运行时管理

## MultiblockState

代表一个多方块实例的运行状态。

```java
@Getter @Setter
public class MultiblockState {
    private final BlockPos controllerPos;                        // 控制器绝对位置
    private final ResourceKey<MultiblockDefinition> definitionKey; // 定义注册表 Key
    private Holder.Reference<MultiblockDefinition> definition;    // 惰性解析的定义引用
    private boolean formed;                                      // 是否已成型

    public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey);
    public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey, boolean formed);

    // 惰性解析定义（从注册表获取并缓存）
    public Holder.Reference<MultiblockDefinition> getDefinition(HolderLookup.Provider registries);
}
```

### 序列化

| 字段 | Codec | StreamCodec |
|------|-------|-------------|
| `controllerPos` | `BlockPos.CODEC` | `StreamCodecUtil.VAR_INT_BLOCK_POS` |
| `definitionKey` | `ResourceKey.codec(DEFINITIONS_KEY)` | `ResourceKey.streamCodec(DEFINITIONS_KEY)` |

## DynamicMultiblockManager

每个维度的全局管理器，继承 `SavedData` 实现持久化。

### 获取实例

```java
// 服务端：从 SavedData 读取，不存在则新建
// 客户端：使用 WeakHashMap 内存缓存
DynamicMultiblockManager manager = DynamicMultiblockManager.get(level);
```

### 查询方法

| 方法 | 说明 |
|------|------|
| `getAt(BlockPos pos)` | 获取指定位置的多方块状态（不存在返回 null） |
| `containsAt(BlockPos pos)` | 判断指定位置是否注册了控制器 |
| `add(MultiblockState state)` | 注册新多方块，标记脏数据 |
| `removeAt(BlockPos pos)` | 移除并返回多方块状态，标记脏数据 |
| `updateFormed(Level, MultiblockState, boolean)` | 更新成型状态（状态变化时触发回调和网络同步） |

### updateFormed 详解

```java
public void updateFormed(Level level, MultiblockState cur, boolean formed) {
    if (cur.isFormed() == formed) return;  // 状态未变，忽略
    cur.setFormed(formed);
    if (level.isClientSide()) return;

    // 1. 验证控制器方块是否仍然有效
    BlockState state = level.getBlockState(controllerPos);
    if (def.isController(level, state, level.getBlockEntity(controllerPos))) {
        IController controller = ControllerRecord.get(state.getBlock(), definitionId);
        if (formed) controller.onFormed(level, cur);
        else controller.onUnformed(level, cur);
    }

    // 2. 广播网络包到所有玩家
    for (ServerPlayer player : players) {
        if (formed)
            PacketDistributor.sendToPlayer(player, new MultiblockFormPacket(cur));
        else
            PacketDistributor.sendToPlayer(player, new MultiblockUnformPacket(cur));
    }

    // 3. 标记保存
    this.setDirty();
}
```

### 事件触发

#### 方块放置 (onPlace)

```java
DynamicMultiblockManager.onPlace(level, pos, state);

// 内部流程:
// 1. 遍历所有注册的定义
// 2. 尝试 correctPos() 修正位置
// 3. 调用 definition.isController() 判断
// 4. 匹配成功 → 创建 MultiblockState → add() → 同步检测
```

#### 方块破坏 (onBreak)

```java
DynamicMultiblockManager.onBreak(level, pos);

// 破坏位置为控制器 → updateFormed(false) → removeAt(pos)
// 破坏位置为已成型多方块的部件 → updateFormed(false)（标记未成型）
```

## 异步检测

### 触发时机

`BlockEventListener` 在每个 `LevelTickEvent.Post`（服务端）调用 `checkMultiblockFormed(level)`。

### 检测频率

由 `AnvilLibMultiblockConfig` 控制：

| 配置 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `unformedMultiblockCheckInterval` | 10 | 5-100 | 检测未成型多方块间隔（tick） |
| `formedMultiblockCheckInterval` | 20 | 5-100 | 检测已成型多方块间隔（tick） |
| `asyncThreadPoolSize` | 4 | 1-16 | 异步线程池大小 |
| `maxChecksPerTick` | 128 | 1-512 | 每 tick 最大检测数（受限于去重集） |

### 检测流程

```
1. tickCounter 递增，满足间隔阈值时继续
2. 收集候选 MultiblockState（跳过 pendingChecks 中已有的，限制 maxChecksPerTick）
3. 主线程构建 MultiblockCheckSnapshot（不可变快照）:
   - 获取方块状态 → BlockState
   - 若谓词依赖方块实体 → saveWithFullMetadata() 序列化 NBT
4. 提交到异步线程池执行 snapshot.test()
5. 结果回调主线程: updateFormed(level, state, formed)
```

### 线程安全设计

- `asyncExecutor`: `volatile` + `synchronized` 双重检查锁创建
- `pendingChecks`: `ConcurrentHashMap.newKeySet()` 防重入
- `MultiblockCheckSnapshot`: 完全不可变，包含所有必需数据的副本
- 异步线程仅访问快照数据，不触碰 `Level`
- 结果回调通过 `level.getServer().execute()` 回到主线程

### Executor 生命周期

```java
// 惰性创建（首次检测时）
getOrCreateExecutor();

// 服务端停止时关闭
DynamicMultiblockManager.shutdownExecutor();
// → shutdownNow(), awaitTermination(5s)
```

### 同步检测（onPlace）

方块放置时使用同步检测以获得即时反馈（不走异步线程池）：

```java
private void checkMultiblockFormedSync(Level level, MultiblockState state) {
    // 主线程直接遍历所有谓词，调用 test(level, blockState, blockEntity)
}
```

## 持久化

```java
// SavedDataType key
public static final SavedDataType<DynamicMultiblockManager> TYPE = new SavedDataType<>(
    AnvilLibMultiblock.of("multiblocks"),
    DynamicMultiblockManager::new,  // default factory
    DynamicMultiblockManager.CODEC,
    null                            // no stream codec needed (server-only)
);
```

序列化为 `List<MultiblockState>` 的 JSON，存储在世界数据中。

## 网络同步

状态变更时广播 `IClientboundPacket` 数据包（均位于 `anvillib:multiblock_form`/`anvillib:multiblock_unform`）：

- **客户端接收后**: 将 state 添加到本地 `DynamicMultiblockManager`，更新 formed 标志
- **如果控制器方块仍然有效**: 调用对应的 `onFormed`/`onUnformed` 触发客户端渲染/音效等

网络包通过 `NetworkRegistrar.register(registrar, MOD_ID)` 自动注册（在 `AnvilLibMultiblock.onNetwork()` 中）。

## 配置

```java
@Config(name = "anvillib_multiblock")
public class AnvilLibMultiblockConfig {
    @BoundedDiscrete(min = 5, max = 100)
    public int unformedMultiblockCheckInterval = 10;

    @BoundedDiscrete(min = 5, max = 100)
    public int formedMultiblockCheckInterval = 20;

    @BoundedDiscrete(min = 1, max = 16)
    public int asyncThreadPoolSize = 4;

    @BoundedDiscrete(min = 1, max = 512)
    public int maxChecksPerTick = 128;
}
```

通过 `ConfigManager.register(MOD_ID, AnvilLibMultiblockConfig::new)` 注册，支持 TOML 配置文件和 GUI 配置界面。

## 完整使用示例

### 步骤 1：定义多方块（数据包 JSON）

```json
{
  "grid": [
    [["0"]],
    [["G"]]
  ],
  "mapping": {
    "0": { "block": "mymod:controller" },
    "G": { "block": "minecraft:gold_block" }
  }
}
```

### 步骤 2：实现控制器

```java
public class MyController extends SimpleController {
    public MyController() {
        super(MyBlocks.CONTROLLER,
            ResourceLocation.fromNamespaceAndPath("mymod", "my_multiblock"));
    }

    @Override
    public void onFormed(Level level, MultiblockState state) {
        if (!level.isClientSide()) {
            // 服务端逻辑
        }
    }
}
```

### 步骤 3：注册

```java
// 在模组初始化中
ControllerRecord.register(new MyController());
```

### 步骤 4：放置方块

在游戏中按定义放置方块后，系统自动检测并触发回调。
