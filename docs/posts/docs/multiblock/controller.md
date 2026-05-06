---
title: Multiblock 控制器
prev: false
next: false
---

# 控制器

## IController

控制器接口，定义多方块检测和生命周期行为。

```java
public interface IController {
    Block getBlock();           // 控制器方块
    Identifier getDefinitionId(); // 关联的定义 ID

    // 生命周期回调
    default void onFormed(Level level, MultiblockState state) { }
    default void onUnformed(Level level, MultiblockState state) { }

    // 修正控制器位置（多方块部件调整）
    default BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state) {
        return pos;
    }
}
```

### correctPos 使用场景

当控制器检测到方块不是精确位于定义中的 `ZERO` 位置时，可通过此方法修正。例如：一个多方块部件充当"控制器标记"但真正的控制器方块在相邻位置。

```java
@Override
public BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state) {
    // 实际控制器在检测位置上方 1 格
    return pos.above();
}
```

## SimpleController

便捷抽象基类，保存 Block 和 DefinitionId 作为 final 字段。

```java
@Getter
public abstract class SimpleController implements IController {
    private final Block block;
    private final Identifier definitionId;

    protected SimpleController(Block block, Identifier definitionId) {
        this.block = block;
        this.definitionId = definitionId;
    }
}
```

### 使用方式

```java
public class MyMultiblockController extends SimpleController {
    public MyMultiblockController() {
        super(
            MyBlocks.CONTROLLER,
            ResourceLocation.fromNamespaceAndPath("mymod", "my_multiblock")
        );
    }

    @Override
    public void onFormed(Level level, MultiblockState state) {
        // 成型时：更新纹理、启动粒子、播放音效等
        if (level instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.END_ROD, ...);
        }
    }

    @Override
    public void onUnformed(Level level, MultiblockState state) {
        // 取消成型时：恢复默认状态
    }

    @Override
    public BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state) {
        // 可选：修正控制器位置
        return pos;
    }
}
```

**直接实现 IController** 的方块也可以被识别：

```java
public class ControllerBlock extends Block implements IController {
    @Override
    public Block getBlock() { return this; }

    @Override
    public Identifier getDefinitionId() {
        return ResourceLocation.fromNamespaceAndPath("mymod", "definition_id");
    }
}
```

## ControllerRecord

静态注册表，维护 `(Block, Identifier)` → `IController` 的映射。

```java
public class ControllerRecord {
    // 注册 SimpleController
    public static void register(SimpleController controller);

    // 查询控制器（未找到且方块未实现 IController 时抛 IllegalArgumentException）
    public static IController get(Block block, Identifier definitionId);
}
```

### 查找逻辑

1. 在 `CONTROLLERS` map 中按 `(Block, DefinitionId)` 精确查找
2. 若未找到，检查 Block 是否 `instanceof IController`
3. 若是，自动注册到 map（缓存）并返回
4. 若都不是，抛出 `IllegalArgumentException`

### 注册

```java
// 在模组构造中注册（如在 @Mod 构造函数或 common setup 中）
ControllerRecord.register(new MyMultiblockController());
```

### ControllerInfo（内部）

```java
// package-private 键记录
record ControllerInfo(Block block, Identifier definitionId) { }
```

## 生命周期

### 成型流程 (onFormed)

1. 方块放置 → `DynamicMultiblockManager.onPlace()` 同步检测
2. 所有谓词匹配 → `updateFormed(level, state, true)`
3. `ControllerRecord.get(block, definitionId)` 获取控制器
4. 调用 `controller.onFormed(level, state)`
5. 广播 `MultiblockFormPacket` 到所有客户端
6. 客户端接收后调用本地的 `controller.onFormed(level, state)`

### 取消成型流程 (onUnformed)

1. 方块破坏或异步检测失败 → `updateFormed(level, state, false)`
2. 调用 `controller.onUnformed(level, state)`
3. 广播 `MultiblockUnformPacket` 到所有客户端
4. 客户端接收后调用本地的 `controller.onUnformed(level, state)`

### 注意事项

- `onFormed`/`onUnformed` 在服务端和客户端都会被调用（通过网络包同步到客户端）
- 控制器回调执行前会验证控制器方块仍然有效（`isController()` 检查）
- 如果控制器方块被破坏或替换为非控制器方块，回调不会执行
