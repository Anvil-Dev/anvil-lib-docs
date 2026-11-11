# SDF 字形图集与文本渲染器 (`dev.anvilcraft.lib.v2.font.sdf`)

<BranchContextCard branch="1.21.1" />

本篇深入介绍 `module.font` 的 SDF（Signed Distance Field，有符号距离场）字形光栅化、分页图集管理、宽度度量折行工具以及即时绘制渲染管线。

---

## 一、 SDF 字体渲染管线原理

为什么 `module.font` 能在保持高帧率的同时渲染出边缘锐利的任意系统 TrueType 字体？

1. **8× 超采样 EDT 距离场生成 (`SdfGlyphPage`)**：
   在后台守护线程（`"AnvilLib-SDF-Atlas-*"`）中，每个 Unicode 基本多文种平面（BMP，`0x0000 ~ 0xFFFF`）按 4096 个码点划分为 16 张页（Page `0..15`，其中 ASCII 所在的 Page 0 在初始化时立即构建，其余 15 页按需懒加载并在后台线程异步构建）。
   构建单页时，先以 `32 * 8 = 256px` 的 8 倍超采样字号在单比特位图上渲染字形，再利用 **Felzenszwalb & Huttenlocher 线性时间精确欧几里得距离变换（EDT，$O(W \times H)$）** 计算每个像素到字形轮廓的有符号距离，下采样写入 `2048×2048` 的单通道灰度图集（`0.5` 即 `128` 代表字形精确边界）。
2. **主线程零阻塞与分帧上传 (`SdfAtlasTexture`)**：
   后台线程完成 CPU 侧距离场计算后，主线程每帧通过 `SdfAtlasTexture.ensureUploaded(atlas)` **最多只上传 1 张已就绪的 `2048×2048` 纹理页**（将灰度值写入 `NativeImage` 的 Alpha 通道并注册到 `TextureManager`），彻底消除了首次渲染中文或粗体字时的主线程卡顿。
3. **着色器平滑抗锯齿绘制 (`SdfTextRenderer` / `SdfTextRenderState`)**：
   在 `1.21.1` 中，`SdfTextRenderer` 先调用 `graphics.flush()` 确保底层背景已提交，然后通过 `GlStateBackup` 备份 GL 状态，绑定 `ALFPipelines.getSdfTextShader()` 与当前页的 `atlasTexture`，使用 `Tesselator` 与 `BufferUploader.drawWithShader` 绘制字形四边形并在 `finally` 中完整恢复原版 GL 状态。

---

## 二、 完整代码示例：使用 `SdfTextMetrics` 测量文本宽度、截断与折行并直接调用 `SdfTextRenderer`

除了使用 `GuiGraphics` 上的 `anvillib$*` 扩展方法外，当你在编写自定义 UI 布局计算器（需要预先知道一段字符串在特定系统字体下的像素宽度或折行行数）时，可以直接使用 **`SdfTextMetrics`** 和 **`SdfTextRenderer`**：

```java
package com.example.mymod.client.gui;

import dev.anvilcraft.lib.v2.font.AnvilLibFont;
import dev.anvilcraft.lib.v2.font.sdf.SdfTextMetrics;
import dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;

import java.awt.Font;
import java.util.List;

public final class SdfMetricsLayoutExample {
    private static final SdfTextRenderer RENDERER = new SdfTextRenderer();

    private SdfMetricsLayoutExample() {
    }

    public static void renderAutoSizedTooltipBox(GuiGraphics graphics, Component message, int x, int y, int maxBoxWidth) {
        Font awtFont = AnvilLibFont.getSelectFont();
        int lineHeight = Minecraft.getInstance().font.lineHeight;

        // 1. 创建对应字体与行高的度量器
        SdfTextMetrics metrics = new SdfTextMetrics(awtFont, lineHeight);

        // 2. 将长文本按 maxBoxWidth 折行，并计算折行后的最大行宽
        List<FormattedText> lines = metrics.split(message, maxBoxWidth);
        int actualMaxWidth = 0;
        for (FormattedText line : lines) {
            int w = (int) Math.ceil(metrics.splitter().stringWidth(line));
            if (w > actualMaxWidth) {
                actualMaxWidth = w;
            }
        }

        // 3. 绘制自适应尺寸的背景面板
        int boxHeight = lines.size() * lineHeight;
        graphics.fill(x - 4, y - 4, x + actualMaxWidth + 4, y + boxHeight + 4, 0xCC10141C);

        // 4. 调用 SdfTextRenderer 绘制折行文本
        RENDERER.drawWrapped(graphics, awtFont, message, x, y, maxBoxWidth, 0xFFFFFFFF, true);
    }
}
```

---

## 三、 公开类 API 详解 (`dev.anvilcraft.lib.v2.font.sdf`)

### 1. `SdfTextRenderer`

位于 `dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer`。

| 方法签名 | 说明 |
| :--- | :--- |
| `public SdfTextRenderer()` | 构造 SDF 文本渲染器实例。 |
| `public void drawString(GuiGraphics graphics, @Nullable Font font, @Nullable String text, int x, int y, int color, boolean dropShadow)` | 绘制普通字符串（`text` 为空时直接返回）。 |
| `public void drawComponent(GuiGraphics graphics, @Nullable Font font, Component text, int x, int y, int color, boolean dropShadow)` | 绘制 `Component`（内部转为 `text.getVisualOrderText()`）。 |
| `public void drawFormatted(GuiGraphics graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color, boolean dropShadow)` | 核心绘制入口：按字符样式分段（处理颜色覆盖、粗体/斜体衍生字体、每 300ms 跳变的 `obfuscated` 随机字符、以及半像素精度的下划线 `underline` 与删除线 `strikethrough`）。开启 `dropShadow` 时先偏移 `(+1, +1)` 绘制暗化 1/4 颜色的阴影层并 `graphics.flush()`，再绘制前景层。 |
| `public void drawWrapped(GuiGraphics graphics, @Nullable Font font, FormattedText text, int x, int y, int width, int color, boolean dropShadow)` | 使用 `SdfTextMetrics#split(text, width)` 折行后逐行调用 `drawFormatted`。 |
| `public void drawCentered(GuiGraphics graphics, @Nullable Font font, Component / FormattedCharSequence text, int x, int y, int color)` | 使用 `SdfTextMetrics` 计算总宽度并以 `x` 为中心绘制文本。 |

---

### 2. `SdfTextMetrics`（文本宽度度量与折行器）

位于 `dev.anvilcraft.lib.v2.font.sdf.SdfTextMetrics`。优先从已就绪的 `SdfGlyphAtlas` 读取精确字形步进宽度（Advance），若某页尚未在后台构建完成则无锁回退到线程局部的 AWT `FontMetrics` 测量，保证**永不阻塞渲染线程**。

| 构造器 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public SdfTextMetrics(@Nullable Font baseFont, int targetLineHeight)` | `SdfTextMetrics` | 构造度量器（`targetLineHeight` 通常传 `Minecraft.getInstance().font.lineHeight` 即 `9`）。 |
| `public static Font styledFont(@Nullable Font base, Style style)` | `java.awt.Font` | 根据 `style.isBold()` 与 `style.isItalic()` 衍生对应字重样式的 `Font`（带全局 `ConcurrentHashMap` 缓存）。 |
| `public float codepointWidth(int codepoint, Style style)` | `float` | 计算单个 Unicode 码点在给定 `Style` 下的屏幕像素宽度。 |
| `public StringSplitter splitter()` | `StringSplitter` | 返回绑定了 `this::codepointWidth` 的原版 `StringSplitter`，可直接调用 `.stringWidth(...)`、`.plainIndexAtWidth(...)` 等全套原版测量方法。 |
| `public List<FormattedText> split(FormattedText text, int maxWidth)` | `List<FormattedText>` | 按最大像素宽度 `maxWidth` 将文本切分为多行。 |
| `public FormattedText substrByWidth(FormattedText text, int maxWidth)` | `FormattedText` | 按最大像素宽度截断文本。 |

---

### 3. 图集与布局底层类 (`SdfGlyphAtlas` / `SdfGlyphPage` / `SdfAtlasTexture` / `SdfTextLayout` / `SdfTextRenderState`)

| 类名 | 关键常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`SdfGlyphAtlas`** | • `ATLAS_SIZE = 2048`、`GLYPH_SIZE = 32`、`SPREAD = 4`、`OVERSAMPLE = 8`、`PAGE_Count = 16`、`CHARS_PER_PAGE = 4096`<br>• `public static CompletableFuture<SdfGlyphAtlas> getOrCreate(@Nullable Font font)`<br>• `public static @Nullable SdfGlyphAtlas getIfReady(@Nullable Font font)`<br>• `public @Nullable GlyphMetrics metrics(int codepoint)`<br>• `public record GlyphMetrics(int pageIndex, float u0, float v0, float u1, float v1, int width, int height, int bearingX, int bearingY, int advance)` | 管理单个 `Font` 的 16 张按需分页 SDF 图集。 |
| **`SdfGlyphPage`** | `public static SdfGlyphPage build(Font baseFont, int pageIndex, int rangeStart, int rangeEnd, int glyphSize, int spread, int oversample, int atlasSize)` | 执行 8× 超采样光栅化与线性时间 EDT 距离变换，构建单页 `2048×2048` 字节数据。 |
| **`SdfAtlasTexture`** | • `public static void ensureUploaded(SdfGlyphAtlas atlas)`<br>• `public static @Nullable ResourceLocation pageLocation(SdfGlyphAtlas atlas, int pageIndex)`<br>• `public static void releaseAll()` | 管理 CPU 图集页向 GPU `DynamicTexture` 的分帧上传（每帧最多上传 1 页）与资源释放。 |
| **`SdfTextLayout`** | • `public static SdfTextLayout fromAtlas(SdfGlyphAtlas atlas, String text, int x, int y, float scale)`<br>• `public record GlyphQuad(float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1)`<br>• `public record PageQuads(int pageIndex, @Nullable ResourceLocation atlasTexture, List<GlyphQuad> quads)` | 将字符串排版为按图集页分组的屏幕空间四边形列表 `List<PageQuads>` 及总像素宽度 `width()`。 |
| **`SdfTextRenderState`** | `public record SdfTextRenderState(Matrix4f pose, List<SdfTextLayout.GlyphQuad> glyphs, ResourceLocation atlasTexture, int color, int originX, int originY)` | （`@ApiStatus.Internal`）封装单次图集页绘制的顶点构建状态。 |
