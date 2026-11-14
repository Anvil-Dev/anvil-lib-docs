# Font 客户端字体管理与配置 (`module.font`)

<BranchContextCard branch="1.21.8" />

`module.font`（构件名 `anvillib-font-neoforge-1.21.8`，包名 `dev.anvilcraft.lib.v2.font`）是一个面向物理客户端的**系统 TrueType/OpenType 字体扫描管理与有符号距离场（SDF, Signed Distance Field）高清平滑文本渲染模块**。

原版 Minecraft 的位图字体在缩放或高分辨率屏幕上容易出现锯齿，而直接用 Java AWT 逐帧光栅化矢量字体又会导致严重的主线程卡顿。`module.font` 通过以下架构解决这一问题：
1. **`FontManager`**：启动时自动扫描操作系统已安装的所有 AWT 字体，通过字典树（`FontTrieNode`）智能归类字体族（Font Family），并按优先级自动回退选择最适合中文/西文显示的默认字体（HarmonyOS Sans SC → Microsoft YaHei → 微软雅黑 → PingFang → 苹方 → Cantarell → Noto Sans）；
2. **后台异步 SDF 字形图集预热**：在模组初始化时，后台守护线程自动为当前选中字体的常规（Plain）、粗体（Bold）、斜体（Italic）、粗斜体（Bold+Italic）构建 `2048×2048` 8× 超采样 SDF 字形图集；
3. **`GuiGraphics` 接口注入扩展**：向原版 `net.minecraft.client.gui.GuiGraphics` 注入 `anvillib$text`、`anvillib$centeredText`、`anvillib$textWithWordWrap`、`anvillib$textWithBackdrop` 等一等公民方法，并在 1.21.8 中直接对接 `RenderPipeline` 与 `GuiRenderAccess` 提交合批渲染状态！

本模块按功能拆分为 3 篇子文档：
- **本篇（字体管理、配置与 `GuiGraphics` 扩展）**：详解 `AnvilLibFont`、`FontManager`、`AnvilLibFontConfig`、`ALFont`、`ALFPipelines` 与 `GuiGraphicsExtension`。
- **[SDF 字形图集与文本渲染器](./sdf-renderer)**：详解 `SdfTextRenderer`、`SdfGlyphAtlas`、`SdfGlyphPage`、`SdfAtlasTexture`、`SdfTextLayout` 与 `SdfTextRenderState`。
- **[字体配置与测试界面](./screens)**：详解 `FontConfigScreen`、`FontTestScreen` 与 `Dropdown` 控件。

---

## 一、 接入配置（含接口注入声明）

若需要在编译期直接对原版 `GuiGraphics` 实例调用 `guiGraphics.anvillib$text(...)` 等注入方法，除了引入模块依赖外，**必须在 `build.gradle.kts` 中声明 `interfaceInjectionData`**：

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-font-neoforge-1.21.8:$anvillibVersion")
    // 启用 GuiGraphics -> GuiGraphicsExtension 接口注入
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-font-neoforge-1.21.8:$anvillibVersion")
}
```

---

## 二、 完整代码示例：在 Screen 或 HUD 中使用系统字体绘制 SDF 平滑文本

```java
package com.example.mymod.client.gui;

import dev.anvilcraft.lib.v2.font.AnvilLibFont;
import dev.anvilcraft.lib.v2.font.FontManager;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

import java.awt.Font;

public final class SdfHudOverlayExample {
    private SdfHudOverlayExample() {
    }

    public static void renderCustomFontHud(GuiGraphics graphics, int screenWidth) {
        // 1. 获取玩家在配置界面中选中的系统字体（若未配置则自动取系统默认字体如微软雅黑/鸿蒙黑体）
        Font selectedFont = AnvilLibFont.getSelectFont();

        // 2. 直接通过接口注入方法在 GuiGraphics 上绘制居中标题
        Component title = Component.literal("高能磁场谐振器 - 运行正常")
            .withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD);
        graphics.anvillib$centeredText(selectedFont, title, screenWidth / 2, 16, 0xFFFFFFFF);

        // 3. 绘制带半透明背景框的说明文本
        Component statusLine = Component.literal("当前通量: 12,800 FE/t")
            .withStyle(ChatFormatting.YELLOW);
        graphics.anvillib$textWithBackdrop(selectedFont, statusLine, 12, 36, 140, 0xFFFFFFFF);

        // 4. 绘制自动换行的长段落（支持颜色、粗体、斜体、下划线、删除线与乱码样式）
        Font customFamilyFont = FontManager.INSTANCE.getFont("Microsoft YaHei");
        Component paragraph = Component.literal("警告：当核心温度超过临界点时，请立即开启液氮冷却回路以防熔毁。");
        graphics.anvillib$textWithWordWrap(customFamilyFont, paragraph, 12, 56, 180, 0xFFFF5555, true);
    }
}
```

---

## 三、 核心公开类与接口 API 详解

### 1. `GuiGraphicsExtension`（注入到 `GuiGraphics` 的扩展接口）

位于 `dev.anvilcraft.lib.v2.font.extension.GuiGraphicsExtension`。通过 `interfaceInjectionData` 注入后，任何 `net.minecraft.client.gui.GuiGraphics` 实例均可直接调用以下方法：

| 方法签名 | 说明 |
| :--- | :--- |
| `default GuiGraphics self()` | 将当前扩展实例强转为 `GuiGraphics`。 |
| `default SdfTextRenderer anvillib$textRenderer()` | 获取绑定在当前 `GuiGraphics` 上的 `SdfTextRenderer` 实例。 |
| `default void anvillib$text(Font font, @Nullable String str, int x, int y, int color)`<br>`default void anvillib$text(Font font, @Nullable String str, int x, int y, int color, boolean dropShadow)` | 使用指定的 `java.awt.Font` 在 `(x, y)` 绘制纯字符串。 |
| `default void anvillib$text(Font font, FormattedCharSequence str, int x, int y, int color)`<br>`default void anvillib$text(Font font, FormattedCharSequence str, int x, int y, int color, boolean dropShadow)` | 绘制 `FormattedCharSequence` 格式化字符序列。 |
| `default void anvillib$text(Font font, Component str, int x, int y, int color)`<br>`default void anvillib$text(Font font, Component str, int x, int y, int color, boolean dropShadow)` | 绘制 `Component` 文本组件（完整支持颜色、粗体、斜体、下划线、删除线与 `obfuscated` 乱码动画）。 |
| `default void anvillib$centeredText(Font font, String / Component / FormattedCharSequence text, int x, int y, int color)` | 以 `x` 为水平中心点居中绘制文本。 |
| `default void anvillib$textWithWordWrap(Font font, FormattedText string, int x, int y, int width, int col)`<br>`default void anvillib$textWithWordWrap(Font font, FormattedText string, int x, int y, int width, int col, boolean dropShadow)` | 按最大像素宽度 `width` 自动折行并逐行绘制 `FormattedText`。 |
| `default void anvillib$textWithBackdrop(Font font, Component str, int textX, int textY, int textWidth, int textColor)` | 先根据原版 `options.getBackgroundColor(0.0F)` 绘制外扩 `2px` 的半透明背景矩形（通过 `ARGB.multiply` 混合颜色），再绘制 `str`。 |

---

### 2. `AnvilLibFont` 与 `FontManager`

| 类名 | 常量 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- | :--- |
| **`AnvilLibFont`** | • `public static final String MAIN_ID = "anvillib"`<br>• `public static final String MOD_ID = "anvillib_font"`<br>• `public static final AnvilLibFontConfig CONFIG`<br>• `public static Font getSelectFont()`<br>• `public static ResourceLocation of(String path)` | 对应类型 | 客户端模块主类。初始化时读取配置、注册 `IConfigScreenFactory`，并预热常规/粗体/斜体/粗斜体的 ASCII 字形图集。调用 `getSelectFont()` 返回当前配置的 `Font` 实例并触发图集创建；`of(path)` 返回 `anvillib_font:<path>`。 |
| **`FontManager`** | • `public static final FontManager INSTANCE`<br>• `public Font getDefaultFont()`<br>• `public String getDefaultFontFamily()`<br>• `public Collection<String> getFamilyNames()`<br>• `public String getFamilyName(Font font)`<br>• `public Collection<String> getFamilyFontNames(String familyName)`<br>• `public Font getFont(@Nullable String name)`<br>• `public Map<String, Font> getFontByName()` / `getFamilyByFont()` / `getFontMultimap()` | 对应类型 | 系统字体管理器单例。`getFont(name)` 在传入 `null` 或未知字体名时安全回退返回 `getDefaultFont()`。 |

---

### 3. `AnvilLibFontConfig`、`ALFont` 与 `ALFPipelines`

| 类名 | 方法 / 字段签名 | 说明 |
| :--- | :--- | :--- |
| **`AnvilLibFontConfig`** | • `public String getFontFamily()` / `public String getFont()`<br>• `public void setFontFamily(String)` / `public void setFont(String)`（调用时自动写回配置） | 客户端字体配置模型，内部 `@ApiStatus.Internal AnvilLibFontConfigManager` 将配置持久化到 `config/anvillib/anvillib_font-client.json`。 |
| **`ALFont`**（`@Beta`） | • `public final int lineHeight`（等于 `Minecraft.getInstance().font.lineHeight`）<br>• `public ALFont(Font font)` / `public Font awtFont()`<br>• `public int width(String str)` / `width(FormattedText)` / `width(FormattedCharSequence)`<br>• `public String plainSubstrByWidth(String str, int maxWidth[, boolean reverse])`<br>• `public FormattedText substrByWidth(FormattedText text, int maxWidth)`<br>• `public List<FormattedCharSequence> split(FormattedText input, int maxWidth)`<br>• `public int wordWrapHeight(FormattedText input, int maxWidth)`<br>• `public static List<String> wrapLines(SdfGlyphAtlas atlas, String text, int maxWidth, float scale)` | 封装 `java.awt.Font` 与 `SdfGlyphAtlas`，提供像素宽度测量、按宽度截断、按单词/换行符自动折行与折行高度计算工具。 |
| **`ALFPipelines`**（`@ApiStatus.Internal`） | • `public static final VertexFormat SDF_TEXT_FORMAT`（`Position` + `Color` + `UV`）<br>• `public static final RenderPipeline SDF_TEXT` | 通过 `RegisterRenderPipelinesEvent` 注册 `anvillib_font:sdf_text` 渲染管线（使用 `#version 330` 核心着色器 `anvillib_font:core/sdf_text`、`BlendFunction.TRANSLUCENT` 与 `DynamicTransforms` / `Projection` UBO）。 |
