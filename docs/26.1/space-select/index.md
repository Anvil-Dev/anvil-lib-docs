# Space Select 空间区域选择：选区模型与物品接入 (`module.space-select`)

<BranchContextCard branch="26.1" />

`module.space-select`（构件名 `anvillib-space-select-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.space_select`）提供了一套开箱即用的**三维长方体空间区域（`District`）交互选择、客户端线框预览、滚轮缩放/平移以及服务端同步**工具库，适用于区域建造杖、领地圈地工具、多方块蓝图采样器等需要对角点选区的物品。

本模块按功能拆分为 2 篇子文档：
- **本篇（选区数据模型、管理器与 `SpaceSelectItem` 接入）**：详解 `AnvilLibSpaceSelect`、`District`、`DistrictManager`、`DistrictManager.DistrictKey` 与 `SpaceSelectItem`。
- **[客户端渲染、滚轮微调与服务端事件同步](./client-and-events)**：详解 `ClientDistrictManager`、`DistrictRenderer`、`SpaceSelectScrollHandler`、`PlayerCreateDistrictEvent` 与 `SpaceSelectPayload`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `space-select` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0")
}
```

---

## 二、 核心工作流与完整代码示例

### 1. 玩家选区交互流程是怎样的？

1. 让你的自定义物品类实现 **`SpaceSelectItem`** 接口；
2. 当玩家在客户端右键方块（如重写 `Item#useOn`）时，在客户端调用 `this.select(player, clickedPos)`：
   - **第 1 次点击**：`ClientDistrictManager#startSelect` 记录起点 `startPos`，此时随着玩家准星移动，`DistrictRenderer` 会实时渲染从 `startPos` 到准星所指方块的动态预览线框（`tempDistrict`）；
   - **第 2 次点击**：`ClientDistrictManager#endSelect` 锁定终点 `endPos`，在客户端生成规范化选区 `District.create(start, end)`，并立即向服务端发送 `SpaceSelectPayload`；
3. 服务端收到 `SpaceSelectPayload` 后发布 `PlayerCreateDistrictEvent`，内置的 `PlayerCreateDistrictEventHandler` 自动回调手持物品的 **`SpaceSelectItem#onCreateDistrict(player, itemStack, start, end)`**！
4. 在客户端已选定区域后，玩家手持该物品按住 **`Ctrl + 鼠标滚轮`** 可沿视线主轴伸缩选区表面，按住 **`Alt + 鼠标滚轮`** 可沿视线方向整体平移选区！

### 2. 完整代码示例：实现一把蓝图区域选择手杖

```java
package com.example.mymod.item;

import dev.anvilcraft.lib.v2.space_select.SpaceSelectItem;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

public class RegionSelectorWandItem extends Item implements SpaceSelectItem {
    public RegionSelectorWandItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Player player = context.getPlayer();
        if (player == null) return InteractionResult.PASS;

        Level level = context.getLevel();
        BlockPos clickedPos = context.getClickedPos();

        if (level.isClientSide()) {
            if (player.isSecondaryUseActive()) {
                // 潜行右键：取消当前选区
                this.cancel(player);
            } else {
                // 普通右键：第 1 次点击设为起点，第 2 次点击设为终点并上报服务端
                this.select(player, clickedPos);
            }
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * 当玩家完成两点选区后，在服务端主线程自动触发此回调
     */
    @Override
    public void onCreateDistrict(Player player, ItemStack itemStack, BlockPos start, BlockPos end) {
        int sizeX = Math.abs(end.getX() - start.getX()) + 1;
        int sizeY = Math.abs(end.getY() - start.getY()) + 1;
        int sizeZ = Math.abs(end.getZ() - start.getZ()) + 1;

        player.displayClientMessage(
            Component.literal("已选定区域: " + start.toShortString() + " -> " + end.toShortString()
                + " (" + sizeX + "x" + sizeY + "x" + sizeZ + ")"),
            true
        );
    }
}
```

---

## 三、 公开类与接口 API 详解

### 1. `District`（三维轴对齐长方体选区记录）

```java
public record District(BlockPos.MutableBlockPos start, BlockPos.MutableBlockPos end)
```

`start` 恒保存最小坐标角点 `(minX, minY, minZ)`，`end` 恒保存最大坐标角点 `(maxX, maxY, maxZ)`。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static District create(BlockPos start, BlockPos end)` | `District` | 将任意两个对角点按各轴 `min` / `max` 规范化后创建 `District`。 |
| `public void expand(Direction direction, int size)` | `void` | 沿指定朝向 `direction` 向外扩展选区边界 `size` 格（若 `direction` 为负方向则减小 `start`，为正方向则增大 `end`）。 |
| `public void contraction(Direction direction, int size)` | `void` | 沿指定朝向收缩选区边界 `size` 格。 |
| `public void move(Direction direction, int step)` | `void` | 将整個选区（`start` 与 `end`）沿 `direction` 方向整体平移 `step` 格。 |
| `public void scaleOnAxis(Direction.Axis axis, int scrollAmount, Vec3 playerPos, AABB boundingBox, Vec3 lookAngle)` | `void` | 根据玩家当前位置与视线方向，智能判断要推拉选区在 `axis` 轴上的哪一侧表面（若玩家在选区内则推拉视线前方的面；若在选区外则推拉离玩家较近的面），并保证 `start <= end` 不翻转。 |
| `public static Direction.Axis getPrimaryAxis(Vec3 lookAngle)` | `Direction.Axis` | 返回视线向量 `lookAngle` 绝对值分量最大的主轴（`X`、`Y` 或 `Z`）。 |
| `public boolean contains(double x, double y, double z)` | `boolean` | 判断点 `(x, y, z)` 是否落在 `[start, end]` 闭区间内。 |
| `public VoxelShape shape()` | `VoxelShape` | 返回从 `(0, 0, 0)` 到 `(dx + 1, dy + 1, dz + 1)` 的相对包围体素形状（供渲染器配合 `start` 原点绘制线框）。 |
| `public int color()` | `int` | 基于当前选区 `hashCode()` 确定性生成 Alpha 为 `102/255`（约 40% 不透明度）的 ARGB 颜色值。 |

### 2. `SpaceSelectItem`（选区工具物品接口）

位于 `dev.anvilcraft.lib.v2.space_select.SpaceSelectItem`。

| 方法签名 | 默认实现与说明 |
| :--- | :--- |
| `default void select(Player player, BlockPos pos)` | （客户端调用）检查玩家主手或副手是否持有 `SpaceSelectItem`：若当前手位尚未开始选区（`!isSelecting`），则调用 `startSelect` 记录第一个角点；若已在选区中，则调用 `endSelect` 完成选区并自动发送 `SpaceSelectPayload` 到服务端。 |
| `default void cancel(Player player)` | （客户端调用）清除玩家主手与副手槽位关联的正在进行或已完成的选区。 |
| `default void onCreateDistrict(Player player, ItemStack itemStack, BlockPos start, BlockPos end)` | 默认为空实现。当客户端完成选区上报服务端、触发 `PlayerCreateDistrictEvent` 时，由 `PlayerCreateDistrictEventHandler` 在**服务端主线程**调用。 |

### 3. `DistrictManager` 与 `DistrictManager.DistrictKey`

| 类 / 记录 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `DistrictManager` | • `public Map<DistrictKey, District> getDistrictMap()`<br>• `public void select(DistrictKey districtKey, District district)`<br>• `public void clear(DistrictKey districtKey)` | 按手位槽位键 `DistrictKey` 存储当前选区 `District` 的基类。 |
| `DistrictManager.DistrictKey` | `public record DistrictKey(int slot, boolean offhand, Item item)`<br>`public boolean check(@Nullable Player player)` | 绑定玩家快捷栏槽位序号 `slot`（副手固定为 `-1, offhand = true`）与物品类型 `item`。`check(player)` 用于校验玩家当前对应手位槽位上是否仍然拿着该 `SpaceSelectItem`。 |
