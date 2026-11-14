# 多方块事件与网络同步包 (`DynamicMultiblockEvent` / `network`)

<BranchContextCard branch="26.2" />

除了通过 `IController#onFormed` 与 `onUnformed` 处理自身多方块逻辑外，其他模组或子系统还可以通过 NeoForge 事件总线监听甚至拦截任意动态多方块的成形与解体过程。本篇详解 `DynamicMultiblockEvent` 事件体系、内置的世界事件监听器 `BlockEventListener` 以及服务端向客户端广播的同步数据包。

---

## 一、 `DynamicMultiblockEvent` 事件详解与用法

### 1. 事件触发时机与取消语义

`DynamicMultiblockEvent` 挂载在 **`NeoForge.EVENT_BUS`**（游戏全局事件总线）上，包含两个可取消（`ICancellableEvent`）的子类：

- **`DynamicMultiblockEvent.Form`**：
  - **触发时机**：当多方块结构通过了所有位置的方块谓词检测、即将把状态切换为 `formed = true` 并调用 `controller.onFormed(level, state)` **之前**触发；
  - **双端触发**：服务端在 `DynamicMultiblockManager#updateFormed` 中触发；客户端在收到 `MultiblockFormPacket` 后也会触发；
  - **取消效果（`event.setCanceled(true)`）**：阻止该多方块成形，状态被强制重置回 `formed = false`，不会调用 `controller.onFormed`，服务端也不会向客户端发送 `MultiblockFormPacket`。
- **`DynamicMultiblockEvent.Unform`**：
  - **触发时机**：当已成形的多方块因结构被破坏或周期复检失败、即将切换为 `formed = false` 并调用 `controller.onUnformed(level, state)` **之前**触发；
  - **双端触发**：服务端在 `DynamicMultiblockManager#updateFormed` 中触发；客户端在收到 `MultiblockUnformPacket` 后也会触发；
  - **取消效果（`event.setCanceled(true)`）**：阻止该多方块解体，状态保持 `formed = true`，不会调用 `controller.onUnformed`，服务端也不会向客户端发送 `MultiblockUnformPacket`。

### 2. 完整代码示例：监听并按条件拦截多方块成形

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import com.example.mymod.data.ModMultiblockDefinitions;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.event.DynamicMultiblockEvent;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class MultiblockProtectionHandler {
    private MultiblockProtectionHandler() {
    }

    @SubscribeEvent
    public static void onMultiblockForm(DynamicMultiblockEvent.Form event) {
        Level level = event.getLevel();
        MultiblockState state = event.getState();

        // 仅针对特定多方块定义进行额外环境检查
        if (state.getDefinitionKey().equals(ModMultiblockDefinitions.BLAST_KILN)) {
            BlockPos pos = state.getControllerPos();
            // 例如：禁止在下界维度成形
            if (level.dimension() == Level.NETHER) {
                event.setCanceled(true);
            }
        }
    }

    @SubscribeEvent
    public static void onMultiblockUnform(DynamicMultiblockEvent.Unform event) {
        Level level = event.getLevel();
        if (!level.isClientSide()) {
            MyMod.LOGGER.debug(
                "多方块 {} 在 {} 解体",
                event.getController().getDefinitionId(),
                event.getState().getControllerPos()
            );
        }
    }
}
```

### 3. `DynamicMultiblockEvent` API 签名表

| 类 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public abstract class DynamicMultiblockEvent extends Event` | — | 动态多方块事件抽象基类。 |
| `public Level getLevel()` | `Level` | 获取多方块所在的世界实例（可能是 `ServerLevel` 或 `ClientLevel`）。 |
| `public IController getController()` | `IController` | 获取该多方块对应的控制器实例。 |
| `public MultiblockState getState()` | `MultiblockState` | 获取当前多方块的状态对象（可读取 `getControllerPos()` 与 `getDefinitionKey()`）。 |
| `public static class Form extends DynamicMultiblockEvent implements ICancellableEvent` | — | 多方块尝试成形事件（可取消）。 |
| `public static class Unform extends DynamicMultiblockEvent implements ICancellableEvent` | — | 多方块尝试解体事件（可取消）。 |

---

## 二、 内置监听器与网络同步包（`@ApiStatus.Internal`）

以下类由 `module.multiblock` 自动注册和驱动，下游模组无需手动调用：

### 1. `BlockEventListener`（`dev.anvilcraft.lib.v2.multiblock.event.BlockEventListener`）

| 监听事件与方法签名 | 行为说明 |
| :--- | :--- |
| `onPlace(BlockEvent.EntityPlaceEvent event)` | 当在服务端世界放置方块时，调用 `DynamicMultiblockManager.onPlace(level, event.getPos(), event.getState())`。 |
| `onBreak(BreakBlockEvent event)` | 当世界中有方块被破坏时，调用 `DynamicMultiblockManager.onBreak(level, event.getPos())`。 |
| `onServerTick(LevelTickEvent.Post event)` | 在服务端每个维度 Tick 结束时，调用 `DynamicMultiblockManager.checkMultiblockFormed(serverLevel)` 执行周期性异步快照检测。 |
| `onServerStopped(ServerStoppedEvent event)` | 在服务器停止时调用 `DynamicMultiblockManager.shutdownExecutor()` 回收后台检测线程池。 |

### 2. `MultiblockFormPacket` 与 `MultiblockUnformPacket`（`dev.anvilcraft.lib.v2.multiblock.network`）

这两个网络包所在包标注了 `@Network`（协议为 `PacketProtocol.PLAY`），在 `AnvilLibMultiblock.onNetwork` 中通过 `NetworkRegistrar.register(registrar, AnvilLibMultiblock.MOD_ID)` 自动注册：

| 类名 | Payload ID | 方向与客户端处理行为 (`handleOnClient`) |
| :--- | :--- | :--- |
| `MultiblockFormPacket(MultiblockState state)` | `anvillib:multiblock_form` | `IClientboundPacket`（服务端 → 客户端）。客户端收到后将 `state` 加入客户端 `DynamicMultiblockManager`，标记 `formed = true`，校验控制器后在客户端触发 `DynamicMultiblockEvent.Form` 与 `controller.onFormed(level, state)`。 |
| `MultiblockUnformPacket(MultiblockState state)` | `anvillib:multiblock_unform` | `IClientboundPacket`（服务端 → 客户端）。客户端收到后将客户端管理器中的 `state` 标记为 `formed = false`，校验控制器后在客户端触发 `DynamicMultiblockEvent.Unform` 与 `controller.onUnformed(level, state)`。 |
