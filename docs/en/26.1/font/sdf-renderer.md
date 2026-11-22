# SDF Glyph Atlas & Text Layout Renderer (`dev.anvilcraft.lib.v2.font.sdf`)

<BranchContextCard branch="26.1" />

This page dives into `module.font`'s low-level SDF (Signed Distance Field) glyph generation algorithm, dynamic paged atlas management, text layout caching, and 26.1 GUI render-state submission pipeline.

---

## 1. How the SDF Text Rendering Pipeline Works

1. **Virtual-Thread Async Glyph Rasterization & EDT Distance Field (`SdfGlyphAtlas`)**:
   - Each `java.awt.Font` (uniquely keyed by `fontName.style.size`, automatically derived to `64px` HD if size `< 4`) maps to one `SdfGlyphAtlas` instance;
   - On initialization, ASCII `32–126` characters are generated synchronously; when non-ASCII codepoints (Chinese, Japanese, symbols) are encountered, `atlas.glyph(codepoint, ...)` immediately returns `null` (advancing by half-width whitespace for that frame without blocking the render thread) and dispatches the codepoint to `AnvilLib-SDF-Glyph-*` virtual threads;
   - On the background thread, AWT `Graphics2D` renders the glyph into an anti-aliased alpha mask on a white background, then a two-pass **Dead Reckoning Euclidean Distance Transform (EDT)** computes the signed distance to the nearest edge, normalized to `[0, 255]` in `SdfGlyphPage` (`0.5` / `128` is the glyph contour), with `padding` border extrusion around each cell to prevent bilinear sampling bleed.
   - Once generated, `SdfGlyphPage.version` increments and `SdfTextLayout.invalidateAtlas(key)` invalidates layout caches so the new glyph appears on the next frame.
2. **On-Demand Dirty Page Upload to Single-Channel GPU Texture (`SdfAtlasTexture` & `SdfGlyphPage`)**:
   - Each `SdfGlyphPage` is `1024 × 1024`. Before each frame, `SdfAtlasTexture.ensureUploaded(atlas)` checks every page's `dirty` flag and atomic `version`; if updated, it uploads to a `TextureFormat.RED8` single-channel GPU texture with a `FilterMode.LINEAR` sampler.
3. **Page-Bucketed CPU Layout Cache (`SdfTextLayout`)**:
   - `SdfTextLayout.fromAtlas(atlas, text, x, y, scale)` converts codepoints into `GlyphQuad` rectangles relative to `(0, 0)` and buckets them by `pageIndex` into `List<PageQuads>`;
   - When all codepoints in a text are ready (`allGlyphsAvailable == true`), the layout is cached in `LAYOUT_CACHE` (capacity `1024`) keyed by `(atlasKey, text, round(scale * 1000))`.
4. **GUI Render State Submission (`SdfTextRenderer` & `SdfTextRenderState`)**:
   - `SdfTextRenderer` parses colors, bold/italic (`base.deriveFont(mask)`), underline/strikethrough, and obfuscation (randomizing ASCII every `300 ms`) from `FormattedCharSequence`, wraps each `PageQuads` into `SdfTextRenderState` (implementing `LibGuiElementRenderState`), and submits it via `graphics.submitGuiElementRenderState(state)` to Minecraft 26.1's GUI pipeline.

---

## 2. Classes & API Reference

### 1. `SdfTextRenderer` (SDF Text Renderer, `@Beta`)

Located in `dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer`. Usually obtained via `GuiGraphicsExtractor#anvillib$textRenderer()`, or instantiated directly.

| Constructor / Method Signature | Parameters & Behavior |
| :--- | :--- |
| `public SdfTextRenderer()` | Creates a renderer bound to a `FilterMode.LINEAR` edge-clamped sampler. |
| `public void drawString(GuiGraphicsExtractor graphics, @Nullable Font font, @Nullable String text, int x, int y, int color, boolean dropShadow)` | Draws a plain string at `(x, y)` using `font` (falls back to `Dialog` 64px if `null`). Returns immediately if `text` is `null` or empty. |
| `public void drawComponent(GuiGraphicsExtractor graphics, @Nullable Font font, Component text, int x, int y, int color, boolean dropShadow)` | Converts `Component` to `text.getVisualOrderText()` and delegates to `drawFormatted`. |
| `public void drawFormatted(GuiGraphicsExtractor graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color, boolean dropShadow)` | Iterates characters in `FormattedCharSequence`:<br>• Supports `style.isObfuscated()` dynamic random character scrambling;<br>• Flushes segments (`flushFormattedSegment`) and derives weighted `Font`s whenever color, `bold`, or `italic` changes;<br>• Supports `style.isUnderlined()` and `style.isStrikethrough()` using `0.5f` Y-axis scaling for crisp thin lines. |
| `public void drawWrapped(GuiGraphicsExtractor graphics, @Nullable Font font, FormattedText text, int x, int y, int width, int color, boolean dropShadow)` | Wraps `text` to `width` using `ALFont.wrapLines` and draws line by line with `lineHeight` spacing. |
| `public void drawCentered(GuiGraphicsExtractor graphics, @Nullable Font font, Component text, int x, int y, int color)` | Measures visual width of `Component` and draws centered around `x` via `drawFormatted`. |
| `public void drawCentered(GuiGraphicsExtractor graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color)` | Measures width of `FormattedCharSequence` and draws centered around `x` via `drawFormatted`. |

### 2. `SdfGlyphAtlas` (Multi-Page On-Demand SDF Glyph Atlas, `@ApiStatus.Internal`)

Located in `dev.anvilcraft.lib.v2.font.sdf.SdfGlyphAtlas`.

| Method / Record Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static CompletableFuture<SdfGlyphAtlas> getOrCreate(@Nullable Font font)` | `CompletableFuture<SdfGlyphAtlas>` | Asynchronously builds (or retrieves from cache) the SDF atlas `CompletableFuture` for `font` on background virtual threads. |
| `public static @Nullable SdfGlyphAtlas getIfReady(@Nullable Font font)` | `@Nullable SdfGlyphAtlas` | Non-blocking atlas lookup: returns the instance if ready, `null` if still building, or removes a failed future and re-triggers building if a previous attempt failed. |
| `public String key()` / `public Font font()` | `String` / `Font` | Returns the unique atlas key (`<fontName>.<style>.<size>`) and resolved `64px` `Font`. |
| `public int awtHeight()` / `public int awtAscent()` | `int` | Returns total height and baseline ascent of the AWT font at atlas size. |
| `public int pageCount()` / `public SdfGlyphPage page(int index)` | `int` / `SdfGlyphPage` | Returns the number of allocated `1024×1024` atlas pages and the page at `index`. |
| `public @Nullable GlyphEntry glyph(int codepoint, Consumer<SdfGlyphPage> pageConsumer)` | `@Nullable GlyphEntry` | Queries the glyph entry for a Unicode codepoint. If not yet generated, submits an async virtual-thread task and returns `null`. |
| `public int measureText(String text)` / `measureText(String text, int start, int end)` | `int` | Measures total advance width of a string or substring in atlas pixel coordinates (unready glyphs count as `cellSize / 2`). |
| `public int measureCodepoint(int codepoint)` | `int` | Measures the advance width of a single codepoint in atlas pixel coordinates. |
| `public record GlyphEntry(int pageIndex, int atlasX, int atlasY, int width, int height, int advance)` | `record` | Stores a glyph's page index, top-left coordinates `(atlasX, atlasY)`, dimensions (with `endX()` / `endY()` helpers), and horizontal `advance`. |

### 3. `SdfGlyphPage`, `SdfAtlasTexture`, `SdfTextLayout` & `SdfTextRenderState` (`@ApiStatus.Internal`)

| Class | Core Method Signatures | Responsibilities |
| :--- | :--- | :--- |
| `SdfGlyphPage` | `public void updateHash()` | Manages a single `1024×1024` `TYPE_BYTE_GRAY` grayscale buffered image, grid row/column cursors, and `AtomicInteger version`. |
| `SdfAtlasTexture` | `public static Identifier uploadPage(SdfGlyphAtlas atlas, int pageIndex)`<br>`public static void ensureUploaded(SdfGlyphAtlas atlas)` | Converts dirty pages to `NativeImage` and uploads them as `TextureFormat.RED8` + `FilterMode.LINEAR` GPU textures registered with `Minecraft.getInstance().getTextureManager()` (path like `anvillib_font:dynamic/sdf_atlas/<sanitized_key>`). |
| `SdfTextLayout` | `public static SdfTextLayout fromAtlas(SdfGlyphAtlas atlas, @Nullable String text, int x, int y, float scale)`<br>`public static void invalidateAtlas(String atlasKey)`<br>`public static void clearCache()`<br>`public List<PageQuads> pages()`<br>`public int width()` / `public int height()` | Computes and caches glyph quads for strings. Exposes `PageQuads(int pageIndex, @Nullable Identifier atlasTexture, int pageWidth, int pageHeight, List<GlyphQuad> quads)` and `GlyphQuad(int x0, int y0, int x1, int y1, float u0, float v0, float u1, float v1, char glyph)`. |
| `SdfTextRenderState` | `public record SdfTextRenderState(...) implements LibGuiElementRenderState` | Implements `module.rendering`'s `LibGuiElementRenderState`, binding `ALFPipelines.SDF_TEXT` and `DiffuseSampler`, submitting glyph quad vertices via `consumer.addVertexWith2DPose` in `buildVertices`, and computing scissor bounds via `LibGuiElementRenderState.getBounds`. |
