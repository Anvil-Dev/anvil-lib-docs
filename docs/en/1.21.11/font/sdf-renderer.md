# SDF Glyph Atlas & Text Renderer (`dev.anvilcraft.lib.v2.font.sdf`)

<BranchContextCard branch="1.21.11" />

This page dives into `module.font`'s SDF (Signed Distance Field) glyph rasterization, paged atlas management, `ALFont` width measurement/wrapping utilities, and the render pipeline integrated with 1.21.11 `GuiRenderState`.

---

## 1. How the SDF Font Rendering Pipeline Works

How does `module.font` render razor-sharp edges for any system TrueType font while maintaining high frame rates?

1. **8× Oversampled EDT Distance Field Generation (`SdfGlyphPage`)**:
   On background daemon threads (`"AnvilLib-SDF-Atlas-*"`), the Unicode Basic Multilingual Plane (BMP, `0x0000–0xFFFF`) is split into 16 pages of 4096 codepoints each (Page 0 containing ASCII is pre-warmed at init, while the remaining 15 pages are lazily built on background threads as needed).
   When building a page, glyphs are rendered onto a 1-bit bitmap at `32 * 8 = 256px` (8× oversampling), then **Felzenszwalb & Huttenlocher's linear-time exact Euclidean Distance Transform (EDT, $O(W \times H)$)** computes signed distances to glyph contours and downsamples into a `2048×2048` single-channel grayscale atlas (`0.5` / `128` = exact glyph edge).
2. **Non-Blocking Main Thread & Staggered GPU Upload (`SdfAtlasTexture`)**:
   After background threads finish CPU distance-field computation, `SdfAtlasTexture.ensureUploaded(atlas)` uploads **at most 1 ready `2048×2048` texture page per frame** on the main thread (writing grayscale pixels to `NativeImage` and uploading to `TextureManager`), avoiding frame drops when first rendering many CJK or bold-italic characters.
3. **1.21.11 `RenderPipeline` & `LibGuiElementRenderState` Submission (`SdfTextRenderer` / `SdfTextRenderState`)**:
   Instead of breaking frame batching with direct OpenGL state calls, `SdfTextRenderer` builds immutable **`SdfTextRenderState`** instances implementing `LibGuiElementRenderState` (carrying `Matrix3x2f` 2D pose, atlas texture, and `GuiRenderAccess.scissor(graphics)` scissor area) and submits them via `GuiRenderAccess.submit(graphics, state)` to 1.21.11's `GuiRenderState` and `ALFPipelines.SDF_TEXT`.

---

## 2. Full Code Example: Measuring & Wrapping with `ALFont` and Calling `SdfTextRenderer` Directly

Beyond the `anvillib$*` extension methods on `GuiGraphics`, when writing custom UI layout calculators (needing pixel widths, wrapped line counts, or truncated substrings upfront), pair **`ALFont`** with **`SdfTextRenderer`**:

```java
package com.example.mymod.client.gui;

import dev.anvilcraft.lib.v2.font.ALFont;
import dev.anvilcraft.lib.v2.font.AnvilLibFont;
import dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import java.awt.Font;
import java.util.List;

public final class SdfLayoutBoxExample {
    private static final SdfTextRenderer RENDERER = new SdfTextRenderer();

    private SdfLayoutBoxExample() {
    }

    public static void renderAutoSizedTooltipBox(GuiGraphics graphics, Component message, int x, int y, int maxBoxWidth) {
        Font awtFont = AnvilLibFont.getSelectFont();

        // 1. Wrap in ALFont to measure width and compute line wrapping
        ALFont alFont = new ALFont(awtFont);
        List<FormattedCharSequence> lines = alFont.split(message, maxBoxWidth);

        int actualMaxWidth = 0;
        for (FormattedCharSequence line : lines) {
            int w = alFont.width(line);
            if (w > actualMaxWidth) {
                actualMaxWidth = w;
            }
        }

        // 2. Draw an adaptive translucent backdrop sized to measured dimensions
        int boxHeight = alFont.wordWrapHeight(message, maxBoxWidth);
        graphics.fill(x - 4, y - 4, x + actualMaxWidth + 4, y + boxHeight + 4, 0xCC10141C);

        // 3. Render line-by-line or directly via drawWrapped on SdfTextRenderer
        RENDERER.drawWrapped(graphics, awtFont, message, x, y, maxBoxWidth, 0xFFFFFFFF, false);
    }
}
```

---

## 3. Public Classes API Reference (`dev.anvilcraft.lib.v2.font.sdf`)

### 1. `SdfTextRenderer`

Located in `dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer` (marked `@Beta`).

| Method Signature | Description |
| :--- | :--- |
| `public SdfTextRenderer()` | Constructs an SDF text renderer instance. |
| `public void drawString(GuiGraphics graphics, @Nullable Font font, @Nullable String text, int x, int y, int color, boolean dropShadow)` | Draws a plain string (returns immediately if `text` is `null` or empty). |
| `public void drawComponent(GuiGraphics graphics, @Nullable Font font, Component text, int x, int y, int color, boolean dropShadow)` | Draws a `Component` (converts via `text.getVisualOrderText()` and forwards to `drawFormatted`). |
| `public void drawFormatted(GuiGraphics graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color, boolean dropShadow)` | Core segmented draw entry: splits runs by style (handling `ARGB` colors, bold/italic derived fonts, 300ms-cycling `obfuscated` random ASCII, and half-pixel-accurate underlines/strikethroughs via `Matrix3x2fStack#scale(1.0F, 0.5F)`). |
| `public void drawWrapped(GuiGraphics graphics, @Nullable Font font, FormattedText text, int x, int y, int width, int color, boolean dropShadow)` | Wraps `text` to `width` using `ALFont.wrapLines` and draws line by line. |
| `public void drawCentered(GuiGraphics graphics, @Nullable Font font, Component text, int x, int y, int color)`<br>`public void drawCentered(GuiGraphics graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color)` | Computes total width via `SdfGlyphAtlas#measureText` and draws centered horizontally at `x`. |

---

### 2. Atlas & Layout Internal Classes (`SdfGlyphAtlas` / `SdfGlyphPage` / `SdfAtlasTexture` / `SdfTextLayout` / `SdfTextRenderState`)

| Class | Key Constants / Method Signatures | Description |
| :--- | :--- | :--- |
| **`SdfGlyphAtlas`** | • `ATLAS_SIZE = 2048`, `GLYPH_SIZE = 32`, `SPREAD = 4`, `OVERSAMPLE = 8`, `PAGE_COUNT = 16`, `CHARS_PER_PAGE = 4096`<br>• `public static CompletableFuture<SdfGlyphAtlas> getOrCreate(@Nullable Font font)`<br>• `public static @Nullable SdfGlyphAtlas getIfReady(@Nullable Font font)`<br>• `public @Nullable GlyphMetrics metrics(int codepoint)`<br>• `public int measureText(String text)` / `measureText(String text, int start, int end)`<br>• `public record GlyphMetrics(int pageIndex, float u0, float v0, float u1, float v1, int width, int height, int bearingX, int bearingY, int advance)` | Manages 16 on-demand paged SDF atlases for a single `Font` and text advance width measurement. |
| **`SdfGlyphPage`** | `public static SdfGlyphPage build(Font baseFont, int pageIndex, int rangeStart, int rangeEnd, int glyphSize, int spread, int oversample, int atlasSize)` | Performs 8× oversampled rasterization and linear-time EDT distance transform to build a single `2048×2048` byte page. |
| **`SdfAtlasTexture`** | • `public static void ensureUploaded(SdfGlyphAtlas atlas)`<br>• `public static @Nullable Identifier pageLocation(SdfGlyphAtlas atlas, int pageIndex)`<br>• `public static void releaseAll()` | Manages staggered CPU-to-GPU `DynamicTexture` uploads (max 1 page per frame) and texture disposal. |
| **`SdfTextLayout`** | • `public static SdfTextLayout fromAtlas(SdfGlyphAtlas atlas, String text, int x, int y, float scale)`<br>• `public record GlyphQuad(float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1)`<br>• `public record PageQuads(int pageIndex, @Nullable Identifier atlasTexture, int pageWidth, int pageHeight, List<GlyphQuad> quads)` | Lays out a string into page-grouped screen-space quads `List<PageQuads>` and total pixel `width()`. |
| **`SdfTextRenderState`** | • `public record SdfTextRenderState(Matrix3x2f pose, List<SdfTextLayout.GlyphQuad> glyphs, Identifier atlasTexture, GpuSampler diffuseSampler, int atlasWidth, int atlasHeight, int color, int originX, int originY, @Nullable ScreenRectangle scissorArea) implements LibGuiElementRenderState`<br>• `pipeline()` / `textureSetup()` / `executeDrawAfterSetPipeline(RenderPass)` / `buildVertices(VertexConsumer)` / `bounds()` | (`@ApiStatus.Internal`) Encapsulates 1.21.11 `GuiElementRenderState` draw state, binding `DiffuseSampler` via `bindTexture("DiffuseSampler", textureView, diffuseSampler)` and submitting glyph quads with `addVertexWith2DPose(pose, x, y)`. |
