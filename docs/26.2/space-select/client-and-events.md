# 客户端渲染、滚轮微调与服务端事件同步 (`client` / `event` / `network`)

<BranchContextCard branch="26.2" />

本篇介绍 `module.space-select` 的客户端状态管理器 `ClientDistrictManager`、自动世界线框渲染器 `DistrictRenderer`、快捷键滚轮微调处理器 `SpaceSelectScrollHandler` 以及服务端选区创建事件 `PlayerCreateDistrictEvent`。

---

## 一、 客户端滚轮快捷键交互说明 (`SpaceSelectScrollHandler`)

当玩家在客户端已经完成了一个选区（`ClientDistrictManager#getDistrictMap()` 中存在主手或副手对应槽位的 `District`），且未打开任何 GUI 界面（`mc.gui.screen() == null`）时，`SpaceSelectScrollHandler` 会自动监听 `InputEvent.MouseScrollingEvent`：

| 组合键操作 | 触发效果 |
| :--- | :--- |
| **`Ctrl + 鼠标滚轮上下滚动`** | 沿玩家当前视线的主轴方向（`District.getPrimaryAxis(lookAngle)`）调用 `district.scaleOnAxis(...)` 伸缩选区尺寸（并拦截原版快捷栏滚轮切换 `event.setCanceled(true)`）。 |
| **`Alt + 鼠标滚轮上下滚动`** | 沿玩家当前视线最接近的朝向（`Direction.getApproximateNearest(lookAngle)`）调用 `district.move(dir, scrollAmount)` 整体平移选区位置（并拦截原版快捷栏滚轮切换）。 |

---

## 二、 完整代码示例：监听 `PlayerCreateDistrictEvent` 或在客户端直接读取当前选区

除了在 `SpaceSelectItem#onCreateDistrict` 中处理选区外，你也可以在全局事件总线 `NeoForge.EVENT_BUS` 上监听 `PlayerCreateDistrictEvent`，或者在客户端直接从 `AnvilLibSpaceSelectClient.MANAGER` 查询玩家当前选中的 `District`：

```java
package com.example.mymod.event;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.space_select.District;
import dev.anvilcraft.lib.v2.space_select.DistrictManager;
import dev.anvilcraft.lib.v2.space_select.client.AnvilLibSpaceSelectClient;
import dev.anvilcraft.lib.v2.space_select.event.PlayerCreateDistrictEvent;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import org.jspecify.annotations.Nullable;

@EventBusSubscriber(modid = MyMod.MOD_ID)
public final class DistrictEventExample {
    private DistrictEventExample() {
    }

    /**
     * 在服务端监听任意玩家通过 SpaceSelectItem 创建选区的事件
     */
    @SubscribeEvent
    public static void onPlayerCreateDistrict(PlayerCreateDistrictEvent event) {
        BlockPos start = event.getStart();
        BlockPos end = event.getEnd();
        MyMod.LOGGER.info(
            "玩家 {} 使用 {} 创建了选区: {} -> {}",
            event.getEntity().getScoreboardName(),
            event.getItemStack(),
            start,
            end
        );
    }

    /**
     * 在客户端查询本地玩家主手当前已选定的 District（含经过 Ctrl/Alt+滚轮微调后的最新范围）
     */
    public static @Nullable District getClientMainHandDistrict() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return null;
        DistrictManager.DistrictKey key = new DistrictManager.DistrictKey(
            player.getInventory().getSelectedSlot(),
            false,
            player.getMainHandItem().getItem()
        );
        return AnvilLibSpaceSelectClient.MANAGER.getDistrictMap().get(key);
    }
}
```

---

## 三、 公开类与事件 API 详解

### 1. `AnvilLibSpaceSelectClient` 与 `ClientDistrictManager`

位于 `dev.anvilcraft.lib.v2.space_select.client`。通过 `AnvilLibSpaceSelectClient.MANAGER` 访问客户端全局选区管理器实例（继承自 `DistrictManager`）：

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public boolean isSelecting(DistrictKey districtKey)` | `boolean` | 判断指定手位槽位键是否正处于“已点第 1 个角点、等待点第 2 个角点”的过程中。 |
| `public void startSelect(DistrictKey districtKey, BlockPos blockPos)` | `void` | 记录选区起点 `blockPos` 到 `selectingMap`。 |
| `public void endSelect(DistrictKey districtKey, BlockPos blockPos)` | `void` | 从 `selectingMap` 取出起点，与终点 `blockPos` 构建 `District` 存入 `districtMap`，并向服务端发送 `SpaceSelectPayload`。 |
| `public void clear(DistrictKey districtKey)` | `void` | 同时清除 `districtMap` 和 `selectingMap` 中对应槽位键的记录。 |
| `public @Nullable District getTempDistrict()` | `@Nullable District` | 当玩家手持 `SpaceSelectItem`、处于 `isSelecting` 状态且准星正指着某个方块（`HitResult.Type.BLOCK`）时，实时返回从起点到准星命中方块坐标构成的动态预览选区 `tempDistrict`。 |
| `public Map<DistrictKey, BlockPos> getSelectingMap()` | `Map<DistrictKey, BlockPos>` | 获取正在选区中的起点映射表。 |

### 2. `DistrictRenderer`（客户端选区线框渲染器，`@ApiStatus.Internal`）

| 方法签名 | 说明 |
| :--- | :--- |
| `extractDistricts(ExtractLevelRenderStateEvent event)` | 在提取世界渲染状态阶段采集所有已完成的 `District` 与当前拖拽中的 `tempDistrict`，封装为 `DistrictOutline` 列表写入 `LevelRenderState`（通过 `OUTLINES` `ContextKey`）。 |
| `submitDistricts(SubmitCustomGeometryEvent event)` / `renderDistrict(SubmitNodeCollector collector, PoseStack poses, LevelRenderState state)` | 监听 `SubmitCustomGeometryEvent`，读取提取的轮廓列表并通过 `collector.submitShapeOutline(...)` 与 `RenderTypes.lines()` 提交绘制每个 `District` 的包围盒轮廓。 |

### 3. `PlayerCreateDistrictEvent` 与 `SpaceSelectPayload`

| 类名 | 字段 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`PlayerCreateDistrictEvent`** | • `public Player getEntity()`（继承自 `PlayerEvent`）<br>• `public ItemStack getItemStack()`<br>• `public BlockPos getStart()`<br>• `public BlockPos getEnd()` | 挂载在 `NeoForge.EVENT_BUS` 上。当服务端收到客户端发来的 `SpaceSelectPayload` 时触发；内置监听器 `PlayerCreateDistrictEventHandler` 监听该事件并在 `itemStack.getItem() instanceof SpaceSelectItem` 时调用 `item.onCreateDistrict(player, itemStack, start, end)`。 |
| `SpaceSelectPayload` | `public record SpaceSelectPayload(boolean offhand, BlockPos start, BlockPos end) implements IServerboundPacket` | （`@ApiStatus.Internal`）客户端向服务端上报选区结果的单向数据包（通道 ID `anvillib_space_select:space_select`）。 |
