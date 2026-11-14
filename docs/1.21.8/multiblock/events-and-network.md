# 多方块生命周期事件与网络同步 (`event` / `network`)

<BranchContextCard branch="1.21.8" />

当一座多方块结构在服务端成形或解体时，除了调用 `IController#onFormed` / `onUnformed` 之外，`DynamicMultiblockManager` 还会在 NeoForge 主事件总线（`NeoForge.EVENT_BUS`）上发布**可取消（`ICancellableEvent`）**的生命周期事件，并自动向客户端同步状态变更数据包。

---

## 一、 完整代码示例：监听并按条件拦截多方块成形事件

例如，你希望规定某座多方块祭坛只有在满足特定环境条件时才能成功成形，可以通过监听 **`DynamicMultiblockEvent.Form`** 并调用 `event.setCanceled(true)` 阻止其成形：

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import com.example.mymod.multiblock.ModMultiblockControllers;
import dev.anvilcraft.lib.v2.multiblock.dynamic.MultiblockState;
import dev.anvilcraft.lib.v2.multiblock.dynamic.event.DynamicMultiblockEvent;
import net.minecraft.world.level.Level;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class MultiblockEventHandlers {
    private MultiblockEventHandlers() {
    }

    @SubscribeEvent
    public static void onMultiblockForm(DynamicMultiblockEvent.Form event) {
        Level level = event.getLevel();
        MultiblockState state = event.getState();

        // 判断是否为我们关心的高炉多方块定义
        if (state.getDefinitionKey().location().equals(ModMultiblockControllers.BLAST_FURNACE_ID)) {
            // 示例：若控制器上方被水淹没，则拦截成形
            if (level.isWaterAt(state.getControllerPos().above())) {
                event.setCanceled(true);
            }
        }
    }

    @SubscribeEvent
    public static void onMultiblockUnform(DynamicMultiblockEvent.Unform event) {
        MultiblockState state = event.getState();
        MyMod.LOGGER.info(
            "多方块 {} 在坐标 {} 解体",
            state.getDefinitionKey().location(),
            state.getControllerPos()
        );
    }
}
```

---

## 二、 多方块事件 API 详解 (`dev.anvilcraft.lib.v2.multiblock.dynamic.event`)

所有 `DynamicMultiblockEvent` 均继承自 NeoForge `LevelEvent`，发布在 **`NeoForge.EVENT_BUS`**（游戏事件总线）上。

| 事件类名 | 是否可取消 (`ICancellableEvent`) | 触发时机与取消后果 | 公开 Getter 方法 |
| :--- | :---: | :--- | :--- |
| **`DynamicMultiblockEvent`** | — | 抽象基类。 | • `public Level getLevel()`<br>• `public IController getController()`<br>• `public MultiblockState getState()` |
| **`DynamicMultiblockEvent.Form`** | **是** | 当多方块检测通过、即将回调 `controller.onFormed(level, state)` 前在服务端触发。<br>**取消后果**：若 `event.setCanceled(true)`，则将 `state.setFormed(false)` 还原为未成形，跳过 `controller.onFormed` 且不向客户端发送 `MultiblockFormPacket`。 | 同上 |
| **`DynamicMultiblockEvent.Unform`** | **是** | 当多方块因方块破坏或周期复检失败、即将回调 `controller.onUnformed(level, state)` 前在服务端触发。<br>**取消后果**：若 `event.setCanceled(true)`，则将 `state.setFormed(true)` 保持为已成形，跳过 `controller.onUnformed` 且不发送 `MultiblockUnformPacket`。 | 同上 |

---

## 三、 内置世界事件监听器与同步网络包 (`@ApiStatus.Internal`)

### 1. `BlockEventListener`（`dev.anvilcraft.lib.v2.multiblock.event.BlockEventListener`）

框架已自动通过 `@EventBusSubscriber(modid = AnvilLibMultiblock.MOD_ID)` 注册了以下世界监听器，下游模组无需重复绑定：

| 监听事件 | 内部行为说明 |
| :--- | :--- |
| `BlockEvent.EntityPlaceEvent` | 当方块在 `ServerLevel` 被放置时，自动调用 `DynamicMultiblockManager.onPlace(serverLevel, pos, placedBlock)`。 |
| `BlockEvent.BreakEvent` | 当方块在 `ServerLevel` 被破坏时，自动调用 `DynamicMultiblockManager.onBreak(serverLevel, pos)`。 |
| `LevelTickEvent.Post` | 每服务端世界 Tick 结束时，自动调用 `DynamicMultiblockManager.checkMultiblockFormed(serverLevel)` 驱动异步成形/解体检测。 |
| `ServerStoppedEvent` | 服务器停止时，自动调用 `DynamicMultiblockManager.shutdownExecutor()` 安全关闭异步检测线程池。 |

### 2. 客户端同步数据包 (`dev.anvilcraft.lib.v2.multiblock.network`)

这两个数据包标注了 `@ApiStatus.Internal` 并实现 `IClientboundPacket`，由 `AnvilLibMultiblock` 经 `@Network` 注解自动注册：

| 数据包记录类 | 通道 ID (`CustomPacketPayload.Type`) | 客户端处理逻辑 (`handleOnClient`) |
| :--- | :--- | :--- |
| **`MultiblockFormPacket(MultiblockState state)`** | `anvillib:multiblock_form` | 在客户端 `DynamicMultiblockManager.get(level)` 中写入该 `MultiblockState` 并调用 `updateFormed(level, state, true)`。 |
| **`MultiblockUnformPacket(MultiblockState state)`** | `anvillib:multiblock_unform` | 若客户端控制器位置已被破坏成空气，则从客户端管理器中 `removeAt(pos)`；否则将其状态置为 `updateFormed(level, state, false)`。 |
