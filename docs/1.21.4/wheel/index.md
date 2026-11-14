# 轮盘模型构建、分页、子菜单与触发回调

`module.wheel` 是一套专为径向快捷轮盘菜单设计的客户端组件库，支持多级子菜单嵌套、自动分页、鼠标死区屏蔽、多种高亮效（点状光标或扇环片着色）以及可复用自定义渲染槽位。

## 模块信息

- 模组 ID：`anvillib_wheel`（`AnvilLibWheel.MOD_ID`）
- 主命名空间：`anvillib`（`AnvilLibWheel.MAIN_ID`，用于核心内置着色器及共享资源路径 `AnvilLibWheel.of(...)`）

## 核心概念一览

| 类型 | 职责 |
| --- | --- |
| `WheelMenuBuilder` / `WheelSubmenuBuilder` | 流式 DSL，声明所有根动作槽位 (`action`)、嵌套子菜单 (`submenu`)、分页容量与高亮样式 |
| `WheelMenuModel` | 编译后的不可变菜单模型，提供总页数计算与按页切片功能 (`WheelPageModel`) |
| `WheelEntry` | 轮盘上的单个条目（叶子动作条目或展开子菜单的入口节点） |
| `WheelEntryAction` | 选中确认并释放触发时的业务逻辑回调接口，接收 `WheelActionContext` |
| `WheelEntryRenderer` | 扇区内容自定义渲染器，用于在对应槽位中心画图标、物品或徽标 |
| `WheelOpenMode` | 轮盘开启交互模式枚举（通常为“点击切换 `TAP`”与“长按松手触发 `HOLD`”） |
| `WheelSelectionEffect` | 选中高亮样式枚举（例如中心光点 `DOT` 或全扇环片高亮 `ANNULAR_SECTOR`） |
| `WheelPagination` | 独立分页工具函数 `pageCount(int entryCount, int slotsPerPage)` |
| `MathUtil` (`dev.anvilcraft.lib.v2.wheel.util.MathUtil`) | 轮盘角度旋转、向量夹角、区间检测与阶乘缓存等专用客户端几何数学库 |

## `WheelMenuBuilder` 与 `WheelEntry` API 参考

### `WheelMenuBuilder`

默认配置常量：`WheelMenuModel.DEFAULT_SLOTS_PER_PAGE = 8`，`WheelMenuModel.DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02`。

| 方法签名 | 返回类型 | 说明 |
| --- | --- | --- |
| `WheelMenuBuilder.create()` | `WheelMenuBuilder` | 初始化空构建器 |
| `slotsPerPage(int slotsPerPage)` | `WheelMenuBuilder` | 设定每页最多展示多少个扇区（超出自动分页） |
| `deadZone(int deadZone)` | `WheelMenuBuilder` | 设定轮盘中心无响应鼠标死区半径（单位像素） |
| `selectionEffect(WheelSelectionEffect effect)` | `WheelMenuBuilder` | 选择命中扇区视觉反馈形式 |
| `selectionEffectColor(int argb)` | `WheelMenuBuilder` | 设置高亮图形颜色（ARGB） |
| `action(String id, Component label, WheelEntryAction action)` | `WheelMenuBuilder` | 追加普通文本动作条目 |
| `action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | `WheelMenuBuilder` | 追加带自定义图标渲染器的动作条目 |
| `submenu(String id, Component label, Consumer<WheelSubmenuBuilder> submenu)` | `WheelMenuBuilder` | 追加嵌套子菜单分组 |
| `submenu(String id, Component label, WheelEntryRenderer renderer, Consumer<WheelSubmenuBuilder> submenu)` | `WheelMenuBuilder` | 追加带自定义图标的子菜单分组 |
| `build()` | `WheelMenuModel` | 构造不可变轮盘模型 |

### `WheelEntry` 与 `WheelMenuModel`

- **构造工厂**：`WheelEntry.action(id, label[, renderer], action)`、`WheelEntry.submenu(id, label[, renderer], List<WheelEntry>)`、`WheelEntry.mutableCopy(entries)`。
- **元数据读取**：`id()`、`label()`、`renderer()`、`action()`、`submenu()`、`hasSubmenu()`、`isSelectable(WheelOpenMode)`。
- **`WheelMenuModel`**：`WheelMenuModel.of(rootEntries[, slotsPerPage, deadZone[, effect, color]])`、`pageCount()`、`pageCount(entries)`、`page(pageIndex)`、`page(entries, pageIndex)`；返回的 `WheelPageModel` 提供 `slot(int slotIndex)` 与 `isSelectable(int slotIndex, WheelOpenMode mode)`。

### 完整模型构建示例

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.wheel.api.WheelEntryRenderer;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuBuilder;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.api.WheelSelectionEffect;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Items;

public final class ToolWheelMenus {
    public static WheelMenuModel buildToolMenu() {
        return WheelMenuBuilder.create()
            .slotsPerPage(6)
            .deadZone(18)
            .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
            .selectionEffectColor(0x9933BBFF)
            .action(
                "mode_dig",
                Component.literal("Tunnel 3x3"),
                itemIcon(Items.IRON_PICKAXE.getDefaultInstance()),
                ctx -> switchMode("tunnel")
            )
            .action(
                "mode_vein",
                Component.literal("Vein Mine"),
                itemIcon(Items.DIAMOND_PICKAXE.getDefaultInstance()),
                ctx -> switchMode("vein")
            )
            .submenu("presets", Component.literal("More Presets"), sub -> sub
                .action("preset_Silk", Component.literal("Silk Touch"), ctx -> switchMode("silk"))
                .action("preset_fortune", Component.literal("Fortune"), ctx -> switchMode("fortune"))
            )
            .build();
    }

    private static WheelEntryRenderer itemIcon(net.minecraft.world.item.ItemStack stack) {
        return (guiGraphics, x, y, width, height) ->
            guiGraphics.renderItem(stack, Math.round(x + width / 2f - 8), Math.round(y + height / 2f - 8));
    }

    private static void switchMode(String mode) {
        // 发送模组自定义切换数据包或客户端提示
    }
}
```

##  wheel 专用数学工具：`dev.anvilcraft.lib.v2.wheel.util.MathUtil`

`module.wheel` 自带面向极坐标扇区判定的数学静态类，涵盖以下公开方法：
- `rotationDegrees(Vector2f v, float deg)` / `rotate(Vector2f v, float rad)` / `copy(Vector2f v)`：围绕原点旋转二维向量；
- `angle(Vector2f from, Vector2f to)` / `angleDegrees(Vector2f from, Vector2f to)`：计算两个二维向量之间的有符号极角差；
- `safeDivide(float a, float b)`（当 `a == b` 返回 `1`）与 `clampWithProportion(float value, float min, float max)`（周期性环形角度/数值折叠）；
- `isInRange(double value, double min, double max)` 及二维重载 `isInRange(x, y, minX, minY, maxX, maxY)`；
- `dist(BlockPos a, BlockPos b)`、`getDirection(BlockPos from, BlockPos to)`、`fromDelta(int x, int y, int z)`、`factorial(int value)`。
