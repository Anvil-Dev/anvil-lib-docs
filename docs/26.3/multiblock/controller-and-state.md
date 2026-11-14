# 控制器、成形状态与动态管理器 (`IController` / `DynamicMultiblockManager`)

<BranchContextCard branch="26.3" />

在数据包中定义了 `MultiblockDefinition` 之后，还需要将某个控制器方块与该定义绑定，并在多方块成形（Formed）与解体（Unformed）时执行业务逻辑。本篇详解控制器接口（`IController` / `SimpleController` / `ControllerRecord`）、多方块运行态数据（`MultiblockState` / `MultiblockCheckSnapshot`）以及核心调度中心 `DynamicMultiblockManager`。

---

## 一、 核心运行机制

1. **放置方块时同步立即检测 (`DynamicMultiblockManager.onPlace`)**：
   当世界中放置任意方块时，`BlockEventListener` 触发 `DynamicMultiblockManager.onPlace`。管理器遍历当前注册表中的所有 `MultiblockDefinition`：
   - 调用对应控制器的 `correctPos(level, pos, state)`（允许玩家放置外围构件时将检测锚点重定向到控制器位置，默认直接返回 `pos`）；
   - 若 `correctedPos` 处的方块满足 `definition.isController(...)`，则立即创建 `MultiblockState` 加入管理器，并在主线程同步调用 `checkMultiblockFormedSync` 立即完成首次成形检测。
2. **周期性后台异步快照检测 (`DynamicMultiblockManager.checkMultiblockFormed`)**：
   对于已记录在管理器中的控制器（例如玩家先放了控制器、之后再逐个摆好周围方块，或通过活塞/指令改变了周围方块），管理器在服务端每 Tick 递增计数器：
   - 未成形结构默认每 `10` Tick 检测一次，已成形结构默认每 `20` Tick 复检一次（每 Tick 最多取 `128` 个候选）；
   - **主线程快照 + 工作线程无锁测试**：主线程先调用 `buildSnapshot` 将结构范围内已加载区块的 `BlockState`（以及需要校验 NBT 的 `BlockEntity` 序列化 `CompoundTag`）打包为不可变的 `MultiblockCheckSnapshot`，再交给 `AnvilLib-MultiblockCheck` 守护线程池在后台调用 `snapshot.test()`（内部执行 `BlockStatePredicate#testOffThread`）；
   - 检测完成后通过 `level.getServer().execute(...)` 回到服务器主线程调用 `updateFormed(level, current, formed)`，既保证了多线程安全，又消除了大批量多方块轮询对主线程 TPS 的占用。
3. **破坏方块时立即解体 (`DynamicMultiblockManager.onBreak`)**：
   当玩家破坏方块时，若破坏的是控制器本身，则先触发解体会话（`updateFormed(..., false)`）再移除记录；若破坏的是某个已成形多方块的组成方块（但控制器仍在），则将该多方块状态更新为 `formed = false`，保留控制器记录以便玩家补齐方块后自动重新成形。

---

## 二、 完整代码示例

下面演示两种注册多方块控制器的方式：**方式 A（使用 `SimpleController` + `ControllerRecord.register`，可绑定原版方块或任意方块）** 与 **方式 B（让自定义方块类直接实现 `IController` 接口）**。

```java
package com.example.mymod.multiblock;

import com.example.mymod.MyMod;
import com.example.mymod.data.ModMultiblockDefinitions;
import dev.anvilcraft.lib.v2.multiblock.dynamic.DynamicMultiblockManager;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.ControllerRecord;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.IController;
import dev.anvilcraft.lib.v2.multiblock.dynamic.controller.SimpleController;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

public final class ModMultiblockControllers {
    private ModMultiblockControllers() {
    }

    /**
     * 方式 A：在模组初始化时通过 ControllerRecord.register 注册 SimpleController
     * 优点：可以为原版方块（如熔炉、发射器）赋予多方块控制器能力，且同一个方块可绑定多个不同 definitionId
     */
    public static void init() {
        ControllerRecord.register(new SimpleController(
            Blocks.FURNACE,
            ModMultiblockDefinitions.BLAST_KILN.identifier()
        ) {
            @Override
            public void onFormed(Level level, MultiblockState state) {
                BlockPos controllerPos = state.getControllerPos();
                MyMod.LOGGER.info("鼓风窑已在 {} 成形 (客户端={})", controllerPos, level.isClientSide());
            }

            @Override
            public void onUnformed(Level level, MultiblockState state) {
                BlockPos controllerPos = state.getControllerPos();
                MyMod.LOGGER.info("鼓风窑已在 {} 解体 (客户端={})", controllerPos, level.isClientSide());
            }
        });
    }

    /**
     * 方式 B：让自定义控制器方块直接实现 IController 接口
     * ControllerRecord.get 在查不到显式注册记录时，会自动检测 block instanceof IController 并缓存
     */
    public static class PillarCoreBlock extends Block implements IController {
        public PillarCoreBlock(Properties properties) {
            super(properties);
        }

        @Override
        public Block getBlock() {
            return this;
        }

        @Override
        public Identifier getDefinitionId() {
            return ModMultiblockDefinitions.BEACON_PILLAR.identifier();
        }

        @Override
        public void onFormed(Level level, MultiblockState state) {
            // 双端都会在成形时调用（服务端检测通过时调用，客户端收到 MultiblockFormPacket 时调用）
        }

        @Override
        public void onUnformed(Level level, MultiblockState state) {
            // 双端都会在解体时调用
        }
    }

    /**
     * 在任意位置查询某个控制器坐标当前是否已成形
     */
    public static boolean isMultiblockActive(Level level, BlockPos controllerPos) {
        MultiblockState state = DynamicMultiblockManager.get(level).getAt(controllerPos);
        return state != null && state.isFormed();
    }
}
```

---

## 三、 公开类与接口 API 详解

### 1. `IController` 与 `SimpleController`（控制器接口与抽象基类）

位于 `dev.anvilcraft.lib.v2.multiblock.dynamic.controller`。

| 方法 / 构造器签名 | 默认实现 | 说明 |
| :--- | :--- | :--- |
| `Block getBlock()` | — | 返回该控制器绑定的方块实例。 |
| `Identifier getDefinitionId()` | — | 返回该控制器绑定的 `MultiblockDefinition` 注册名 ID（即 `ResourceKey#identifier()`）。 |
| `default void onFormed(Level level, MultiblockState state)` | 空实现 `{}` | 当多方块状态从 `unformed` 变为 `formed`（且 `DynamicMultiblockEvent.Form` 未被取消）时触发。**注意**：服务端与客户端（收到 `MultiblockFormPacket` 后）均会触发此回调，若逻辑仅限服务端请判断 `!level.isClientSide()`。 |
| `default void onUnformed(Level level, MultiblockState state)` | 空实现 `{}` | 当多方块状态从 `formed` 变为 `unformed`（且 `DynamicMultiblockEvent.Unform` 未被取消）时触发。双端均会调用。 |
| `default BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state)` | `return pos;` | 在 `DynamicMultiblockManager.onPlace` 放置方块 `state` 于 `pos` 时调用，用于修正控制器坐标（默认返回 `pos` 本身）。 |
| `protected SimpleController(Block block, Identifier definitionId)` | — | `SimpleController` 的受保护构造器，自动实现 `getBlock()` 与 `getDefinitionId()`。 |

### 2. `ControllerRecord` 与 `ControllerInfo`（控制器注册表）

| 类 / 方法签名 | 说明 |
| :--- | :--- |
| `public record ControllerInfo(Block block, Identifier definitionId)` | 控制器查找复合键：由控制器方块 `block` 与多方块定义 ID `definitionId` 共同组成（因此同一个方块可以对应多个不同的多方块结构定义）。 |
| `public static void ControllerRecord.register(SimpleController controller)` | 将 `SimpleController` 实例注册到全局 `CONTROLLERS` 映射表中。 |
| `public static IController ControllerRecord.get(Block block, Identifier definitionId)` | 按 `(block, definitionId)` 查找 `IController`。<br>若未显式调用过 `register`，但 `block instanceof IController` 为真，则自动将其缓存并返回；否则抛出 `IllegalArgumentException("Attempt to get non IController and unregistered block...")`。 |

### 3. `DynamicMultiblockManager`（世界多方块状态管理器）

继承自 `net.minecraft.world.level.saveddata.SavedData`，在服务端持久化保存在世界存档 `data/anvillib_multiblocks.dat`（`SavedDataType` ID 为 `anvillib:multiblocks`），在客户端保存在按 `Level` 弱引用的 `CLIENT_SIDE` 内存映射中。

| 常量 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `DynamicMultiblockManager.CODEC` / `TYPE` | `Codec` / `SavedDataType` | 服务端 `SavedData` 持久化编解码器与类型定义。 |
| `public static DynamicMultiblockManager get(Level level)` | `DynamicMultiblockManager` | 获取指定 `level` 的管理器实例（服务端从 `ServerLevel#getDataStorage()` 加载或创建，客户端从 `WeakHashMap` 获取或创建）。 |
| `public @Nullable MultiblockState getAt(BlockPos pos)` | `@Nullable MultiblockState` | 查询指定控制器坐标 `pos` 处注册的 `MultiblockState`；未注册则返回 `null`。 |
| `public void add(MultiblockState state)` | `void` | 注册一个 `MultiblockState` 并调用 `setDirty()`。 |
| `public @Nullable MultiblockState removeAt(BlockPos pos)` | `@Nullable MultiblockState` | 移除指定控制器坐标处的 `MultiblockState` 并标记 `setDirty()`。 |
| `public boolean containsAt(BlockPos pos)` | `boolean` | 判断 `pos` 是否已注册为多方块控制器。 |
| `public void updateFormed(Level level, MultiblockState cur, boolean formed)` | `void` | 更新 `cur` 的成形状态。若状态发生变化：在服务端校验控制器合法性，发布 `DynamicMultiblockEvent.Form` / `Unform` 事件（若事件被 `setCanceled(true)` 则回滚 `formed` 状态），调用 `controller.onFormed` / `onUnformed`，并向当前维度所有在线玩家广播 `MultiblockFormPacket` / `MultiblockUnformPacket`。 |
| `public static void onPlace(ServerLevel level, BlockPos pos, BlockState state)` | `void` | 方块放置时的处理入口（由 `BlockEventListener` 自动调用）。 |
| `public static void onBreak(Level level, BlockPos pos)` | `void` | 方块破坏时的处理入口（由 `BlockEventListener` 自动调用）。 |
| `public static void checkMultiblockFormed(@Nullable ServerLevel level)` | `void` | 服务端每 Tick 周期性异步检测入口（由 `BlockEventListener` 自动调用）。 |
| `public static void shutdownExecutor()` | `void` | 关闭后台检测线程池并等待最多 5 秒（在 `ServerStoppedEvent` 时自动调用）。 |

### 4. `MultiblockState`、`MultiblockPart` 与 `MultiblockCheckSnapshot`

| 类名 | 关键常量 / 构造器 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `MultiblockState` | `DEFINITION_KEY_CODEC` / `DEFINITION_KEY_STREAM_CODEC`<br>`CODEC` (`MapCodec<MultiblockState>`)<br>`STREAM_CODEC` (`StreamCodec<RegistryFriendlyByteBuf, MultiblockState>`)<br>`public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey)`<br>`public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey, boolean formed)`<br>`public BlockPos getControllerPos()`<br>`public ResourceKey<MultiblockDefinition> getDefinitionKey()`<br>`public boolean isFormed()` / `setFormed(boolean)`<br>`public MultiblockCheckSnapshot getSnapshot()` / `setSnapshot(...)`<br>`public Holder.Reference<MultiblockDefinition> getDefinition(HolderLookup.Provider registries)` | 表示世界中单个多方块实例的状态。<br>注意：`STREAM_CODEC` 传输 `controllerPos`（`VAR_INT_BLOCK_POS`）与 `definitionKey`。 |
| `MultiblockPart` | `public record MultiblockPart(MultiblockState state, Vec3i partPos)` | 将多方块状态 `state` 与构件局部偏移 `partPos` 关联的轻量记录。 |
| `MultiblockCheckSnapshot` | `public record MultiblockCheckSnapshot(BlockPos controllerPos, Map<BlockPos, Entry> entries)`<br>`public boolean test()`<br>`public record Entry(@Nullable BlockState blockState, @Nullable CompoundTag entityNbt, BlockStatePredicate predicate)` | 供后台工作线程无锁执行多方块结构检测的快照。若某个组成方块所在的区块未加载（`!level.isLoaded(pos)`），会沿用上一次快照的 `Entry`；若从未加载过（`blockState == null`），`Entry#test()` 默认返回 `true`，防止跨区块多方块在边缘区块未加载时误触发解体。 |
