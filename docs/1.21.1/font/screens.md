# 字体配置与测试界面 (`dev.anvilcraft.lib.v2.font.screen`)

<BranchContextCard branch="1.21.1" />

`module.font` 内置了可视化客户端字体配置界面 **`FontConfigScreen`**、多语言/多样式排版测试界面 **`FontTestScreen`**，以及一套带图层点击遮罩（Shielding）的通用下拉选择框组件 **`Dropdown`**。

玩家可以在游戏主菜单点击 **Mods -> AnvilLib Font (`anvillib_font`) -> Config** 直接打开 `FontConfigScreen`，从系统已安装的字体族与子字重列表中实时切换并预览 SDF 渲染效果。

---

## 一、 界面与下拉组件 API 详解

### 1. `FontConfigScreen` 与 `FontTestScreen` (`@ApiStatus.Internal`)

| 类名 | 构造器签名 | 功能说明 |
| :--- | :--- | :--- |
| **`FontConfigScreen`** | `public FontConfigScreen(final ModContainer ignored, final Screen parent)` | 注册在 `IConfigScreenFactory` 扩展点上的字体配置主界面。提供“字体族（Family）”与“具体字体（Font）”二级联动下拉框，实时用 `guiGraphics.anvillib$centeredText` 预览当前选中字体，并在每次选择变更时自动持久化到 `config/anvillib_font.json`。 |
| **`FontTestScreen`** | `public FontTestScreen(final Screen parent)` | 点击配置页的“测试”按钮进入。在同一屏幕内上下对比展示**原版位图字体 (`GuiGraphics#drawString`)** 与 **AnvilLib SDF 字体 (`GuiGraphics#anvillib$*`)** 在纯文本、彩色粗斜体下划线删除线 `Component`、随机跳变乱码（Obfuscated）、居中文本、带背景框文本以及英文/中文自动折行（Word Wrap）下的渲染表现。 |

---

### 2. `Dropdown`（可滚动带遮罩的下拉框控件）

位于 `dev.anvilcraft.lib.v2.font.screen.widget.Dropdown`（标注为 `@Beta`），继承自 `AbstractWidget` 并实现 `Renderable`、`GuiEventListener`、`NarratableEntry`。

#### 关键内部记录与接口

- `Dropdown.DropdownEntry(String id, Component label)`：下拉项数据记录，提供静态工厂：
  - `DropdownEntry.create(String id, Component label)`
  - `DropdownEntry.create(String id, String label)`
- `Dropdown.Shielding`：当下拉列表展开时，用于拦截下拉列表区域以外底层按钮悬停与点击事件的遮罩层。

#### 公开构造器与方法

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public Dropdown(int x, int y, int width, int height, int screenWidth, int screenHeight, Component message)`<br>`public Dropdown(int x, int y, int width, int height, int screenWidth, int screenHeight, Component message, List<DropdownEntry> allow)` | `Dropdown` | 创建下拉选择框（弹出列表最大高度为 `120px`，单行高度 `18px`，并根据 `screenHeight` 自动决定向下或向上展开）。 |
| `public void setAllow(List<DropdownEntry> allow)` | `void` | 更新可选条目列表，若当前选中项不在新列表中则自动切换为首项。 |
| `public @Nullable DropdownEntry getValue()` / `public String getValueId()` | `DropdownEntry` / `String` | 获取当前选中的条目或条目 ID（未选中时 `getValueId()` 返回 `""`）。 |
| `public void setValue(@Nullable DropdownEntry value)` / `public void setValue(@Nullable String id)` | `void` | 设置当前选中项（若发生变更且已设置 `onValueChanged` 回调则触发回调）。 |
| `public void setOnValueChanged(@Nullable Consumer<@Nullable DropdownEntry> onValueChanged)` | `void` | 设置选中值变更监听器。 |
| `public void setPlaceholder(Component placeholder)` | `void` | 设置未选中任何条目时的占位提示文本（默认为 `"Select..."`）。 |
| `public void setMaxPopupHeight(int maxPopupHeight)` | `void` | 设置展开列表的最大像素高度（最小被钳制为单行高度 `18px`）。 |
| `public void setOnShieldingAdd(Consumer<Shielding>)`<br>`public void setOnShieldingRemove(Runnable)`<br>`public void setShieldingGetter(Supplier<Shielding>)` | `void` | 绑定父 `Screen` 的展开遮罩管理回调，防止存在多个下拉框时相互穿透点击。 |
