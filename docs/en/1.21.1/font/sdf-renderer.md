# SDF Glyph Atlas & Text Renderer (`dev.anvilcraft.lib.v2.font.sdf`)

<BranchContextCard branch="1.21.1" />

This page dives into `module.font`'s SDF (Signed Distance Field) glyph rasterization, paged atlas management, width measurement/wrapping utilities, and immediate-mode draw pipeline.

---

## 1. How the SDF Font Rendering Pipeline Works

How does `module.font` render razor-sharp edges for any system TrueType font while maintaining high frame rates?

1. **8× Oversampled EDT Distance Field Generation (`SdfGlyphPage`)**:
   On background daemon threads (`"AnvilLib-SDF-Atlas-*"`), the Unicode Basic Multilingual Plane (BMP, `0x0000–0xFFFF`) is split into 16 pages of 4096 codepoints each (Page 0 containing ASCII is built at init, while the remaining 15 pages are lazily built on background threads as needed).
   When building a page, glyphs are rendered onto a 1-bit bitmap at `32 * 8 = 256px` (8× oversampling), then **Felzenszwalb & Huttenlocher's linear-time exact Euclidean Distance Transform (EDT, $O(W \times H)$)** computes signed distances to glyph contours and downsamples into a `2048×2048` single-channel grayscale atlas (`0.5` / `128` = exact glyph edge).
2. **Non-Blocking Main Thread & Staggered GPU Upload (`SdfAtlasTexture`)**:
   After background threads finish CPU distance-field computation, `SdfAtlasTexture.ensureUploaded(atlas)` uploads **at most 1 ready `2048×2048` texture page per frame** on the main thread (writing grayscale values to `NativeImage`'s alpha channel and registering with `TextureManager`), completely eliminating main-thread hitches when first rendering CJK or bold text.
3. **Shader-Smoothed Anti-Aliased Drawing (`SdfTextRenderer` / `SdfTextRenderState`)**:
   In `1.21.1`, `SdfTextRenderer` first calls `graphics.flush()` to flush underlying backgrounds, backs up GL state via `GlStateBackup`, binds `ALFPipelines.getSdfTextShader()` and the current page's `atlasTexture`, draws glyph quads using `Tesselator` and `BufferUploader.drawWithShader`, and restores vanilla GL state in `finally`.

---

## 2. Full Code Example: Measuring Width, Truncating & Wrapping with `SdfTextMetrics` and Calling `SdfTextRenderer` Directly

Beyond the `anvillib$*` extension methods on `GuiGraphics`, when writing custom UI layout calculators (needing pixel widths or wrapped line counts upfront), use **`SdfTextMetrics`** and **`SdfTextRenderer`** directly:

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

        // 1. Create a metrics calculator for the font and line height
        SdfTextMetrics metrics = new SdfTextMetrics(awtFont, lineHeight);

        // 2. Wrap long text to maxBoxWidth and compute max wrapped line width
        List<FormattedText> lines = metrics.split(message, maxBoxWidth);
        int actualMaxWidth = 0;
        for (FormattedText line : lines) {
            int w = (int) Math.ceil(metrics.splitter().stringWidth(line));
            if (w > actualMaxWidth) {
                actualMaxWidth = w;
            }
        }

        // 3. Draw an auto-sized backdrop panel
        int boxHeight = lines.size() * lineHeight;
        graphics.fill(x - 4, y - 4, x + actualMaxWidth + 4, y + boxHeight + 4, 0xCC10141C);

        // 4. Draw wrapped text via SdfTextRenderer
        RENDERER.drawWrapped(graphics, awtFont, message, x, y, maxBoxWidth, 0xFFFFFFFF, true);
    }
}
```

---

## 3. Public Classes API Reference (`dev.anvilcraft.lib.v2.font.sdf`)

### 1. `SdfTextRenderer`

Located in `dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer`.

| Method Signature | Description |
| :--- | :--- |
| `public SdfTextRenderer()` | Constructs an SDF text renderer instance. |
| `public void drawString(GuiGraphics graphics, @Nullable Font font, @Nullable String text, int x, int y, int color, boolean dropShadow)` | Draws a plain string (returns immediately if `text` is empty). |
| `public void drawComponent(GuiGraphics graphics, @Nullable Font font, Component text, int x, int y, int color, boolean dropShadow)` | Draws a `Component` (converts via `text.getVisualOrderText()`). |
| `public void drawFormatted(GuiGraphics graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color, boolean dropShadow)` | Core draw entry: splits runs by style (handling color overrides, bold/italic derived fonts, 300ms-cycling `obfuscated` random chars, and half-pixel-accurate `underline` and `strikethrough`). When `dropShadow` is true, draws a 1/4-darkened shadow layer offset by `(+1, +1)` and calls `graphics.flush()` before drawing the foreground. |
| `public void drawWrapped(GuiGraphics graphics, @Nullable Font font, FormattedText text, int x, int y, int width, int color, boolean dropShadow)` | Wraps via `SdfTextMetrics#split(text, width)` and calls `drawFormatted` line by line. |
| `public void drawCentered(GuiGraphics graphics, @Nullable Font font, Component / FormattedCharSequence text, int x, int y, int color)` | Computes total width via `SdfTextMetrics` and draws centered at `x`. |

---

### 2. `SdfTextMetrics` (Text Width Metrics & Word Wrapper)

Located in `dev.anvilcraft.lib.v2.font.sdf.SdfTextMetrics`. Reads exact glyph advances from ready `SdfGlyphAtlas`es first, falling back lock-free to thread-local AWT `FontMetrics` if a page is still building in the background—guaranteeing **zero render-thread blocking**.

| Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public SdfTextMetrics(@Nullable Font baseFont, int targetLineHeight)` | `SdfTextMetrics` | Constructs a metrics calculator (`targetLineHeight` is typically `Minecraft.getInstance().font.lineHeight`, i.e., `9`). |
| `public static Font styledFont(@Nullable Font base, Style style)` | `java.awt.Font` | Derives a weighted/styled `Font` from `style.isBold()` and `style.isItalic()` (cached in a global `ConcurrentHashMap`). |
| `public float codepointWidth(int codepoint, Style style)` | `float` | Computes the screen pixel width of a single Unicode codepoint under `Style`. |
| `public StringSplitter splitter()` | `StringSplitter` | Returns a vanilla `StringSplitter` bound to `this::codepointWidth` for calling `.stringWidth(...)`, `.plainIndexAtWidth(...)`, and all vanilla measurement methods. |
| `public List<FormattedText> split(FormattedText text, int maxWidth)` | `List<FormattedText>` | Splits `text` into multiple lines constrained to `maxWidth` pixels. |
| `public FormattedText substrByWidth(FormattedText text, int maxWidth)` | `FormattedText` | Truncates `text` to at most `maxWidth` pixels. |

---

### 3. Atlas & Layout Internal Classes (`SdfGlyphAtlas` / `SdfGlyphPage` / `SdfAtlasTexture` / `SdfTextLayout` / `SdfTextRenderState`)

| Class | Key Constants / Method Signatures | Description |
| :--- | :--- | :--- |
| **`SdfGlyphAtlas`** | • `ATLAS_SIZE = 2048`, `GLYPH_SIZE = 32`, `SPREAD = 4`, `OVERSAMPLE = 8`, `PAGE_Count = 16`, `CHARS_PER_PAGE = 4096`<br>• `public static CompletableFuture<SdfGlyphAtlas> getOrCreate(@Nullable Font font)`<br>• `public static @Nullable SdfGlyphAtlas getIfReady(@Nullable Font font)`<br>• `public @Nullable GlyphMetrics metrics(int codepoint)`<br>• `public record GlyphMetrics(int pageIndex, float u0, float v0, float u1, float v1, int width, int height, int bearingX, int bearingY, int advance)` | Manages 16 on-demand paged SDF atlases for a single `Font`. |
| **`SdfGlyphPage`** | `public static SdfGlyphPage build(Font baseFont, int pageIndex, int rangeStart, int rangeEnd, int glyphSize, int spread, int oversample, int atlasSize)` | Performs 8× oversampled rasterization and linear-time EDT distance transform to build a single `2048×2048` byte page. |
| **`SdfAtlasTexture`** | • `public static void ensureUploaded(SdfGlyphAtlas atlas)`<br>• `public static @Nullable ResourceLocation pageLocation(SdfGlyphAtlas atlas, int pageIndex)`<br>• `public static void releaseAll()` | Manages staggered CPU-to-GPU `DynamicTexture` uploads (max 1 page per frame) and resource disposal. |
| **`SdfTextLayout`** | • `public static SdfTextLayout fromAtlas(SdfGlyphAtlas atlas, String text, int x, int y, float scale)`<br>• `public record GlyphQuad(float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1)`<br>• `public record PageQuads(int pageIndex, @Nullable ResourceLocation atlasTexture, List<GlyphQuad> quads)` | Lays out a string into page-grouped screen-space quads `List<PageQuads>` and total pixel `width()`. |
| **`SdfTextRenderState`** | `public record SdfTextRenderState(Matrix4f pose, List<SdfTextLayout.GlyphQuad> glyphs, ResourceLocation atlasTexture, int color, int originX, int originY)` | (`@ApiStatus.Internal`) Encapsulates vertex-building state for a single atlas page draw. |
