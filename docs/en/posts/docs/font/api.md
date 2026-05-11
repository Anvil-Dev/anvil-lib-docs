---
title: Font Core API
prev: false
next: false
---

# Core API <Badge type="tip" text=">=26.1" />

## AnvilLibFont

Main mod class, `@Mod` entry point. Client-side only (`Dist.CLIENT`), modid `"anvillib_font"`.

```java
@Mod(value = "anvillib_font", dist = Dist.CLIENT)
public class AnvilLibFont {
    // Get the currently configured AWT Font
    public static Font getSelectFont();
}
```

`getSelectFont()` reads the user-selected font family and font name from `AnvilLibFontConfig` and resolves it to an
AWT `java.awt.Font` instance via `FontManager`.

## ALFont

Wrapper around `java.awt.Font` providing text measurement and layout utilities. Internally delegates to `SdfGlyphAtlas`
for glyph metrics.

```java
ALFont alf = new ALFont(AnvilLibFont.getSelectFont());

// Text width measurement
int w = alf.width("Hello World");
int w2 = alf.width(Component.literal("Hello"));

// Substring by pixel width (forward/reverse)
String head = alf.plainSubstrByWidth("Hello World", 50);
String tail = alf.plainSubstrByWidth("Hello World", 50, true);

// Word wrapping
List<FormattedCharSequence> lines = alf.split(FormattedText.of(text), 200);
int totalHeight = alf.wordWrapHeight(FormattedText.of(text), 200);

// Underlying AWT font
Font awt = alf.awtFont();
```

| Method                                                                    | Description                    |
|---------------------------------------------------------------------------|--------------------------------|
| `alf.font()`                                                              | Returns the wrapped AWT `Font` |
| `width(String)` / `width(FormattedText)` / `width(FormattedCharSequence)` | Text pixel width               |
| `plainSubstrByWidth(str, maxW)`                                           | Forward substring by width     |
| `plainSubstrByWidth(str, maxW, true)`                                     | Reverse substring by width     |
| `split(FormattedText, maxW)`                                              | Word-wrap line splitting       |
| `wordWrapHeight(FormattedText, maxW)`                                     | Total height after wrapping    |## FontManager

System font discovery and management singleton.

```java
public class FontManager {
    // Get the singleton instance
    public static FontManager getInstance();

    // Create a Font by name (default 16px)
    public Font getFont(@Nullable String name);

    // Create a Font by name and size
    public Font getFont(String name, float size);

    // Get all font family names
    public String[] getFamilyNames();

    // Get all font names within a given family
    public String[] getFamilyFontNames(String familyName);
}
```

### Internal Mechanisms

- Discovers all system fonts via AWT `GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames()`
- Builds a font family Trie (`FontTrie`) for efficient family name grouping and prefix lookup
- `getFont(String name)` returns a 16px `Font.PLAIN` font, falls back to a default font if the name is not found

## AnvilLibFontConfig

JSON configuration file manager. Config file path: `config/anvillib/anvillib-font-client.json`.

```java
public class AnvilLibFontConfig {
    public String fontFamily; // Selected font family
    public String font;       // Selected font name

    // Read config from file
    public static AnvilLibFontConfig read();

    // Write config to file
    public void write();
}
```

Uses Gson for JSON serialization/deserialization. `read()` returns a default config when the file does not exist.

## SdfTextRenderer

Main SDF text renderer supporting multiple draw modes.

```java
public class SdfTextRenderer {
    // Draw plain text string
    public void drawString(
        GuiGraphicsExtractor graphics,
        Font font,
        String text,
        float x, float y,
        int color,
        boolean dropShadow
    );

    // Draw formatted text sequence
    public void drawFormatted(
        GuiGraphicsExtractor graphics,
        Font font,
        FormattedCharSequence text,
        float x, float y,
        int color,
        boolean dropShadow
    );

    // Draw a Component (auto-resolves styles)
    public void drawComponent(GuiGraphics graphics, Component component);

    // Draw a centered Component
    public void drawCentered(GuiGraphics graphics, Component component);

    // Draw formatted text with word wrap
    public void drawWrapped(
        GuiGraphics graphics,
        FormattedText text,
        int width
    );
}
```

### Style Support

The renderer supports the following text styles, automatically applied in `drawFormatted` and `drawComponent`:

| Style             | Effect                                 |
|-------------------|----------------------------------------|
| **Bold**          | Renders text with increased weight     |
| *Italic*          | Renders text with slant                |
| <u>Underline</u>  | Draws a line below the text            |
| ~~Strikethrough~~ | Draws a line through the text          |
| Obfuscated        | Random character replacement animation |

## SdfGlyphAtlas

CPU-side multi-page SDF glyph atlas, responsible for glyph rasterization and SDF computation.

```java
public class SdfGlyphAtlas {
    // Get or create atlas (cached by font name + style + size)
    public static SdfGlyphAtlas getAtlas(Font font);

    // Atlas page size (1024x1024 per page)
    public static final int PAGE_SIZE = 1024;

    // Get glyph info for a codepoint (includes UV coordinates and page index)
    public GlyphInfo getGlyph(int codePoint);

    // Get current page count
    public int getPageCount();
}
```

### Internal Mechanisms

- Pre-warms glyphs in the ASCII 32-126 range (space through tilde)
- Other codepoints are lazy-rendered on demand
- Uses the Dead Reckoning EDT (Euclidean Distance Transform) algorithm for SDF field computation
- Static cache: atlases with the same font name + style + size reuse a `static` cache

## SdfTextLayout

CPU-side glyph layout engine that computes glyph positions and groups them by atlas page.

```java
public class SdfTextLayout {
    // Layout text and return quad data grouped by atlas page
    public static PageQuads layout(
        Font font,
        CharSequence text,
        float x, float y,
        Style style
    );

    // PageQuads contains glyph quad lists with UV coordinates per atlas page
    public static class PageQuads {
        public int pageIndex;
        public List<GlyphQuad> quads;
    }
}
```

Layout automatically handles kerning and line height.

## SdfAtlasTexture

Uploads `SdfGlyphAtlas` CPU-side data to GPU textures.

```java
public class SdfAtlasTexture {
    // Upload an atlas page to GPU (RED8 format, LINEAR filter, CLAMP wrap)
    public void upload(int pageIndex, SdfGlyphAtlas atlas);

    // Get the GPU texture handle
    public Texture getTexture(int pageIndex);
}
```

Texture format is `RED8` (single channel, 8 bits), using `LINEAR` filtering for smooth scaling and `CLAMP` wrapping
to prevent edge bleeding.

## SdfTextRenderState

Implements `LibGuiElementRenderState`, building GPU render state for SDF text rendering.

```java
public class SdfTextRenderState implements LibGuiElementRenderState {
    // Build vertex buffer from glyph quad data
    public void buildVertices(PageQuads quads, int color);

    // Submit rendering via ALFPipelines.SDF_TEXT pipeline
    @Override
    public void render();
}
```

## GUI Extension Methods

Injected into Minecraft's `GuiGraphics` via the `GuiGraphicsExtractorExtension` interface and
`GuiGraphicsExtractorMixin` Mixin.

```java
public interface GuiGraphicsExtractorExtension {
    // Draw text
    void anvillib$text(Font font, String text, float x, float y, int color);

    // Draw text with drop shadow
    void anvillib$text(Font font, String text, float x, float y, int color, boolean dropShadow);

    // Draw centered text (Component)
    void anvillib$centeredText(Font font, Component component, int x, int y, int color);

    // Draw text with word wrap
    void anvillib$textWithWordWrap(Font font, FormattedText text, int x, int y, int width, int color);

    // Draw text with backdrop color outline
    void anvillib$textWithBackdrop(Font font, String text, int x, int y, int color, int backdropColor);
}
```

> All extension methods use the `anvillib$` prefix and require an AWT `java.awt.Font` parameter.

## Screens

### FontConfigScreen

Configuration screen allowing users to select a font family and specific font.

- **Font family dropdown**: Lists all available font families (via `FontManager.getFamilyNames()`)
- **Font dropdown**: Lists all fonts within the selected family (via `FontManager.getFamilyFontNames()`)
- **Test button**: Opens `FontTestScreen` to preview the currently selected font

### FontTestScreen

Font testing screen showing sample text rendered in various styles and multiple languages with the selected font.

### Dropdown

Custom dropdown widget with the following features:

- Scrollbar support for large option lists
- Auto-close on outside click (shielding)
- Accessibility narration support

## ALFPipelines

Vulkan/OpenGL pipeline definition for SDF text rendering.

```java
public class ALFPipelines {
    // SDF_TEXT pipeline config:
    // - Vertex format: QUADS
    // - Blend mode: TRANSLUCENT
    // - Uniforms: DynamicTransforms + Projection
    // - Sampler: DiffuseSampler
    // - Face culling: None (NO_CULL)
    public static final RenderingPipeline SDF_TEXT;
}
```

## AnvilLibFontData

Data generation class responsible for generating the `en_us.json` language file.

```java
@DataGen
public class AnvilLibFontData {
    // Generate en_us.json translation file
}
```
