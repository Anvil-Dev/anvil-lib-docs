# 客户端配置界面与侧栏 (`dev.anvilcraft.lib.v2.config.client`)

<BranchContextCard branch="1.21.11" />

当 `@Config(screenStyle = ConfigScreenStyle.SIDEBAR)` 启用时，`module.config` 会在客户端使用 **`SidebarConfigScreen`** 替代 NeoForge 默认的多级跳转配置界面。

相比原版配置界面每次点进子分类都需要整页跳转、且在修改客户端配置时必须退出保存才能看到效果，`SidebarConfigScreen` 具有以下核心特性：
1. **左侧分栏导航（Sidebar Tabs）**：自动将顶层零散字段归入“常规（General）”页，将每个顶层 `@CollapsibleObject` 子配置对象归为独立的侧栏标签页，切换标签页时保留各页滚动条位置与焦点；
2. **多配置文件下拉切换**：若同一个模组注册了多个配置文件（如 `common`、`client`、`server`），右上角自动提供文件下拉菜单切换，若仅有一个可编辑的 `SIDEBAR` 配置文件则跳过 NeoForge 文件选择页直接进入侧栏编辑界面；
3. **客户端配置实时预览（Live Preview）**：当编辑 `ModConfig.Type.CLIENT` 类型的配置项（如 UI 偏移、渲染开关、音量滑条）时，每次值变化都会立即调用 `ConfigManager.previewClientValue` 将新值实时同步到内存中的配置对象字段，无需先关闭界面写盘即可在背景世界中看到实时效果！

---

## 一、 接入与手动打开配置界面

### 1. 自动接入（推荐）

只要使用 `ConfigManager.register(MOD_ID, MyConfig::new)` 且 `@Config` 注解中设置了 `screenStyle = ConfigScreenStyle.SIDEBAR`，在物理客户端即会自动完成 `IConfigScreenFactory` 扩展点注册，玩家从主菜单 **Mods -> 选择你的模组 -> Config** 即可进入侧栏配置界面。

### 2. 代码示例：通过快捷键或指令在游戏内直接打开模组配置界面

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.config.ConfigScreenStyle;
import dev.anvilcraft.lib.v2.config.client.ConfigScreens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.ModList;

public final class ModConfigGuiHelper {
    private ModConfigGuiHelper() {
    }

    /**
     * 在客户端任意位置打开指定 modId 的配置界面
     */
    public static void openConfigScreen(String modId) {
        Minecraft mc = Minecraft.getInstance();
        Screen parent = mc.screen;
        ModContainer container = ModList.get()
            .getModContainerById(modId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown modId: " + modId));

        Screen screen = ConfigScreens.create(container, parent, spec -> ConfigScreenStyle.SIDEBAR);
        mc.setScreen(screen);
    }
}
```

---

## 二、 客户端界面类 API 详解 (`dev.anvilcraft.lib.v2.config.client`)

### 1. `ConfigScreens`

位于 `dev.anvilcraft.lib.v2.config.client.ConfigScreens`，仅限物理客户端调用。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static void register(ModContainer mod, Function<ModConfigSpec, ConfigScreenStyle> style)` | `void` | 向 `mod` 注册 `IConfigScreenFactory` 扩展点。 |
| `public static Screen create(ModContainer mod, Screen parent, Function<ModConfigSpec, ConfigScreenStyle> style)` | `Screen` | 创建模组配置屏幕：若该模组当前仅有一个可编辑配置文件且其样式为 `SIDEBAR`，则直接返回初始化好的 `SidebarConfigScreen`；否则返回包含文件列表的 `ConfigurationScreen`。 |
| `public static @Nullable Component unavailableReason(ModConfig config)` | `@Nullable Component` | 判断指定 `ModConfig` 当前是否不可编辑：若 `spec` 未加载、处于远程多人服务器时的 `SERVER` 配置或已开启局域网时的 `SERVER` 配置，返回对应不可编辑原因 Tooltip；可正常编辑时返回 `null`。 |

### 2. `SidebarConfigScreen`

继承自 NeoForge 1.21.11 `ConfigurationScreen.ConfigurationSectionScreen`（适配 1.21.11 `GuiGraphics` 与 `OptionsList` 滚动画布 API）。

| 构造器 / 行为特性 | 说明 |
| :--- | :--- |
| `public SidebarConfigScreen(ConfigurationScreen parent, ModConfig.Type type, ModConfig config, Component title)` | 公开构造器，供手动集成自定义 `ConfigurationScreen` 时直接实例化。 |
| **导航与深层弹窗 (`modalPath`)** | • 顶层普通配置项归入首个 `"general"`（常规）标签页；<br>• 顶层 `@CollapsibleObject` 子配置对象作为左侧栏独立标签页展示；<br>• 二级及更深层的嵌套 `@CollapsibleObject` 或 `List<?>` 列表配置项，点击“编辑 › (`anvillib_config.ui.open`)”按钮后以居中模态弹窗（Modal）形式在当前页面上方打开，按 ESC 或点击右下角“返回”逐层退回。 |
| **控件增强** | • **枚举选择**：少于等于 5 个枚举值的选项同样使用可滚动的扁平下拉菜单（支持 `TranslatableEnum` 翻译名）；<br>• **浮点滑条 (`@Slider`)**：自动识别 `ConfigManager.slider(value)` 注册的范围与步长，构建基于 `OptionInstance` 的平滑拖拽滑条；<br>• **撤销 (`Undo`) 与重置 (`Reset`)**：底部栏提供针对当前活动子页的撤销与恢复默认值按钮。 |

### 3. `ConfigTabs`、`FlatButton` 与 `PanelOptionsList`

| 类名 | 核心职责 |
| :--- | :--- |
| `ConfigTabs` | 扫描 `ModConfigSpec` 的顶层 `UnmodifiableConfig` 条目，拆分为常规 Tab（`key = ""`）与各顶层子表 Tab（`record Tab(String key, Map<String, Object> entries, Map<String, Object> specs)`）。 |
| `FlatButton` | 扁平化现代深色风格按钮控件（支持选中高亮竖条 `selected`、下拉箭头指示器 `dropdown`/`expanded` 及自适应截断省略号文本）。 |
| `PanelOptionsList` | 继承 NeoForge 21.11 `OptionsList` 的定制平滑滚动列表容器（基于 `OptionsList.AbstractEntry` 实现可变行高渲染 `renderContent(...)`，重写 `scrollBarX()` 与 `mouseClicked(MouseButtonEvent, boolean)` 并保留滚动条位置与焦点记忆，支持窄窗口时自动从左右双栏切换为上下堆叠布局）。 |
