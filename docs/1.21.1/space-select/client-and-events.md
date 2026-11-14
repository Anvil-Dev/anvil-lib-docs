# 客户端区域渲染、滚轮控制、事件与网络

本篇说明 `module.space-select` 的客户端状态管理、渲染与键鼠滚轮交互机制，以及用于自定义响应的服务端事件与网络载荷。

## 客户端交互与渲染流程

### 1. 状态管理器 (`AnvilLibSpaceSelectClient` & `ClientDistrictManager`)

在 `Dist.CLIENT` 下，`AnvilLibSpaceSelectClient.MANAGER` 维护一个全局 `ClientDistrictManager` 单例，扩展了 `DistrictManager` 并额外跟踪两类临时状态：

- **`selectingMap` (`Map<DistrictKey, BlockPos>`)**：保存玩家点击第一下之后尚未确认终点的“正在框选起点”。
- **`tempDistrict` (`District`)**：复用单个可变 `District` 实例，每帧根据玩家当前主/副手正在框选的起点与准星命中的方块（`Minecraft.hitResult` 为 `HitResult.Type.BLOCK` 时）实时更新并返回临时预览框。

### 2. 自动世界渲染 (`DistrictRenderer`)

`DistrictRenderer` 在 `RenderLevelStageEvent.Stage.AFTER_PARTICLES` 阶段自动运行，每帧收集 `AnvilLibSpaceSelectClient.MANAGER.getDistrictMap().values()` 中所有已选定区域以及 `getTempDistrict()`，使用 `RenderType.lines()` 绘制边界框：
- 在常规模式下按 `district.color()`（Alpha 为 `102 / 255`）调用 `LevelRenderer.renderVoxelShape`。
- 当启用了原版调试开关 `SharedConstants.DEBUG_SHAPES` 时，改为纯白不透明线框 (`LevelRenderer.renderLineBox`)。

开发者也可以在其他自定义 HUD/渲染入口中直接调用其公开方法 `DistrictRenderer.renderDistrict(bufferSource, poseStack, cameraPos)`。

### 3. 滚轮微调选区 (`SpaceSelectScrollHandler`)

当玩家手持有效的 `SpaceSelectItem`、未打开任何 GUI 屏幕（`mc.screen == null`）且已经针对该手持键创建过一个已确认的 `District` 时，模块自动接管以下快捷键并消费滚轮事件（`event.setCanceled(true)`）：

| 组合键 | 操作效果 | 内部调用 |
| --- | --- | --- |
| **`Ctrl` + 滚轮** | 沿当前视线主轴方向放大/缩小选区边界面 | `District.getPrimaryAxis(lookAngle)` -> `district.scaleOnAxis(...)` |
| **`Alt` + 滚轮** | 沿当前视线最近方向整体平移选区位置 | `Direction.getNearest(lookAngle)` -> `district.move(dir, scrollAmount)` |

::: tip 同时按住 `Ctrl` 与 `Alt`
源码中先判断 `if (ctrlDown)` 再 `else` 处理平移；当同时按住 `Ctrl` 与 `Alt` 时会优先执行**缩放**，不会同时平移。
:::

## 服务端事件监听：`PlayerCreateDistrictEvent`

除了实现 `SpaceSelectItem#onCreateDistrict`，任何 Mod 也可以在服务端 Forge/NeoForge 事件总线上独立监听 `PlayerCreateDistrictEvent`（继承自 `PlayerEvent`），以实现统一的区域统计、领地冲突检查或命令录制功能：

```java
package com.example.examplemod.event;

import dev.anvilcraft.lib.v2.space_select.District;
import dev.anvilcraft.lib.v2.space_select.event.PlayerCreateDistrictEvent;
import net.minecraft.world.phys.AABB;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = "examplemod")
public final class DistrictEventsListener {
    @SubscribeEvent
    public static void onDistrictCreated(PlayerCreateDistrictEvent event) {
        // event.getStart() / event.getEnd() 为玩家点击的原始两端坐标，建议使用 District.create 规范化
        District normalized = District.create(event.getStart(), event.getEnd());
        AABB areaBox = AABB.encapsulatingFullBlocks(normalized.start(), normalized.end());
        long blockVolume = (long) areaBox.getXsize() * (long) areaBox.getYsize() * (long) areaBox.getZsize();
        System.out.println(
            event.getEntity().getName().getString() + " 创建了体积为 " + blockVolume + " 格的选区，手持物品：" + event.getItemStack()
        );
    }
}
```

## 公开与内部 API 参考

### `dev.anvilcraft.lib.v2.space_select.client`

| 类 / 成员签名 | 说明 |
| --- | --- |
| `AnvilLibSpaceSelectClient.MANAGER` | `public static final ClientDistrictManager`：客户端全局选区管理器实例 |
| `boolean ClientDistrictManager.isSelecting(DistrictKey key)` | 查询指定手持键当前是否已记录起点、正处于第二次选点等待状态 |
| `void ClientDistrictManager.startSelect(DistrictKey key, BlockPos blockPos)` | 记录框选起点，进入“正在框选”状态 |
| `void ClientDistrictManager.endSelect(DistrictKey key, BlockPos blockPos)` | 完成框选：保存规范化 `District` 并立即向服务端发送 `SpaceSelectPayload` |
| `void ClientDistrictManager.clear(DistrictKey key)` | 同时清除已确认选区与正在框选的起点 |
| `@Nullable District ClientDistrictManager.getTempDistrict()` | 若玩家手持 `SpaceSelectItem` 且有进行中的选区并正指向方块，返回实时动态更新的临时 `District` |
| `Map<DistrictKey, BlockPos> ClientDistrictManager.getSelectingMap()` | 返回所有进行中选区的起点映射（Lombok `@Getter`） |
| `@ApiStatus.Internal DistrictRenderer` | `static void renderDistrict(MultiBufferSource.BufferSource, PoseStack, Vec3 cameraPos)`；自动在 `AFTER_PARTICLES` 阶段绘制全部选区与临时选区 |
| `@ApiStatus.Internal SpaceSelectScrollHandler` | 监听 `InputEvent.MouseScrollingEvent`，提供 `Ctrl` 滚轮缩放与 `Alt` 滚轮平移 |

### `dev.anvilcraft.lib.v2.space_select.event` & `network`

| 类 / 成员签名 | 说明 |
| --- | --- |
| `PlayerCreateDistrictEvent` | 继承自 `PlayerEvent`（带 Lombok `@Getter`）；构造参数 `(Player player, ItemStack itemStack, BlockPos start, BlockPos end)`。提供 `getEntity()`、`getItemStack()`、`getStart()`、`getEnd()` |
| `@ApiStatus.Internal PlayerCreateDistrictEventHandler` | 自动监听 `PlayerCreateDistrictEvent`，若手持物为 `SpaceSelectItem` 则回调其 `onCreateDistrict(...)` |
| `@ApiStatus.Internal AnvilLibSpaceSelectNetwork` | 以协议版本 `"1"` 通过 `NetworkRegistrar` 自动注册模块载荷 |
| `@ApiStatus.Internal SpaceSelectPayload` | `IServerboundPacket` (`record SpaceSelectPayload(boolean offhand, BlockPos start, BlockPos end)`，ID：`anvillib_space_select:space_select`)；服务端接收后立即投递 `PlayerCreateDistrictEvent` |
