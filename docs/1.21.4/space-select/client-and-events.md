# 客户端区域渲染、滚轮控制、事件与网络

`module.space-select` 的客户端部分在选区建立与调整过程中会自动接管选区高亮绘制、Ctrl/Alt 滚轮微调以及选区创建网络同步，模组开发者在服务端只需监听 `PlayerCreateDistrictEvent` 即可接收已确认的选区坐标。

## 客户端管理与实时预览：`ClientDistrictManager`

全局单例通过 `AnvilLibSpaceSelectClient.MANAGER` 获取。`ClientDistrictManager` 继承自 `DistrictManager`，额外追踪玩家选点状态：

| 方法 | 说明 |
| --- | --- |
| `isSelecting(DistrictKey key)` | 判断当前手中这把选择器是否已定下起点、正在等待终点 |
| `startSelect(DistrictKey key, BlockPos blockPos)` | 记录第一个角落坐标，进入动态拖拽预览模式 |
| `endSelect(DistrictKey key, BlockPos blockPos)` | 确认第二个角落，组装完整 `District` 并向服务端发送 `SpaceSelectPayload` |
| `clear(DistrictKey key)` | 清除已有选区并重置选中中继状态 |
| `getTempDistrict()` | 返回当前正在选点预览中的临时 `District`（若无则返回 `null`） |

## 客户端视觉呈现与滚轮微调

- **`DistrictRenderer`**：监听 `RenderLevelStageEvent`，在主世界渲染阶段提取玩家当前主/副手对应的已有选区及临时预览选区；在 `SharedConstants.DEBUG_SHAPES` 启用时使用 `ShapeRenderer.renderLineBox(...)`，常规模式下调用 `ShapeRenderer.renderShape(poseStack, buffer, district.shape(), dx, dy, dz, color)` 绘制半透明区域边缘线。
- **`SpaceSelectScrollHandler`**：监听 `InputEvent.MouseScrollingEvent`：
  - 当玩家手持 `SpaceSelectItem` 且按下修饰键滚轮时，通过 `Direction.getApproximateNearest(lookAngle)` 或主坐标轴计算 `scaleOnAxis(...)` / `move(...)`，直接实时缩放或平移当前选区并取消原版快捷栏切格事件。

## 网络协议与服务端事件

### `SpaceSelectPayload` & `AnvilLibSpaceSelectNetwork`

- 通道名称：`anvillib_space_select:space_select`（版本 `"1"`）；
- 携带字段：`BlockPos start` 与 `BlockPos end`（通过 `StreamCodec.composite` 编码）；
- `handleOnServer(Player player)` 执行服务端落点校验并在 NeoForge 事件总线触发 `PlayerCreateDistrictEvent`。

### 监听 `PlayerCreateDistrictEvent` 完整示例

当客户端通过 `endSelect(...)` 确认选区并把数据包发送给服务端后，服务端模组可以监听该事件完成建造、清理或数据绑定：

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.space_select.event.PlayerCreateDistrictEvent;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public class DistrictEventListener {
    @SubscribeEvent
    public static void onDistrictCreated(PlayerCreateDistrictEvent event) {
        Player player = event.getEntity();
        BlockPos start = event.getStart();
        BlockPos end = event.getEnd();

        // 若特定条件不满足，可通过 PlayerEvent 的常规逻辑处理或给出反馈
        if (!player.level().isClientSide()) {
            player.displayClientMessage(
                Component.literal("Selected region from " + start.toShortString() + " to " + end.toShortString()),
                true
            );
        }
    }
}
```
