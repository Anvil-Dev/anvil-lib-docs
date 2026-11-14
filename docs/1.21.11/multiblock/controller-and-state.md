# 控制器、世界状态与异步检测管理器 (`controller` / `dynamic`)

<BranchContextCard branch="1.21.11" />

定义好多方块结构的 `MultiblockDefinition` 数据包后，如何在代码中绑定控制器方块，并在结构成形（Formed）或解体（Unformed）时执行业务逻辑？本篇详解 `IController`、`SimpleController`、`ControllerRecord`、`MultiblockState` 以及 `DynamicMultiblockManager`。

---

## 一、 两种控制器接入方式 (`IController` vs `SimpleController`)

`module.multiblock` 支持两种方式将方块与多方块定义关联：

1. **方式 A：使用 `SimpleController` + `ControllerRecord.register`（推荐，支持原版方块或同一个方块绑定多个多方块结构）**：
   无需修改方块类本身，直接构造 `new SimpleController(block, definitionId, onFormed, onUnformed)` 并调用 `ControllerRecord.register(controller)`。这允许你甚至用原版的 `Blocks.ANVIL` 或 `Blocks.BLAST_FURNACE` 作为多方块控制器！
2. **方式 B：让你的自定义 `Block` 类直接实现 `IController` 接口**：
   当 `ControllerRecord.get(block, definitionId)` 在注册表中未找到显式注册的 `SimpleController`，但发现 `block instanceof IController` 时，会自动将该 `block` 作为控制器缓存起来并回调其 `onFormed` / `onUnformed` 方法。

---

## 二、 完整代码示例：注册控制器并查询多方块成形状态

```java
package com.example.mymod.multiblock;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.multiblock.dynamic.DynamicMultiblockManager;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.ControllerRecord;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.SimpleController;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class ModMultiblockControllers {
    public static final Identifier BLAST_FURNACE_ID =
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "blast_furnace");

    private ModMultiblockControllers() {
    }

    @SubscribeEvent
    public static void onCommonSetup(FMLCommonSetupEvent event) {
        event.enqueueWork(() -> {
            // 注册高炉控制器：当 3x3x3 结构成形时点亮控制器方块，解体时熄灭
            ControllerRecord.register(new SimpleController(
                ModBlocks.BLAST_CONTROLLER.get(),
                BLAST_FURNACE_ID,
                (level, state) -> {
                    BlockPos pos = state.getControllerPos();
                    BlockState blockState = level.getBlockState(pos);
                    if (blockState.hasProperty(BlockStateProperties.LIT)) {
                        level.setBlockAndUpdate(pos, blockState.setValue(BlockStateProperties.LIT, true));
                    }
                },
                (level, state) -> {
                    BlockPos pos = state.getControllerPos();
                    BlockState blockState = level.getBlockState(pos);
                    if (blockState.hasProperty(BlockStateProperties.LIT)) {
                        level.setBlockAndUpdate(pos, blockState.setValue(BlockStateProperties.LIT, false));
                    }
                }
            ));
        });
    }

    /**
     * 在方块实体 Tick 或交互逻辑中查询指定控制器位置的多方块是否已成形（服务端与客户端通用）
     */
    public static boolean isBlastFurnaceFormed(Level level, BlockPos controllerPos) {
        MultiblockState state = DynamicMultiblockManager.get(level).getAt(controllerPos);
        return state != null && state.isFormed();
    }
}
```

---

## 三、 控制器包 API 详解 (`dev.anvilcraft.lib.v2.multiblock.dynamic.controller`)

### 1. `IController` 接口

| 方法签名 | 默认实现 | 说明 |
| :--- | :--- | :--- |
| `default void onFormed(Level level, MultiblockState state)` | 空实现 | 当多方块结构从“未成形”变为“已成形”且 `DynamicMultiblockEvent.Form` 未被取消时在服务端主线程调用。 |
| `default void onUnformed(Level level, MultiblockState state)` | 空实现 | 当多方块结构从“已成形”变为“未成形”且 `DynamicMultiblockEvent.Unform` 未被取消时在服务端主线程调用。 |
| `default BlockPos correctPos(Level level, BlockPos pos, BlockState state)` | 直接返回 `pos` | 当玩家放置方块触发 `DynamicMultiblockManager.onPlace` 时，允许将放置点修正为实际的控制器坐标（例如双格高方块的下半部分）。 |

### 2. `SimpleController`、`ControllerRecord` 与 `ControllerInfo`

| 类名 | 构造器 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`SimpleController`** | • `public SimpleController(Block block, Identifier definitionId, BiConsumer<Level, MultiblockState> onFormed, BiConsumer<Level, MultiblockState> onUnformed)`<br>• `public SimpleController(Block block, Identifier definitionId, BiConsumer<Level, MultiblockState> onFormed, BiConsumer<Level, MultiblockState> onUnformed, Function3<Level, BlockPos, BlockState, BlockPos> positionCorrector)`<br>• `getBlock()` / `getDefinitionId()` | `IController` 的通用函数式实现类。 |
| **`ControllerRecord`** | • `public static void register(SimpleController controller)`<br>• `public static IController get(Block block, Identifier definitionId)` | 全局控制器注册表。若未注册且 `block` 未实现 `IController`，调用 `get` 会抛出 `IllegalArgumentException`。 |
| **`ControllerInfo`** | `public record ControllerInfo(Block block, Identifier definitionId)` | `ControllerRecord` 的复合查找键。 |

---

## 四、 状态与管理器 API 详解 (`dev.anvilcraft.lib.v2.multiblock.dynamic`)

### 1. `MultiblockState`（单个多方块实例运行时状态）

| 常量 / 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final Codec<ResourceKey<MultiblockDefinition>> DEFINITION_KEY_CODEC` | `Codec` | `MultiblockDefinition` 注册表键的持久化编解码器。 |
| `public static final StreamCodec<ByteBuf, ResourceKey<MultiblockDefinition>> DEFINITION_KEY_STREAM_CODEC` | `StreamCodec` | `MultiblockDefinition` 注册表键的网络流编解码器。 |
| `public static final MapCodec<MultiblockState> CODEC` | `MapCodec` | 用于 1.21.11 `SavedData` 持久化，编码 `controller_pos`、`definition` 与可选字段 `formed`（默认 `false`）。 |
| `public static final StreamCodec<RegistryFriendlyByteBuf, MultiblockState> STREAM_CODEC` | `StreamCodec` | 网络流编解码器（编码 `VAR_INT_BLOCK_POS` 与 `DEFINITION_KEY_STREAM_CODEC`）。 |
| `public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey)`<br>`public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey, boolean formed)` | `MultiblockState` | 构造多方块状态（两参构造器初始 `formed = false`）。 |
| `public BlockPos getControllerPos()` | `BlockPos` | 获取控制器方块的世界坐标。 |
| `public ResourceKey<MultiblockDefinition> getDefinitionKey()` | `ResourceKey<MultiblockDefinition>` | 获取绑定的多方块定义注册表键。 |
| `public Holder.Reference<MultiblockDefinition> getDefinition(HolderLookup.Provider registries)` | `Holder.Reference` | 从世界 `registryAccess()` 解析并缓存 `Holder.Reference<MultiblockDefinition>`。 |
| `public boolean isFormed()` / `public void setFormed(boolean formed)` | `boolean` / `void` | 获取或设置当前是否已成形。 |
| `public MultiblockCheckSnapshot getSnapshot()` / `public void setSnapshot(MultiblockCheckSnapshot snapshot)` | 对应类型 | 获取或更新最近一次结构检查快照。 |

---

### 2. `DynamicMultiblockManager`（世界多方块 `SavedDataType` 与检测管理器）

继承自 `net.minecraft.world.level.saveddata.SavedData`。在 1.21.11 服务端通过 `SavedDataType<DynamicMultiblockManager>`（名称 `"anvillib_multiblocks"` + `CODEC`）持久化到维度 `DataStorage` 中，在客户端存储在按 `Level` 弱引用的内存缓存中。

| 常量 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final Codec<DynamicMultiblockManager> CODEC`<br>`public static final SavedDataType<DynamicMultiblockManager> TYPE` | `Codec` / `SavedDataType` | 1.21.11 `SavedData` 序列化定义与存储描述符。 |
| `public static DynamicMultiblockManager get(Level level)` | `DynamicMultiblockManager` | 获取指定维度（服务端通过 `computeIfAbsent(TYPE)`，客户端从缓存读取）的多方块管理器实例。 |
| `public @Nullable MultiblockState getAt(BlockPos pos)` | `@Nullable MultiblockState` | 查询指定控制器坐标处的 `MultiblockState`。 |
| `public boolean containsAt(BlockPos pos)` | `boolean` | 判断指定坐标是否已登记为多方块控制器。 |
| `public void add(MultiblockState state)` | `void` | 登记一个多方块状态并标记 `setDirty()`。 |
| `public @Nullable MultiblockState removeAt(BlockPos pos)` | `@Nullable MultiblockState` | 移除指定控制器坐标的多方块状态。 |
| `public void updateFormed(Level level, MultiblockState cur, boolean formed)` | `void` | 当成形状态改变时：发布可取消的 `DynamicMultiblockEvent.Form` / `Unform` 事件 → 调用 `controller.onFormed` / `onUnformed` → 向维度内所有玩家广播 `MultiblockFormPacket` / `MultiblockUnformPacket`。 |
| `public static void onPlace(ServerLevel level, BlockPos pos, BlockState state)` | `void` | 由 `BlockEventListener` 在方块放置时自动调用：若放置的是控制器方块，登记 `MultiblockState` 并立即执行一次同步成形检测。 |
| `public static void onBreak(Level level, BlockPos pos)` | `void` | 由 `BlockEventListener` 在方块破坏时自动调用：若破坏的是控制器则解除成形并移除记录；若破坏的是某个已成形多方块的组成方块，则立即将其置为 `unformed`。 |
| `public static void checkMultiblockFormed(@Nullable ServerLevel level)` | `void` | 每服务端 Tick 调用：按配置的间隔与每 Tick 数量上限构建 `MultiblockCheckSnapshot` 并提交后台线程池异步检测。 |
| `public static void shutdownExecutor()` | `void` | 服务器停止时关闭后台异步检测线程池。 |

---

### 3. `MultiblockCheckSnapshot` 与 `MultiblockPart`

| 类名 | 签名与说明 |
| :--- | :--- |
| `MultiblockCheckSnapshot` | `public record MultiblockCheckSnapshot(BlockPos controllerPos, Map<BlockPos, Entry> entries)`<br>• 内部 `record Entry(@Nullable BlockState state, @Nullable CompoundTag entityNbt, BlockStatePredicate predicate)`；<br>• `public boolean test()`：在后台工作线程安全执行所有位置的 `predicate.testOffThread(state, entityNbt)`（无需访问 `Level`）。 |
| `MultiblockPart` | `public abstract class MultiblockPart extends BlockEntity`<br>提供 `getControllerPos()` / `setControllerPos(@Nullable BlockPos)` 的可选多方块部件方块实体基类。 |
