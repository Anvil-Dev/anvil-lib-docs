---
title: Font 核心 API
prev: false
next: false
---

# 核心 API <Badge type="tip" text=">=26.1" />

## AnvilLibFont

模块主类，`@Mod` 入口点。仅客户端运行（`Dist.CLIENT`），modid 为 `"anvillib_font"`。

```java
@Mod(value = "anvillib_font", dist = Dist.CLIENT)
public class AnvilLibFont {
    // 获取当前配置中选择的 AWT Font
    public static Font getSelectFont();
}
```

`getSelectFont()` 从 `AnvilLibFontConfig` 读取用户选择的字体族和字体名，通过 `FontManager` 解析为 AWT `java.awt.Font` 实例。

## ALFont

`java.awt.Font` 的包装类，提供文本测量和布局工具。内部通过 `SdfGlyphAtlas` 获取字形度量。

```java
ALFont alf = new ALFont(AnvilLibFont.getSelectFont());

// 文本宽度测量
int w = alf.width("Hello World");
int w2 = alf.width(Component.literal("Hello"));

// 按像素宽度截取子串（正向/反向）
String head = alf.plainSubstrByWidth("Hello World", 50);        // 从头
String tail = alf.plainSubstrByWidth("Hello World", 50, true);  // 从尾

// 换行分割
List<FormattedCharSequence> lines = alf.split(FormattedText.of(text), 200);
int totalHeight = alf.wordWrapHeight(FormattedText.of(text), 200);

// 获取底层 AWT 字体
Font awt = alf.awtFont();
```

| 方法                                                                        | 说明                      |
|---------------------------------------------------------------------------|-------------------------|
| `alf.font()`                                                              | 返回包装的 AWT `Font`        |
| `width(String)` / `width(FormattedText)` / `width(FormattedCharSequence)` | 文本像素宽度                  |
| `plainSubstrByWidth(str, maxW)`                                           | 正向按宽度截取                 |
| `plainSubstrByWidth(str, maxW, true)`                                     | 反向按宽度截取                 |
| `split(FormattedText, maxW)`                                              | 单词换行分割                  |
| `wordWrapHeight(FormattedText, maxW)`                                     | 换行后总高度（行数 × lineHeight） |

## FontManager

系统字体发现与管理单例。

```java
public class FontManager {
    // 获取单例
    public static FontManager getInstance();

    // 根据字体名创建 Font（默认 16px）
    public Font getFont(@Nullable String name);

    // 根据字体名 + 大小创建 Font
    public Font getFont(String name, float size);

    // 获取所有字体族名称
    public String[] getFamilyNames();

    // 获取指定字体族下的所有字体名
    public String[] getFamilyFontNames(String familyName);
}
```

### 内部机制

- 通过 AWT `GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames()` 发现所有系统字体
- 构建字体族 Trie（`FontTrie`）用于高效的族名分组和前缀查找
- `getFont(String name)` 返回 16px 的 `Font.PLAIN` 字体，字体不存在时返回 fallback 字体

## AnvilLibFontConfig

JSON 配置文件管理类，配置文件路径为 `config/anvillib/anvillib-font-client.json`。

```java
public class AnvilLibFontConfig {
    public String fontFamily; // 选择的字体族
    public String font;       // 选择的字体名

    // 从文件读取配置
    public static AnvilLibFontConfig read();

    // 写入配置到文件
    public void write();
}
```

使用 Gson 进行 JSON 序列化/反序列化。`read()` 在文件不存在时返回默认配置。

## SdfTextRenderer

SDF 文本主渲染器，支持多种绘制模式。

```java
public class SdfTextRenderer {
    // 绘制纯文本字符串
    public void drawString(
        GuiGraphicsExtractor graphics,
        Font font,
        String text,
        float x, float y,
        int color,
        boolean dropShadow
    );

    // 绘制带格式的文本序列
    public void drawFormatted(
        GuiGraphicsExtractor graphics,
        Font font,
        FormattedCharSequence text,
        float x, float y,
        int color,
        boolean dropShadow
    );

    // 绘制 Component（自动解析样式）
    public void drawComponent(GuiGraphics graphics, Component component);

    // 绘制居中 Component
    public void drawCentered(GuiGraphics graphics, Component component);

    // 绘制支持自动换行的格式化文本
    public void drawWrapped(
        GuiGraphics graphics,
        FormattedText text,
        int width
    );
}
```

### 风格支持

渲染器支持以下文本风格，在 `drawFormatted` 和 `drawComponent` 中自动应用：

| 风格         | 效果         |
|------------|------------|
| **加粗**     | 文字加粗       |
| *斜体*       | 文字倾斜       |
| <u>下划线</u> | 文字下方绘制下划线  |
| ~~删除线~~    | 文字中间绘制删除线  |
| 混淆         | 随机字符替换动画效果 |

## SdfGlyphAtlas

CPU 端多页 SDF 字形图集，负责字形栅格化和 SDF 计算。

```java
public class SdfGlyphAtlas {
    // 获取或创建图集（按字体名称+样式+大小缓存）
    public static SdfGlyphAtlas getAtlas(Font font);

    // 图集页尺寸（每页 1024x1024）
    public static final int PAGE_SIZE = 1024;

    // 获取指定码点的字形信息（含 UV 坐标和页面索引）
    public GlyphInfo getGlyph(int codePoint);

    // 获取当前页数
    public int getPageCount();
}
```

### 内部机制

- 预烘焙 ASCII 32-126 范围内的字形（空格到波浪号）
- 其他码点按需延迟渲染（lazy render）
- 使用 Dead Reckoning EDT（Euclidean Distance Transform）算法计算 SDF 字段
- 静态缓存：相同字体名称 + 样式 + 大小的图集复用 `static` 缓存

## SdfTextLayout

CPU 端字形布局引擎，负责计算每个字形的位置并按图集页分组。

```java
public class SdfTextLayout {
    // 对文本进行布局，返回按图集页分组的四边形数据
    public static PageQuads layout(
        Font font,
        CharSequence text,
        float x, float y,
        Style style
    );

    // PageQuads 包含每个图集页的字形四边形列表及 UV 坐标
    public static class PageQuads {
        public int pageIndex;
        public List<GlyphQuad> quads;
    }
}
```

布局时自动处理字距（kerning）和行高（line height）。

## SdfAtlasTexture

将 `SdfGlyphAtlas` 的 CPU 端数据上传到 GPU 纹理。

```java
public class SdfAtlasTexture {
    // 上传图集页到 GPU（RED8 格式，LINEAR 过滤，CLAMP 环绕）
    public void upload(int pageIndex, SdfGlyphAtlas atlas);

    // 获取 GPU 纹理句柄
    public Texture getTexture(int pageIndex);
}
```

纹理格式为 `RED8`（单通道 8 位），使用 `LINEAR` 过滤实现平滑缩放，`CLAMP` 环绕避免边缘溢出。

## SdfTextRenderState

实现 `LibGuiElementRenderState` 接口，为 SDF 文本渲染构建 GPU 渲染状态。

```java
public class SdfTextRenderState implements LibGuiElementRenderState {
    // 从字形四边形数据构建顶点缓冲区
    public void buildVertices(PageQuads quads, int color);

    // 通过 ALFPipelines.SDF_TEXT 管线提交渲染
    @Override
    public void render();
}
```

## GUI 扩展方法

通过 `GuiGraphicsExtractorExtension` 接口和 `GuiGraphicsExtractorMixin` Mixin 注入到 Minecraft 的 `GuiGraphics` 中。

```java
public interface GuiGraphicsExtractorExtension {
    // 绘制文本
    void anvillib$text(Font font, String text, float x, float y, int color);

    // 绘制带阴影的文本
    void anvillib$text(Font font, String text, float x, float y, int color, boolean dropShadow);

    // 绘制居中文本（Component）
    void anvillib$centeredText(Font font, Component component, int x, int y, int color);

    // 绘制支持自动换行的文本
    void anvillib$textWithWordWrap(Font font, FormattedText text, int x, int y, int width, int color);

    // 绘制带背景色描边的文本
    void anvillib$textWithBackdrop(Font font, String text, int x, int y, int color, int backdropColor);
}
```

> 所有扩展方法均以 `anvillib$` 为前缀，需传入 AWT `java.awt.Font` 参数。

## 界面

### FontConfigScreen

配置界面，允许用户选择字体族和具体字体。

- **字体族下拉框**：列出所有可用的字体族（通过 `FontManager.getFamilyNames()`）
- **字体下拉框**：列出选中字体族下的所有字体（通过 `FontManager.getFamilyFontNames()`）
- **测试按钮**：打开 `FontTestScreen` 预览当前选择的字体效果

### FontTestScreen

字体测试界面，展示当前选择字体在各种风格和多种语言文字下的渲染效果。

### Dropdown

自定义下拉框组件，支持以下特性：

- 滚动条支持大量选项
- 点击外部区域自动关闭（shielding）
- 无障碍叙述（narration）支持

## ALFPipelines

SDF 文本渲染的 Vulkan/OpenGL 管线定义。

```java
public class ALFPipelines {
    // SDF_TEXT 管线配置：
    // - 顶点格式：QUADS
    // - 混合模式：TRANSLUCENT
    // - Uniform：DynamicTransforms + Projection
    // - 采样器：DiffuseSampler
    // - 面剔除：无（NO_CULL）
    public static final RenderingPipeline SDF_TEXT;
}
```

## AnvilLibFontData

数据生成类，负责生成 `en_us.json` 语言文件。

```java
@DataGen
public class AnvilLibFontData {
    // 生成 en_us.json 翻译文件
}
```
