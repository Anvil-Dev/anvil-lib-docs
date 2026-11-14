# 客户端配置界面与侧栏样式 (`dev.anvilcraft.lib.v2.config.client`)

<BranchContextCard branch="26.2" />

`dev.anvilcraft.lib.v2.config.client` 包实现了 `AnvilLib` 的客户端配置界面调度器（`ConfigScreens`）与半透明侧栏配置界面（`SidebarConfigScreen`）。

当你在 `@Config` 注解中设置 `screenStyle = ConfigScreenStyle.SIDEBAR` 时，`ConfigManager` 会在客户端自动将该配置文件路由至 `SidebarConfigScreen`，无需手写任何 GUI 代码；如果你没有使用 `@Config` 注解，而是手写了原生 `ModConfigSpec`，也可以直接调用 `ConfigScreens.register(...)` 或构造 `SidebarConfigScreen` 来启用侧栏配置界面。

---

## 一、 核心设计特性

与 NeoForge 默认的居中逐层跳转配置页相比，`SidebarConfigScreen` 具有以下特性：

1. **左栏一级分类导航（`ConfigTabs`）**：自动将顶层非分组配置项归入“常规（General）”标签页，并将所有顶层子节（即 `@CollapsibleObject` 或 `builder.push(...)` 一级子表）列为左侧固定导航栏按钮，点击即可在同一窗口右侧即时切换，无需反复进入/退出子屏幕。
2. **游戏中半透明视觉与实时预览**：在世界内打开配置界面时，背景采用半透明深色毛玻璃色调（`backgroundColor(color, inGameAlpha)`）且不叠加原版模糊遮罩；修改 `ModConfig.Type.CLIENT` 配置项（尤其是拖动 `@Slider` 步进滑块）时，会通过 `ConfigManager.previewClientValue` 实时同步到内存字段，玩家可以边拖动滑块边观察游戏画面变化。
3. **单文件直达与多文件顶栏切换**：
   - 若当前模组**仅有 1 个可编辑配置文件**且其风格为 `SIDEBAR`，点击模组列表中的“Config”按钮会**跳过 NeoForge 的文件选择页**，直接打开该文件的 `SidebarConfigScreen`；
   - 若当前模组包含多个配置文件，`SidebarConfigScreen` 右上角会提供下拉菜单（`fileButton`），支持在不同配置文件之间直接切换并自动保存前一个文件（对不可编辑的服务端配置会自动禁用并显示原因 Tooltip）。
4. **二级子节模态弹窗（Modal Dialog）**：当配置中包含二级或更深层的嵌套对象时，点击“编辑 ›”会在当前界面中央弹出模态窗口，保留底部背景上下文，支持按返回键逐层退回。
5. **自适应窄屏堆叠布局（`PanelOptionsList`）**：当右侧面板宽度 `< 330` GUI 像素时，选项行会自动从“左标签 + 右控件（行高 32）”切换为“上标签 + 下控件（行高 50）”的双层堆叠布局，并在鼠标悬停超长按钮文本时自动平滑跑马灯滚动（`FlatButton`）。

---

## 二、 完整代码示例

### 场景 1：通过 `@Config` 注解自动启用（推荐）

只需在 `@Config` 注解中指定 `screenStyle = ConfigScreenStyle.SIDEBAR`，`ConfigManager.register` 会自动完成客户端界面绑定：

```java
package com.example.mymod.config;

import dev.anvilcraft.lib.v2.config.Config;
import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import net.neoforged.fml.config.ModConfig;

@Config(
    name = "my_mod",
    type = ModConfig.Type.COMMON,
    screenStyle = ConfigScreenStyle.SIDEBAR
)
public class MyModCommonConfig {
    public int maxEnergy = 10000;
}
```

### 场景 2：为原生 `ModConfigSpec` 手动接入 `ConfigScreens`

如果你的模组使用的是原生 `ModConfigSpec` 而非 `@Config` 注解，可以在客户端初始化阶段直接调用 `ConfigScreens.register`：

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import dev.anvilcraft.lib.v2.config.client.ConfigScreens;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;

@Mod(value = "my_mod", dist = Dist.CLIENT)
public class MyModClient {
    public MyModClient(ModContainer container) {
        // 将本模组的所有 ModConfigSpec 统一设为 SIDEBAR 侧栏风格
        ConfigScreens.register(container, spec -> ConfigScreenStyle.SIDEBAR);
    }
}
```

---

## 三、 公开类与 API 详解

### 1. `ConfigScreens`（客户端配置界面工厂）

位于 `dev.anvilcraft.lib.v2.config.client.ConfigScreens`，**仅限在物理客户端调用**。

| 方法签名 | 返回值 | 参数与行为说明 |
| :--- | :--- | :--- |
| `public static void register(ModContainer mod, Function<ModConfigSpec, ConfigScreenStyle> style)` | `void` | 向 `mod` 容器注册 NeoForge 的 `IConfigScreenFactory` 扩展点。内部委托 `create(container, parent, style)`。 |
| `public static Screen create(ModContainer mod, Screen parent, Function<ModConfigSpec, ConfigScreenStyle> style)` | `Screen` | 收集该 `mod` 下的全部 `ModConfig`（按 `Type` 与 `FileName` 排序）：<br>• 根据 `style.apply(spec)` 筛选出使用 `SIDEBAR` 的配置列表。<br>• 若当前可编辑的配置（`unavailableReason(config) == null`）**恰好只有 1 个**且属于 `SIDEBAR` 列表，则直接返回直达模式的 `SidebarConfigScreen`。<br>• 否则返回 `ConfigurationScreen` 选择器，并将属于 `SIDEBAR` 的文件点击行为替换为打开 `SidebarConfigScreen`。 |
| `public static @Nullable Component unavailableReason(ModConfig config)` | `@Nullable Component` | 判断指定配置文件当前是否不可编辑，返回不可编辑原因的本地化文本；若可编辑则返回 `null`。<br>不可编辑情形：<br>1. `config.getSpec()` 不是 `ModConfigSpec` 或 `!spec.isLoaded()` → 返回 `ConfigurationScreen.TOOLTIP_CANNOT_EDIT_NOT_LOADED`；<br>2. `config.getType() == ModConfig.Type.SERVER` 且处于多人远程服务器 → 返回 `TOOLTIP_CANNOT_EDIT_THIS_WHILE_ONLINE`；<br>3. `config.getType() == ModConfig.Type.SERVER` 且处于已对局域网开放的单人世界 → 返回 `TOOLTIP_CANNOT_EDIT_THIS_WHILE_OPEN_TO_LAN`。 |

### 2. `SidebarConfigScreen`（半透明侧栏配置屏幕）

继承自 `net.neoforged.neoforge.client.gui.ConfigurationScreen.ConfigurationSectionScreen`。

| 构造器 / 方法签名 | 说明 |
| :--- | :--- |
| `public SidebarConfigScreen(ConfigurationScreen parent, ModConfig.Type type, ModConfig config, Component title)` | 公开构造器，供外部手动集成单个 `ModConfig` 时直接实例化。 |
| `public void onClose()` | 依次处理：若当前打开了枚举或文件下拉菜单（`dropdownMenu != null`），仅关闭下拉菜单；若当前处于二级子节模态弹窗（`!modalPath.isEmpty()`），刷新未保存更改并弹出栈顶模态页；若处于主侧栏页，则调用 `saveFile()` 将更改写入磁盘并传播 `needsRestart` 标记，随后返回上一级界面。 |
| `public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick)` | 处理下拉菜单外部点击自动收起，并修正按钮重建控件后的焦点重入顺序，防止模态弹窗打开后键盘焦点仍留在底层背景页。 |
| `public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick)` | 覆盖为空实现，禁用原版菜单高斯模糊背景与不透明泥土背景纹理。 |
| `public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick)` | 绘制半透明侧栏背景、标题、左侧分类列表、右侧选项列表、二级模态遮罩以及顶层下拉菜单，并实时同步底部“撤销（Undo）”与“重置（Reset）”按钮的激活状态。 |

### 3. 包内协作组件说明（Package-Private）

虽然以下 3 个类为包级私有（无需外部直接调用），了解其机制有助于排查配置界面布局与交互行为：

| 类名 | 核心职责与实现细节 |
| :--- | :--- |
| `ConfigTabs` | 扫描 `ModConfigSpec` 的顶层条目：将所有非子表叶节点归入 `key = ""` 的常规页（翻译键 `anvillib_config.ui.general`，排在首位），将每个 `UnmodifiableConfig` 子表映射为一个独立的 `Tab(key, entries, specs)`。不改变底层 TOML 路径或字段顺序。 |
| `PanelOptionsList` | 继承自原版 `OptionsList`，将配置行限制在右侧面板或模态窗口矩形区域内（修复原版滚动条固定按屏幕居中计算的命中偏移问题）。当面板宽度 `< 330` 时自动启用 `stacked` 上下堆叠布局；通过 `immediateSliders` 集合记录已实时应用更改的步进滑块，避免 `applyUnsavedChanges()` 将未触碰的非对齐手写值强制取整。 |
| `FlatButton` | 继承自原版 `Button`，保留原版键盘导航、点击音效与无障碍朗读（Narration），将外观替换为扁平深色块（选中态左侧带 `2px` 亮蓝指示条 `#73AEF5`），支持下拉三角箭头绘制以及悬停/选中时超长文本往返平滑滚动裁剪。 |
