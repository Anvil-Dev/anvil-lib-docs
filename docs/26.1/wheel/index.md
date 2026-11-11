# Wheel 轮盘菜单客户端 API：构建器与数据模型 (`module.wheel`)

<BranchContextCard branch="26.1" />

`module.wheel`（构件名 `anvillib-wheel-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.wheel`）是一套面向客户端的**径向轮盘菜单（Radial Wheel Menu）API**，内置高斯模糊毛玻璃圆盘背景、2D SDF 分隔环与方向指示器、平滑插值的环扇/发光圆点选中特效、滚轮翻页以及子菜单嵌套支持。

本模块按功能拆分为 2 篇子文档：
- **本篇（轮盘构建器、条目与数据模型）**：详解 `AnvilLibWheel`、`WheelMenuBuilder`（含 `WheelSubmenuBuilder`）、`WheelMenuModel`、`WheelPageModel`、`WheelPagination`、`WheelEntry`、`WheelEntryAction`、`WheelEntryRenderer`、`WheelActionContext`、`WheelOpenMode` 与 `WheelSelectionEffect`。
- **[轮盘控制器、界面与毛玻璃渲染](./controller-and-screen)**：详解 `WheelScreenController`、`WheelScreen`、`WheelWidget`、`WheelFrostedBackground` 及底层渲染管线与状态。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `wheel` 模块（注意 `wheel` 依赖 `module.rendering` 的 `SdfGraphics` 与 `GaussianBlur`）：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-wheel-neoforge-26.1:2.0.0")
}
```

---

## 二、 两种打开模式 (`WheelOpenMode`) 与子菜单限制

`module.wheel` 支持两种经典的轮盘交互模式：

1. **`WheelOpenMode.HOLD`（按住快捷键打开，松开立即触发并关闭）**：
   玩家按住快捷键时弹出轮盘，移动鼠标指向目标扇区，**松开按键瞬间**立即触发当前选中槽位的 `WheelEntryAction` 并关闭轮盘。
   - **重要边界限制**：在 `HOLD` 模式下，带有子菜单的条目（`entry.hasSubmenu() == true`）**不可被选中（`entry.isSelectable(WheelOpenMode.HOLD) == false`）**，因为松开按键会直接关闭界面，无法进入二级子菜单。
2. **`WheelOpenMode.TAP`（点按打开，左键点击触发或进入子菜单）**：
   玩家按一下快捷键打开轮盘（无需一直按住），通过鼠标左键点击扇区：
   - 若点击的是普通动作条目（`action`），则执行动作并关闭轮盘；
   - 若点击的是子菜单条目（`submenu`），则将子菜单压入 `WheelScreen` 的菜单栈（`menuStack`），切换显示子菜单内容（此时按 `ESC` 键可退回上一级菜单，在根菜单按 `ESC` 则关闭界面）！

---

## 三、 完整代码示例：使用 `WheelMenuBuilder` 构建带自定义图标渲染与子菜单的轮盘模型

```java
package com.example.mymod.client.wheel;

import dev.anvilcraft.lib.v2.wheel.api.WheelEntryRenderer;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuBuilder;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.api.WheelSelectionEffect;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public final class ToolModeWheelMenus {
    private ToolModeWheelMenus() {
    }

    /**
     * 辅助方法：构建一个在扇区中心绘制 16x16 物品图标的 WheelEntryRenderer
     */
    public static WheelEntryRenderer itemIcon(ItemStack stack) {
        return (graphics, pose, width, height) -> {
            // 此时 pose 原点已平移到当前扇区图标中心点，向左上偏移 8px 即可居中绘制 16x16 物品
            graphics.item(stack, -8, -8);
        };
    }

    public static WheelMenuModel createMultiToolMenu() {
        return WheelMenuBuilder.create()
            // 每页显示 6 个扇区槽位（超出 6 个条目时自动分页，支持滚轮翻页）
            .slotsPerPage(6)
            // 中心死区半径 18px（鼠标距中心 < 18px 时不选中任何扇区）
            .deadZone(18)
            // 使用平滑插值的环形扇区高亮特效（可选 ANNULAR_SECTOR 或 DOT）
            .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
            .selectionEffectColor(0xFFFABC02)
            // 1. 添加带物品图标的动作条目
            .action(
                "mode_excavate",
                Component.literal("连锁挖掘模式"),
                itemIcon(new ItemStack(Items.DIAMOND_PICKAXE)),
                ctx -> {
                    // ctx 包含 pageIndex, slotIndex, itemId, openMode
                    sendModeChangeToServer(ctx.itemId());
                }
            )
            .action(
                "mode_vein",
                Component.literal("矿脉采集模式"),
                itemIcon(new ItemStack(Items.IRON_ORE)),
                ctx -> sendModeChangeToServer(ctx.itemId())
            )
            // 2. 添加二级子菜单条目（在 TAP 点按模式下点击可展开子菜单）
            .submenu(
                "aoe_size_menu",
                Component.literal("范围挖掘尺寸..."),
                itemIcon(new ItemStack(Items.TNT)),
                sub -> sub
                    .action("aoe_3x3", Component.literal("3×3 范围"), ctx -> sendModeChangeToServer(ctx.itemId()))
                    .action("aoe_5x5", Component.literal("5×5 范围"), ctx -> sendModeChangeToServer(ctx.itemId()))
            )
            .build();
    }

    private static void sendModeChangeToServer(String modeId) {
        // 发送网络包或执行客户端逻辑...
    }
}
```

---

## 四、 公开类、记录与接口 API 详解 (`dev.anvilcraft.lib.v2.wheel.api`)

### 1. `WheelMenuBuilder` 与 `WheelMenuBuilder.WheelSubmenuBuilder`

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static WheelMenuBuilder create()` | `WheelMenuBuilder` | 创建轮盘菜单构建器（默认 `slotsPerPage = 8`、`deadZone = 15`、`selectionEffect = ANNULAR_SECTOR`、`selectionEffectColor = 0xFFFABC02`）。 |
| `public WheelMenuBuilder slotsPerPage(int slotsPerPage)` | `WheelMenuBuilder` | 设置每页扇区槽位数（必须 `>= 1`，否则抛出 `IllegalArgumentException`）。当条目总数不是 `slotsPerPage` 的整数倍时，最后一页不足的槽位会自动填充不可选中的透明占位符 `WheelEntry.placeholder(i)`。 |
| `public WheelMenuBuilder deadZone(int deadZone)` | `WheelMenuBuilder` | 设置轮盘中心死区半径（像素）。 |
| `public WheelMenuBuilder selectionEffect(WheelSelectionEffect effect)` | `WheelMenuBuilder` | 设置选中视觉效果：`WheelSelectionEffect.ANNULAR_SECTOR`（环扇高亮）或 `WheelSelectionEffect.DOT`（SDF 发光圆点）。 |
| `public WheelMenuBuilder selectionEffectColor(int argb)` | `WheelMenuBuilder` | 设置选中特效颜色（ARGB）。 |
| `public WheelMenuBuilder action(String id, Component label, WheelEntryAction action)`<br>`public WheelMenuBuilder action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | `WheelMenuBuilder` | 向根菜单添加一个动作条目（可选自定义图标/内容渲染器 `renderer`）。 |
| `public WheelMenuBuilder submenu(String id, Component label, Consumer<WheelSubmenuBuilder> submenuBuilder)`<br>`public WheelMenuBuilder submenu(String id, Component label, WheelEntryRenderer renderer, Consumer<WheelSubmenuBuilder> submenuBuilder)` | `WheelMenuBuilder` | 向根菜单添加一个二级子菜单条目。`WheelSubmenuBuilder` 提供相同的两个 `action(...)` 重载。 |
| `public WheelMenuModel build()` | `WheelMenuModel` | 构建不可变的 `WheelMenuModel`。 |

### 2. `WheelMenuModel`、`WheelPageModel` 与 `WheelPagination`

| 类名 | 常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `WheelMenuModel` | • `DEFAULT_SLOTS_PER_PAGE = 8`、`DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02`<br>• `public static WheelMenuModel of(List<WheelEntry> rootEntries, ...)`（共 4 个静态工厂重载）<br>• `rootEntries()` / `slotsPerPage()` / `deadZone()` / `selectionEffect()` / `selectionEffectColor()`<br>• `int pageCount()` / `int pageCount(List<WheelEntry> entries)`<br>• `WheelPageModel page(int pageIndex)` / `WheelPageModel page(List<WheelEntry> entries, int pageIndex)` | 不可变轮盘菜单模型。`page(...)` 提取指定页的条目并用 `placeholder` 补齐至 `slotsPerPage` 长度（若 `pageIndex` 越界抛出 `IllegalArgumentException`）。 |
| `WheelPageModel` | `public record WheelPageModel(int pageIndex, int slotsPerPage, List<WheelEntry> slots)`<br>• `public WheelEntry slot(int slotIndex)`<br>• `public boolean isSelectable(int slotIndex, WheelOpenMode mode)` | 单页轮盘数据模型，保证 `slots.size() == slotsPerPage`。 |
| `WheelPagination` | `public static int pageCount(int entryCount, int slotsPerPage)` | 计算分页总页数（当 `entryCount <= 0` 时返回 `1`）。 |

### 3. `WheelEntry`、`WheelEntryAction`、`WheelEntryRenderer` 与 `WheelActionContext`

| 类 / 接口名 | 关键方法签名 | 说明 |
| :--- | :--- | :--- |
| `WheelEntry` | • `static WheelEntry action(String id, Component label, [WheelEntryRenderer renderer,] WheelEntryAction action)`<br>• `static WheelEntry submenu(String id, Component label, [WheelEntryRenderer renderer,] List<WheelEntry> submenu)`<br>• `static List<WheelEntry> mutableCopy(List<WheelEntry> entries)`<br>• `id()` / `label()` / `renderer()` / `action()` / `submenu()` / `hasSubmenu()` / `isPlaceholder()` / `isSelectable(WheelOpenMode mode)` | 单个轮盘槽位条目。 |
| `WheelEntryAction` | `void trigger(WheelActionContext context)` | 槽位触发动作回调。 |
| `WheelEntryRenderer` | `void render(GuiGraphicsExtractor graphics, Matrix3x2fStack pose, int width, int height)` | 槽位自定义图标渲染回调（调用前 `pose` 已平移至该槽位在圆环上的中心坐标）。 |
| `WheelActionContext` | `public record WheelActionContext(int pageIndex, int slotIndex, String itemId, WheelOpenMode openMode)` | 动作触发时的上下文信息。 |
