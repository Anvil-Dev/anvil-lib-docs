# 轮盘模型构建、分页、子菜单与触发回调

`module.wheel`（模组 ID：`anvillib_wheel`）为 NeoForge 1.21.1 提供了一套可配置、带毛玻璃高斯模糊盘面与自定义 GLSL 着色器高亮的径向轮盘菜单框架（`dev.anvilcraft.lib.v2.wheel`）。模块将**纯数据菜单模型（`api` 包）**与**客户端界面/着色器渲染（`client` 包）**完全解耦，本篇介绍菜单模型构建、分页计算、子菜单堆栈与触发回调约定。

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，以避免 NeoForge Maven 未完全同步 Maven Central 导致接口注入或传递元数据异常：

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### 模块常量：`AnvilLibWheel`

包名：`dev.anvilcraft.lib.v2.wheel`

| 成员签名 | 说明 |
| --- | --- |
| `public static final String MOD_ID = "anvillib_wheel"` | 轮盘模块 Mod ID（用于 `@EventBusSubscriber` 与 Shader 注册事件过滤） |
| `public static final String MAIN_ID = "anvillib"` | 资源主命名空间 |
| `static ResourceLocation of(String path)` | 创建 `anvillib:<path>` 资源定位符 |

## 核心交互设计：TAP 与 HOLD 模式行为差异

`WheelOpenMode` 决定了用户如何选择槽位以及**子菜单能否被选中**：

| 模式枚举 | 触发方式 | 子菜单条目 (`submenu`) 行为 |
| --- | --- | --- |
| `WheelOpenMode.TAP` | 点按按键打开轮盘，**鼠标左键点击**确认当前扇区；`ESC` 键优先退回上一级子菜单，若已在根菜单则关闭 | `isSelectable(TAP)` 为 `true`；点击后将子菜单压栈并重置页码到 `0` |
| `WheelOpenMode.HOLD` | 按住按键打开、**松开按键时触发**当前悬停扇区 | `isSelectable(HOLD)` 直接返回 **`false`**，确保按住快切模式下不会意外进入多级交互而无法松手结束 |

> [!IMPORTANT]
> 由于 `HOLD` 模式下带有子菜单的条目不可选中（`entry.isSelectable(WheelOpenMode.HOLD) == false`），若你为同一功能同时提供按住快切与点按浏览模式，请注意合理安排高频直接动作在根菜单前部。

## 完整示例：构建支持图标渲染、子菜单与分页的径向菜单

```java
package com.example.mymod.client.wheel;

import dev.anvilcraft.lib.v2.wheel.api.WheelEntry;
import dev.anvilcraft.lib.v2.wheel.api.WheelEntryRenderer;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuBuilder;
import dev.anvilcraft.lib.v2.wheel.api.WheelMenuModel;
import dev.anvilcraft.lib.v2.wheel.api.WheelSelectionEffect;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.List;

public final class ToolWheelFactory {
    private static WheelEntryRenderer itemIcon(ItemStack icon) {
        return (graphics, pose, width, height) ->
            graphics.renderItem(icon, (width - 16) / 2, (height - 16) / 2);
    }

    public static WheelMenuModel buildToolMenu() {
        return WheelMenuBuilder.create()
            .slotsPerPage(6)
            .deadZone(18)
            .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
            .selectionEffectColor(0xFF4FC3F7)
            .action(
                "mode.mine",
                Component.translatable("wheel.mymod.mine"),
                itemIcon(new ItemStack(Items.IRON_PICKAXE)),
                ctx -> sendModeSwitch("mine", ctx.pageIndex(), ctx.slotIndex())
            )
            .action(
                "mode.build",
                Component.translatable("wheel.mymod.build"),
                itemIcon(new ItemStack(Items.BRICKS)),
                ctx -> sendModeSwitch("build", ctx.pageIndex(), ctx.slotIndex())
            )
            .submenu(
                "shapes",
                Component.translatable("wheel.mymod.shapes"),
                itemIcon(new ItemStack(Items.COMPASS)),
                sub -> sub
                    .action(
                        "shape.cube",
                        Component.literal("3x3 Cube"),
                        itemIcon(new ItemStack(Items.STONE)),
                        ctx -> sendModeSwitch("cube", ctx.pageIndex(), ctx.slotIndex())
                    )
                    .action(
                        "shape.wall",
                        Component.literal("Wall"),
                        itemIcon(new ItemStack(Items.COBBLESTONE_WALL)),
                        ctx -> sendModeSwitch("wall", ctx.pageIndex(), ctx.slotIndex())
                    )
            )
            .action("preset.1", Component.literal("Preset 1"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .action("preset.2", Component.literal("Preset 2"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .action("preset.3", Component.literal("Preset 3"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .action("preset.4", Component.literal("Preset 4"), ctx -> sendModeSwitch(ctx.itemId(), ctx.pageIndex(), ctx.slotIndex()))
            .build();
    }

    public static WheelMenuModel buildStaticModelDirectly() {
        List<WheelEntry> mutable = WheelEntry.mutableCopy(List.of(
            WheelEntry.action("ping", Component.literal("Ping"), ctx -> {}),
            WheelEntry.submenu(
                "tools",
                Component.literal("Tools"),
                List.of(WheelEntry.action("reset", Component.literal("Reset"), ctx -> {}))
            )
        ));
        return WheelMenuModel.of(mutable, 8, 24, WheelSelectionEffect.DOT, 0xFFFABC02);
    }

    private static void sendModeSwitch(String id, int page, int slot) {
        if (Minecraft.getInstance().player != null) {
            Minecraft.getInstance().player.displayClientMessage(
                Component.literal("Triggered " + id + " (page=" + page + ", slot=" + slot + ")"),
                true
            );
        }
    }
}
```

## 公开 API 完整明细

包名：`dev.anvilcraft.lib.v2.wheel.api`

### 1. 枚举与函数式接口

| 类型与签名 | 说明 |
| --- | --- |
| `enum WheelOpenMode` | `TAP`（点按打开、点击触发、支持进入子菜单）、`HOLD`（按住打开、松开触发、禁用子菜单） |
| `enum WheelSelectionEffect` | `DOT`（居中高亮点圆）、`ANNULAR_SECTOR`（扇区环形带高亮，悬停稳定后微幅外扩） |
| `@FunctionalInterface interface WheelEntryAction` | `void trigger(WheelActionContext context)` —— 扇区选中触发回调 |
| `@FunctionalInterface interface WheelEntryRenderer` | `void render(GuiGraphics graphics, PoseStack pose, int width, int height)` —— 绘制扇区中心图标，坐标系已被轮盘平移到该槽位区域 `[0..width, 0..height]` |
| `record WheelActionContext(int pageIndex, int slotIndex, String itemId, WheelOpenMode openMode)` | 传递给 `WheelEntryAction` 的上下文：当前页码（0 起）、当前页内槽位索引、条目 ID、打开模式 |

### 2. `WheelMenuBuilder` 与 `WheelSubmenuBuilder`

> [!NOTE]
> 默认值差异提醒：`WheelMenuBuilder.create()` 的默认配置为 `deadZone = 15`、`selectionEffect = WheelSelectionEffect.ANNULAR_SECTOR`；而直接调用三参或单参 `WheelMenuModel.of(...)` 时默认使用 `deadZone = 30`、`selectionEffect = WheelSelectionEffect.DOT`。

| 方法签名 | 说明 |
| --- | --- |
| `static WheelMenuBuilder create()` | 创建构建器（默认 `slotsPerPage = 8`、`deadZone = 15`、`selectionEffect = ANNULAR_SECTOR`、`selectionEffectColor = 0xFFFABC02`） |
| `WheelMenuBuilder slotsPerPage(int slotsPerPage)` | 设置每页扇区槽位数；`slotsPerPage < 1` 时抛出 `IllegalArgumentException` |
| `WheelMenuBuilder deadZone(int deadZone)` | 设置中心鼠标死区半径（像素） |
| `WheelMenuBuilder selectionEffect(WheelSelectionEffect selectionEffect)` | 设置高亮视觉模式（`DOT` 或 `ANNULAR_SECTOR`） |
| `WheelMenuBuilder selectionEffectColor(int selectionEffectColor)` | 设置高亮 ARGB 颜色 |
| `WheelMenuBuilder action(String id, Component label, WheelEntryAction action)` | 添加无自定义图标的动作条目 |
| `WheelMenuBuilder action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | 添加带自定义图标渲染器的动作条目 |
| `WheelMenuBuilder submenu(String id, Component label, Consumer<WheelSubmenuBuilder> submenuBuilder)` | 添加子菜单条目（在 `Consumer` 内部添加子级 `action`） |
| `WheelMenuBuilder submenu(String id, Component label, WheelEntryRenderer renderer, Consumer<WheelSubmenuBuilder> submenuBuilder)` | 添加带图标的子菜单条目 |
| `WheelMenuModel build()` | 生成不可变 `WheelMenuModel` |
| `WheelSubmenuBuilder action(String id, Component label, WheelEntryAction action)` | 子菜单内部添加动作条目 |
| `WheelSubmenuBuilder action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | 子菜单内部添加带图标动作条目 |

### 3. `WheelEntry`

| 方法签名 | 说明 |
| --- | --- |
| `static WheelEntry action(String id, Component label, WheelEntryAction action)` | 构建动作条目（无渲染器） |
| `static WheelEntry action(String id, Component label, WheelEntryRenderer renderer, WheelEntryAction action)` | 构建带渲染器动作条目 |
| `static WheelEntry submenu(String id, Component label, List<WheelEntry> submenu)` | 构建不可变子菜单条目 |
| `static WheelEntry submenu(String id, Component label, WheelEntryRenderer renderer, List<WheelEntry> submenu)` | 构建带渲染器子菜单条目 |
| `String id()` / `Component label()` | 读取条目标识与居中展示标题 |
| `@Nullable WheelEntryRenderer renderer()` / `@Nullable WheelEntryAction action()` | 获取渲染器与触发回调（占位槽位均为空/无操作） |
| `List<WheelEntry> submenu()` / `boolean hasSubmenu()` | 获取子菜单不可变列表及是否非空 |
| `boolean isPlaceholder()` | 由 Lombok `@Getter` 生成，判断是否为分页补齐用的内部空占位槽位 |
| `boolean isSelectable(WheelOpenMode mode)` | 占位槽位返回 `false`；`HOLD` 模式且 `hasSubmenu()` 返回 `false`；否则当有动作或有子菜单时返回 `true` |
| `static List<WheelEntry> mutableCopy(List<WheelEntry> entries)` | 返回浅拷贝的可变 `ArrayList<WheelEntry>` 供二次拼装 |

### 4. `WheelMenuModel`、`WheelPageModel` 与 `WheelPagination`

| 类 / 方法签名 | 说明 |
| --- | --- |
| `public static final int DEFAULT_SLOTS_PER_PAGE = 8` | 默认每页 8 槽 |
| `public static final int DEFAULT_SELECTION_EFFECT_COLOR = 0xFFFABC02` | 默认琥珀金高亮色 |
| `static WheelMenuModel of(List<WheelEntry> rootEntries)` | `slotsPerPage=8`, `deadZone=30`, `DOT`, `0xFFFABC02` |
| `static WheelMenuModel of(List<WheelEntry> rootEntries, int slotsPerPage, int deadZone)` | 使用 `DOT` 与默认高亮色 |
| `static WheelMenuModel of(List<WheelEntry> rootEntries, int slotsPerPage, int deadZone, WheelSelectionEffect selectionEffect)` | 使用默认高亮色 |
| `static WheelMenuModel of(List<WheelEntry> rootEntries, int slotsPerPage, int deadZone, WheelSelectionEffect selectionEffect, int selectionEffectColor)` | 全参数工厂方法 |
| `List<WheelEntry> rootEntries()` / `int slotsPerPage()` / `int deadZone()` / `WheelSelectionEffect selectionEffect()` / `int selectionEffectColor()` | 只读属性访问器 |
| `int pageCount(List<WheelEntry> entries)` / `int pageCount()` | 计算指定列表或根菜单的总页数（空列表至少返回 1 页） |
| `WheelPageModel page(List<WheelEntry> entries, int pageIndex)` / `WheelPageModel page(int pageIndex)` | 提取第 `pageIndex` 页，不足 `slotsPerPage` 的尾部位置自动填充隐藏的占位 `WheelEntry`（确保扇区角度均匀分割）；越界抛出 `IllegalArgumentException` |
| `record WheelPageModel(int pageIndex, int slotsPerPage, List<WheelEntry> slots)` | 单页快照；构造时校验 `slotsPerPage >= 1` 且 `slots.size() == slotsPerPage` |
| `WheelEntry slot(int slotIndex)` (`WheelPageModel`) | 返回指定索引槽位（可能为 `isPlaceholder() == true` 的占位项） |
| `boolean isSelectable(int slotIndex, WheelOpenMode mode)` (`WheelPageModel`) | 转调目标槽位的 `isSelectable(mode)` |
| `static int WheelPagination.pageCount(int entryCount, int slotsPerPage)` | 分页向上取整工具函数；`entryCount <= 0` 返回 `1`，`slotsPerPage < 1` 抛 `IllegalArgumentException` |
