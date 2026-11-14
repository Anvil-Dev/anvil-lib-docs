# Font 字体管理、配置与 GuiGraphics 扩展 (`module.font`)

<BranchContextCard branch="26.3" />

`module.font`（构件名 `anvillib-font-neoforge-26.3`，包名 `dev.anvilcraft.lib.v2.font`）是一套面向客户端的高清矢量字体渲染框架。它通过扫描宿主操作系统的 AWT 本地字体库（`FontManager`），利用虚拟线程在后台将 TrueType / OpenType 字形实时光栅化并计算有向距离场（Signed Distance Field, SDF）图集，再通过自定义片段着色器管线（`ALFPipelines.SDF_TEXT`）与注入到 `GuiGraphicsExtractor` 上的扩展方法直接绘制平滑抗锯齿矢量文字。

本模块按功能拆分为 3 篇子文档：
- **本篇（字体管理、配置与 GuiGraphics 扩展）**：详解 `AnvilLibFont`、`AnvilLibFontConfig`、`FontManager`、`ALFont`、`ALFPipelines` 与 `AnvilFontGuiGraphicsExtractorExtension` 接口注入方法。
- **[SDF 字形图集与文本排版渲染](./sdf-renderer)**：详解 `SdfTextRenderer`、`SdfTextLayout`、`SdfGlyphAtlas`、`SdfGlyphPage`、`SdfAtlasTexture` 与 `SdfTextRenderState`。
- **[字体配置与测试界面组件](./screens)**：详解 `FontConfigScreen`、`FontTestScreen`、`Dropdown` 与 `AnvilLibFontData`。

---

## 一、 接入配置（含接口注入）

`module.font` 向原版的 `net.minecraft.client.gui.GuiGraphicsExtractor` 注入了 `AnvilFontGuiGraphicsExtractorExtension` 接口（提供 `graphics.anvillib$text(...)`、`graphics.anvillib$centeredText(...)` 等方法）。为了在编译期直接调用这些注入方法，必须在 `build.gradle.kts` 中同时配置 `interfaceInjectionData`：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-font-neoforge-26.3:2.0.0")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-font-neoforge-26.3:2.0.0")
}
```

---

## 二、 核心用法与完整代码示例

### 1. 要解决什么问题 / 怎么用

Minecraft 原版位图字体在缩放或高分屏下容易出现锯齿，且想要在自定义 GUI 中使用系统已安装的现代字体（如 `HarmonyOS Sans SC`、`Microsoft YaHei`、`PingFang`）并测量换行宽度，通常需要繁琐的资源包 TTF 定义。

通过 `module.font`：
1. 调用 `AnvilLibFont.getSelectFont()` 获取玩家当前在配置界面中选定的系统 `java.awt.Font`（或通过 `FontManager.INSTANCE.getFont("Microsoft YaHei")` 获取指定名称的系统字体）；
2. 使用 `new ALFont(awtFont)` 测量字符串的 GUI 像素宽度、按宽度截断或按词折行；
3. 在 `Screen#extractRenderState` 或自定义控件的渲染方法中，直接调用 `guiGraphics.anvillib$text(...)` 或 `guiGraphics.anvillib$centeredText(...)` 绘制高清 SDF 文本（完整支持 `Component` 的颜色、粗体 `bold`、斜体 `italic`、下划线 `underlined`、删除线 `strikethrough` 与随机字符混淆 `obfuscated` 样式）。

### 2. 完整代码示例

```java
package com.example.mymod.client.screen;

import dev.anvilcraft.lib.v2.font.ALFont;
import dev.anvilcraft.lib.v2.font.AnvilLibFont;
import dev.anvilcraft.lib.v2.font.FontManager;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;

import java.awt.Font;

public class GuidebookScreen extends Screen {
    private Font bodyAwtFont;
    private ALFont bodyMetrics;

    public GuidebookScreen() {
        super(Component.translatable("screen.my_mod.guidebook"));
    }

    @Override
    protected void init() {
        // 获取玩家当前选中的全局字体（也可调用 FontManager.INSTANCE.getFont("Microsoft YaHei")）
        this.bodyAwtFont = AnvilLibFont.getSelectFont();
        this.bodyMetrics = new ALFont(this.bodyAwtFont);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);

        int centerX = this.width / 2;
        int topY = 30;

        // 1. 居中绘制带粗体和颜色样式的标题 Component
        Component header = Component.literal("多方块反应堆操作手册")
            .withStyle(Style.EMPTY.withBold(true).withColor(ChatFormatting.GOLD));
        graphics.anvillib$centeredText(this.bodyAwtFont, header, centerX, topY, 0xFFFFFFFF);

        // 2. 使用 ALFont 测量宽度并绘制带半透明底衬的状态标签
        Component badge = Component.literal("状态：运行正常").withStyle(ChatFormatting.GREEN);
        int badgeWidth = this.bodyMetrics.width(badge);
        graphics.anvillib$textWithBackdrop(
            this.bodyAwtFont,
            badge,
            centerX - badgeWidth / 2,
            topY + 20,
            badgeWidth,
            0xFFFFFFFF
        );

        // 3. 自动折行绘制长段落文本
        Component paragraph = Component.literal(
            "当反应堆核心温度超过 1200K 时，冷却剂阀门会自动开启。"
            + "\n请确保输入管道内有充足的液态钠。"
        );
        graphics.anvillib$textWithWordWrap(
            this.bodyAwtFont,
            paragraph,
            centerX - 120,
            topY + 42,
            240,
            0xFFE0E0E0
        );
    }
}
```

---

## 三、 公开类与接口 API 详解

### 1. `AnvilFontGuiGraphicsExtractorExtension`（`GuiGraphicsExtractor` 注入接口，`@Beta`）

位于 `dev.anvilcraft.lib.v2.font.extension.AnvilFontGuiGraphicsExtractorExtension`。通过 Mixin 与接口注入直接混入 `net.minecraft.client.gui.GuiGraphicsExtractor`，每个 `GuiGraphicsExtractor` 实例内部持有一个 `SdfTextRenderer`。

| 方法签名 | 参数说明与行为 |
| :--- | :--- |
| `default GuiGraphicsExtractor self()` | 返回 `(GuiGraphicsExtractor) this`。 |
| `default SdfTextRenderer anvillib$textRenderer()` | 获取绑定在当前 `GuiGraphicsExtractor` 上的 `SdfTextRenderer` 实例。 |
| `default void anvillib$text(Font font, @Nullable String str, int x, int y, int color)` | 在 `(x, y)` 处使用 `font` 绘制纯字符串（无阴影）。 |
| `default void anvillib$text(Font font, @Nullable String str, int x, int y, int color, boolean dropShadow)` | 在 `(x, y)` 处使用 `font` 绘制纯字符串（委托 `SdfTextRenderer#drawString`）。 |
| `default void anvillib$text(Font font, FormattedCharSequence str, int x, int y, int color)` | 在 `(x, y)` 处绘制带样式的 `FormattedCharSequence`。 |
| `default void anvillib$text(Font font, FormattedCharSequence str, int x, int y, int color, boolean dropShadow)` | 在 `(x, y)` 处绘制带样式的 `FormattedCharSequence`（委托 `SdfTextRenderer#drawFormatted`）。 |
| `default void anvillib$text(Font font, Component str, int x, int y, int color)` | 在 `(x, y)` 处绘制 `Component` 文本组件。 |
| `default void anvillib$text(Font font, Component str, int x, int y, int color, boolean dropShadow)` | 在 `(x, y)` 处绘制 `Component` 文本组件（委托 `SdfTextRenderer#drawComponent`）。 |
| `default void anvillib$centeredText(Font font, String str, int x, int y, int color)` | 以 `x` 为水平中心点居中绘制字符串。 |
| `default void anvillib$centeredText(Font font, Component text, int x, int y, int color)` | 以 `x` 为水平中心点居中绘制 `Component`。 |
| `default void anvillib$centeredText(Font font, FormattedCharSequence text, int x, int y, int color)` | 以 `x` 为水平中心点居中绘制 `FormattedCharSequence`。 |
| `default void anvillib$textWithWordWrap(Font font, FormattedText string, int x, int y, int width, int col)` | 在最大宽度 `width` 约束下自动折行绘制 `FormattedText`。 |
| `default void anvillib$textWithWordWrap(Font font, FormattedText string, int x, int y, int width, int col, boolean dropShadow)` | 在最大宽度 `width` 约束下自动折行绘制 `FormattedText`（委托 `SdfTextRenderer#drawWrapped`）。 |
| `default void anvillib$textWithBackdrop(Font font, Component str, int textX, int textY, int textWidth, int textColor)` | 先根据 `Minecraft.getInstance().options.getBackgroundColor(0.0F)` 绘制带 `2px` 内边距的半透明矩形背景框，再在上方绘制 `str`。 |

### 2. `ALFont`（SDF 字体度量与折行包装器，`@Beta`）

位于 `dev.anvilcraft.lib.v2.font.ALFont`。包装一个 `java.awt.Font`，将 SDF 字形图集中的 64px 字形度量按 `scale = lineHeight / atlas.awtHeight()` 缩放为 Minecraft GUI 像素单位。

| 字段 / 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public final int lineHeight` | `int` | 行高，默认等于 `Minecraft.getInstance().font.lineHeight`（9 像素）。 |
| `public ALFont(Font font)` | — | 包装指定的 `java.awt.Font`。 |
| `public Font awtFont()` | `Font` | 获取底层的 `java.awt.Font` 对象。 |
| `public int width(String str)` | `int` | 计算纯字符串在 GUI 坐标系下的像素宽度（向上取整 `Mth.ceil(atlas.measureText(str) * scale)`）。 |
| `public int width(FormattedText text)` | `int` | 计算 `FormattedText` 的像素宽度。 |
| `public int width(FormattedCharSequence text)` | `int` | 计算 `FormattedCharSequence` 的像素宽度。 |
| `public String plainSubstrByWidth(String str, int maxWidth)` | `String` | 从头部截取宽度不超过 `maxWidth` 的最长前缀子串（内部使用二分查找 `O(log N)` 定位截断位置）。 |
| `public String plainSubstrByWidth(String str, int maxWidth, boolean reverse)` | `String` | 当 `reverse = false` 时从头部截取最长前缀；当 `reverse = true` 时从尾部截取宽度不超过 `maxWidth` 的最长后缀子串。 |
| `public FormattedText substrByWidth(FormattedText text, int maxWidth)` | `FormattedText` | 将 `text` 截取为不超过 `maxWidth` 的 `FormattedText`。 |
| `public List<FormattedCharSequence> split(FormattedText input, int maxWidth)` | `List<FormattedCharSequence>` | 将 `input` 按最大宽度 `maxWidth` 折行拆分为多行 `FormattedCharSequence`。 |
| `public int wordWrapHeight(FormattedText input, int maxWidth)` | `int` | 计算 `input` 在 `maxWidth` 下折行后的总像素高度（`lineHeight * split(input, maxWidth).size()`）。 |
| `public static List<String> wrapLines(SdfGlyphAtlas atlas, String text, int maxWidth, float scale)` | `List<String>` | 按换行符 `\n` 与空格分词对 `text` 进行贪心折行计算。 |

### 3. `FontManager`（系统字体扫描与前缀树分组管理器，`@Beta`）

位于 `dev.anvilcraft.lib.v2.font.FontManager`，全局单例为 `FontManager.INSTANCE`。

在构造时，`FontManager` 会调用 `GraphicsEnvironment.getLocalGraphicsEnvironment().getAllFonts()` 获取系统全部字体，通过内部字典树 `FontTrieNode` 按空格词边界自动将同族字重（如 `HarmonyOS Sans SC Regular`、`HarmonyOS Sans SC Bold`）聚合到同一个字体族名称下，并按以下优先级选择默认字体（`DEFAULT_FONTS`）：
1. `"HarmonyOS Sans SC"` → 2. `"Microsoft YaHei"` → 3. `"微软雅黑"` → 4. `"PingFang"` → 5. `"苹方"` → 6. `"Cantarell"` → 7. `"Noto Sans"` → 8. Swing `UIManager.getFont("Label.font")` → 9. 系统任一可用字体。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public Collection<String> getFamilyNames()` | `Collection<String>` | 获取聚合后的所有字体族名称集合。 |
| `public String getFamilyName(Font font)` | `String` | 获取指定 `Font` 所属的字体族名称（若未聚合则返回 `font.getFontName()`）。 |
| `public String getDefaultFontFamily()` | `String` | 获取默认字体的字体族名称。 |
| `public Collection<String> getFamilyFontNames(String familyName)` | `Collection<String>` | 获取指定字体族下的所有具体字体全名列表；若字体族不存在则返回空集 `Set.of()`。 |
| `public Font getFont(@Nullable String name)` | `Font` | 根据字体全名获取 `Font` 实例；若 `name == null` 或系统中不存在该字体，安全回退返回 `getDefaultFont()`。 |
| `public Font getDefaultFont()` | `Font` | （Lombok `@Getter`）获取系统默认回退字体。 |

### 4. `AnvilLibFont`、`AnvilLibFontConfig` 与 `ALFPipelines`

| 类名 | 关键常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `AnvilLibFont` | `MAIN_ID = "anvillib"`<br>`MOD_ID = "anvillib_font"`<br>`CONFIG = new AnvilLibFontConfig()`<br>`public static Font getSelectFont()`<br>`public static Identifier of(String path)` | 客户端模组入口。构造时读取 JSON 配置，向 `ModContainer` 注册 `FontConfigScreen`，并在后台虚拟线程预热基础字体及其 `BOLD`、`ITALIC`、`BOLD \| ITALIC` 四个变体的 `SdfGlyphAtlas`，避免首次渲染粗斜体文字时卡顿。 |
| `AnvilLibFontConfig` | `public String getFontFamily()` / `setFontFamily(String)`<br>`public String getFont()` / `setFont(String)` | 客户端字体配置文件模型，使用 Gson 持久化保存在 `config/anvillib/anvillib_font-client.json`。调用 `setFontFamily` 或 `setFont` 时会自动落盘保存。 |
| `ALFPipelines` | `public static final VertexFormat SDF_TEXT_FORMAT`<br>`public static final RenderPipeline SDF_TEXT` | （`@ApiStatus.Internal`）在 `RegisterRenderPipelinesEvent` 中注册 `anvillib_font:sdf_text` 渲染管线（顶点格式 `Position (RGB32_FLOAT) + Color (RGBA8_UNORM) + UV0 (RG32_FLOAT)`，图元拓扑 `PrimitiveTopology.QUADS`，绑定 `BindGroupLayout` 的 `DynamicTransforms`/`Projection`/`DiffuseSampler`，开启 `BlendFunction.TRANSLUCENT` 半透明混合并禁用背面剔除）。 |
