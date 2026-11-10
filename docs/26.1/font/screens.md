# 字体配置与测试界面组件 (`dev.anvilcraft.lib.v2.font.screen`)

<BranchContextCard branch="26.1" />

`dev.anvilcraft.lib.v2.font.screen` 与 `dev.anvilcraft.lib.v2.font.data` 包提供了 `anvillib_font` 模块内置的客户端字体选择界面（`FontConfigScreen`）、多样式渲染测试页（`FontTestScreen`）、支持遮挡屏蔽与滚动条拖拽的下拉框控件（`Dropdown`）以及界面语言数据生成器（`AnvilLibFontData`）。

这些类均标记为 `@ApiStatus.Internal`，玩家可通过 NeoForge 模组菜单选中 `AnvilLib Font` 点击“Config”直接进入该界面切换全局 SDF 渲染字体。

---

## 一、 界面组件结构与交互流程

1. **`FontConfigScreen`（字体配置主界面）**：
   - 顶栏实时使用 `guiGraphics.anvillib$centeredText(AnvilLibFont.getSelectFont(), ...)` 渲染当前选中的字体族与具体字重名称，所见即所得；
   - 提供两个联动 `Dropdown` 下拉框：选择上方“字体族（Font Family）”下拉框后，会自动调用 `FontManager.INSTANCE.getFamilyFontNames(family)` 刷新下方“具体字体（Font）”下拉框的候选列表，并立即通过 `AnvilLibFont.CONFIG.setFontFamily` / `setFont` 写入 `config/anvillib/anvillib_font-client.json`；
   - 点击上方 `Font Test` 按钮可打开 `FontTestScreen`。
2. **`FontTestScreen`（多语种多样式测试页）**：
   - 使用当前选定的 SDF 字体集中展示 10 行涵盖简体中文、繁体中文、英文、日文假名、数字与标点符号的测试文本，分别验证红色/绿色/暗紫色、粗体（`withBold`）、斜体（`withItalic`）、粗斜体、下划线（`withUnderlined`）、删除线（`withStrikethrough`）以及动态随机字符混淆（`withObfuscated`）的渲染表现。
3. **`Dropdown`（带遮挡屏蔽区域的滚动下拉框控件）**：
   - 当页面上上下排列多个 `Dropdown` 时，上方展开的下拉列表会覆盖在下方 `Dropdown` 之上。`Dropdown` 通过 `Dropdown.Shielding(x1, y1, x2, y2, dropdown)` 矩形屏蔽区机制通知父界面：当上方下拉框展开时，被其下拉菜单矩形遮挡的其他 `Dropdown` 在 `isMouseOver` 中会自动返回 `false`，防止点击展开项时穿透触发下层控件。

---

## 二、 类与 API 汇总表（`@ApiStatus.Internal`）

### 1. `FontConfigScreen` 与 `FontTestScreen`

| 类名 | 构造器与核心方法 | 说明 |
| :--- | :--- | :--- |
| `FontConfigScreen` | `public FontConfigScreen(final ModContainer ignored, final Screen parent)` | 由 `AnvilLibFont` 通过 `IConfigScreenFactory` 注册到 `ModContainer`。管理字体族下拉框、具体字体下拉框与测试页跳转按钮。 |
| `FontTestScreen` | `protected FontTestScreen(final Screen parent)` | 渲染 10 行不同 `Style` 组合的中英日繁及特殊符号 SDF 测试文本，按 `ESC` 关闭时返回 `FontConfigScreen`。 |

### 2. `Dropdown`（`dev.anvilcraft.lib.v2.font.screen.widget.Dropdown`）

继承自 `net.minecraft.client.gui.components.AbstractWidget`。

| 构造器 / 方法 / 内部记录签名 | 说明 |
| :--- | :--- |
| `public Dropdown(int x, int y, int width, int height, int screenWidth, int screenHeight, Component message)` | 构造下拉框控件，传入屏幕宽高以计算展开列表的最大可用高度。 |
| `public void setAllow(List<DropdownEntry> allows)` | 设置下拉候选条目列表，重置滚动偏移 `scrollOffset = 0`；若原选中值不在新列表中，自动选中第一项（列表为空则置为 `null`）。 |
| `public void setValue(@Nullable DropdownEntry value)` / `setValue(@Nullable String value)` | 按 `DropdownEntry` 或字符串 `id` 设置当前选中项（不会触发 `onValueChanged` 回调）。 |
| `public @Nullable DropdownEntry getValue()` / `public @Nullable String getValueId()` | 获取当前选中的 `DropdownEntry` 或其字符串 `id`。 |
| `public void setOnValueChanged(Consumer<@Nullable DropdownEntry> callback)` | 设置用户点击切换下拉选项时的回调。 |
| `public void setOnShieldingAdd(Consumer<Shielding>)` / `setOnShieldingRemove(Runnable)` / `setShieldingGetter(Supplier<@Nullable Shielding>)` | 绑定展开列表遮挡屏蔽区的注册、移除与查询回调，防止多个下拉框上下叠放时发生鼠标点击穿透。 |
| `public int calcMaxHeight()` | 计算展开列表在屏幕底部剩余空间内的最大高度（向下取整为行高 `getHeight()` 的整数倍，避免底部出现残缺半行）。 |
| `public record DropdownEntry(Component desc, String id)` | 下拉选项数据记录。提供 `DropdownEntry.create(String id)`（使用翻译键 `dropdown.anvillib_font.<id>`）与 `DropdownEntry.create(String desc, String id)`（使用字面量 `Component.literal(desc)`）两个静态工厂。 |
| `public record Shielding(double x1, double y1, double x2, double y2, Dropdown dropdown)` | 记录展开列表占用的屏幕矩形区域。`isShielding(x, y, dropdown)` 对非自身的其他下拉框返回坐标是否落入屏蔽矩形内。 |

### 3. `AnvilLibFontData`（`dev.anvilcraft.lib.v2.font.data.AnvilLibFontData`）

| 类 / 方法签名 | 说明 |
| :--- | :--- |
| `public class AnvilLibFontData` / `public static class AnvilLibFontLanguageProvider extends LanguageProvider` | 监听 `anvillib_font` 的 `GatherDataEvent.Client`，生成配置界面与下拉框无障碍朗读所需的 6 个英文翻译键（`screen.anvillib_font.config`、`screen.anvillib_font.config.family`、`screen.anvillib_font.config.font`、`screen.anvillib_font.config.test`、`narration.anvillib_font.dropdown.expanded`、`narration.anvillib_font.dropdown.collapsed`）。 |
