# Font Management, Config & GuiGraphics Extensions (`module.font`)

<BranchContextCard branch="26.1" />

`module.font` (artifact `anvillib-font-neoforge-26.1`, package `dev.anvilcraft.lib.v2.font`) is a client-side high-definition vector font rendering framework. It scans the host OS's AWT local fonts (`FontManager`), rasterizes TrueType / OpenType glyphs and computes Signed Distance Field (SDF) atlases in the background using virtual threads, and renders smooth anti-aliased vector text via a custom fragment shader pipeline (`ALFPipelines.SDF_TEXT`) and extension methods injected into `GuiGraphicsExtractor`.

This module is split into 3 sub-documents by functionality:
- **This page (Font Management, Config & GuiGraphics Extensions)**: Covers `AnvilLibFont`, `AnvilLibFontConfig`, `FontManager`, `ALFont`, `ALFPipelines`, and `GuiGraphicsExtractorExtension` interface injection methods.
- **[SDF Glyph Atlas & Text Layout Renderer](./sdf-renderer)**: Covers `SdfTextRenderer`, `SdfTextLayout`, `SdfGlyphAtlas`, `SdfGlyphPage`, `SdfAtlasTexture`, and `SdfTextRenderState`.
- **[Font Config & Test Screen Widgets](./screens)**: Covers `FontConfigScreen`, `FontTestScreen`, `Dropdown`, and `AnvilLibFontData`.

---

## 1. Setup (Including Interface Injection)

`module.font` injects `GuiGraphicsExtractorExtension` into vanilla's `net.minecraft.client.gui.GuiGraphicsExtractor` (providing `graphics.anvillib$text(...)`, `graphics.anvillib$centeredText(...)`, etc.). To call these injected methods at compile time, you must also configure `interfaceInjectionData` in `build.gradle.kts`:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-font-neoforge-26.1:2.0.0")
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-font-neoforge-26.1:2.0.0")
}
```

---

## 2. Core Usage & Full Code Example

### 1. Problem & Usage

Vanilla Minecraft bitmap fonts alias easily when scaled or on HiDPI displays, and using modern system-installed fonts (such as `HarmonyOS Sans SC`, `Microsoft YaHei`, `PingFang`) with line-wrap width measurement normally requires tedious resource-pack TTF definitions.

With `module.font`:
1. Call `AnvilLibFont.getSelectFont()` to get the player's currently selected system `java.awt.Font` from the config screen (or `FontManager.INSTANCE.getFont("Microsoft YaHei")` for a specific system font);
2. Use `new ALFont(awtFont)` to measure GUI pixel widths, truncate by width, or word-wrap text;
3. Inside `Screen#extractRenderState` or custom widget rendering methods, call `guiGraphics.anvillib$text(...)` or `guiGraphics.anvillib$centeredText(...)` directly to draw crisp SDF text (with full support for `Component` colors, `bold`, `italic`, `underlined`, `strikethrough`, and `obfuscated` styles).

### 2. Full Code Example

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
        // Get the player's currently selected global font (or call FontManager.INSTANCE.getFont("Microsoft YaHei"))
        this.bodyAwtFont = AnvilLibFont.getSelectFont();
        this.bodyMetrics = new ALFont(this.bodyAwtFont);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);

        int centerX = this.width / 2;
        int topY = 30;

        // 1. Draw a centered title Component with bold and color styles
        Component header = Component.literal("Multiblock Reactor Manual")
            .withStyle(Style.EMPTY.withBold(true).withColor(ChatFormatting.GOLD));
        graphics.anvillib$centeredText(this.bodyAwtFont, header, centerX, topY, 0xFFFFFFFF);

        // 2. Measure width with ALFont and draw a status badge with a translucent backdrop
        Component badge = Component.literal("Status: Nominal").withStyle(ChatFormatting.GREEN);
        int badgeWidth = this.bodyMetrics.width(badge);
        graphics.anvillib$textWithBackdrop(
            this.bodyAwtFont,
            badge,
            centerX - badgeWidth / 2,
            topY + 20,
            badgeWidth,
            0xFFFFFFFF
        );

        // 3. Draw a long paragraph with automatic word wrapping
        Component paragraph = Component.literal(
            "When the reactor core temperature exceeds 1200K, the coolant valve opens automatically."
            + "\nPlease ensure sufficient liquid sodium in the input pipe."
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

## 3. Public Classes & Interfaces API Reference

### 1. `GuiGraphicsExtractorExtension` (`GuiGraphicsExtractor` Injected Interface, `@Beta`)

Located in `dev.anvilcraft.lib.v2.font.extension.GuiGraphicsExtractorExtension`. Mixed into `net.minecraft.client.gui.GuiGraphicsExtractor` via Mixin and interface injection; each `GuiGraphicsExtractor` instance holds an internal `SdfTextRenderer`.

| Method Signature | Parameters & Behavior |
| :--- | :--- |
| `default GuiGraphicsExtractor self()` | Returns `(GuiGraphicsExtractor) this`. |
| `default SdfTextRenderer anvillib$textRenderer()` | Returns the `SdfTextRenderer` instance bound to this `GuiGraphicsExtractor`. |
| `default void anvillib$text(Font font, @Nullable String str, int x, int y, int color)` | Draws a plain string at `(x, y)` using `font` (no drop shadow). |
| `default void anvillib$text(Font font, @Nullable String str, int x, int y, int color, boolean dropShadow)` | Draws a plain string at `(x, y)` using `font` (delegates to `SdfTextRenderer#drawString`). |
| `default void anvillib$text(Font font, FormattedCharSequence str, int x, int y, int color)` | Draws a styled `FormattedCharSequence` at `(x, y)`. |
| `default void anvillib$text(Font font, FormattedCharSequence str, int x, int y, int color, boolean dropShadow)` | Draws a styled `FormattedCharSequence` at `(x, y)` (delegates to `SdfTextRenderer#drawFormatted`). |
| `default void anvillib$text(Font font, Component str, int x, int y, int color)` | Draws a `Component` at `(x, y)`. |
| `default void anvillib$text(Font font, Component str, int x, int y, int color, boolean dropShadow)` | Draws a `Component` at `(x, y)` (delegates to `SdfTextRenderer#drawComponent`). |
| `default void anvillib$centeredText(Font font, String str, int x, int y, int color)` | Draws a string centered horizontally at `x`. |
| `default void anvillib$centeredText(Font font, Component text, int x, int y, int color)` | Draws a `Component` centered horizontally at `x`. |
| `default void anvillib$centeredText(Font font, FormattedCharSequence text, int x, int y, int color)` | Draws a `FormattedCharSequence` centered horizontally at `x`. |
| `default void anvillib$textWithWordWrap(Font font, FormattedText string, int x, int y, int width, int col)` | Draws `FormattedText` automatically wrapped to `width`. |
| `default void anvillib$textWithWordWrap(Font font, FormattedText string, int x, int y, int width, int col, boolean dropShadow)` | Draws `FormattedText` wrapped to `width` (delegates to `SdfTextRenderer#drawWrapped`). |
| `default void anvillib$textWithBackdrop(Font font, Component str, int textX, int textY, int textWidth, int textColor)` | Draws a translucent rectangular backdrop with `2px` padding using `Minecraft.getInstance().options.getBackgroundColor(0.0F)`, then draws `str` on top. |

### 2. `ALFont` (SDF Font Metrics & Word-Wrap Wrapper, `@Beta`)

Located in `dev.anvilcraft.lib.v2.font.ALFont`. Wraps a `java.awt.Font` and scales the 64px glyph metrics from the SDF atlas to Minecraft GUI pixel units via `scale = lineHeight / atlas.awtHeight()`.

| Field / Constructor / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public final int lineHeight` | `int` | Line height, defaulting to `Minecraft.getInstance().font.lineHeight` (9 pixels). |
| `public ALFont(Font font)` | — | Wraps the specified `java.awt.Font`. |
| `public Font awtFont()` | `Font` | Returns the underlying `java.awt.Font` object. |
| `public int width(String str)` | `int` | Computes pixel width of a plain string in GUI coordinates (`Mth.ceil(atlas.measureText(str) * scale)`). |
| `public int width(FormattedText text)` | `int` | Computes pixel width of a `FormattedText`. |
| `public int width(FormattedCharSequence text)` | `int` | Computes pixel width of a `FormattedCharSequence`. |
| `public String plainSubstrByWidth(String str, int maxWidth)` | `String` | Returns the longest prefix substring not exceeding `maxWidth` (uses binary search `O(log N)` internally). |
| `public String plainSubstrByWidth(String str, int maxWidth, boolean reverse)` | `String` | When `reverse = false`, returns the longest prefix; when `reverse = true`, returns the longest suffix substring not exceeding `maxWidth`. |
| `public FormattedText substrByWidth(FormattedText text, int maxWidth)` | `FormattedText` | Truncates `text` to at most `maxWidth`. |
| `public List<FormattedCharSequence> split(FormattedText input, int maxWidth)` | `List<FormattedCharSequence>` | Wraps `input` into multiple `FormattedCharSequence` lines constrained to `maxWidth`. |
| `public int wordWrapHeight(FormattedText input, int maxWidth)` | `int` | Computes total pixel height of `input` wrapped to `maxWidth` (`lineHeight * split(input, maxWidth).size()`). |
| `public static List<String> wrapLines(SdfGlyphAtlas atlas, String text, int maxWidth, float scale)` | `List<String>` | Greedily wraps `text` by newlines `\n` and word spaces. |

### 3. `FontManager` (System Font Scanner & Trie Family Grouping, `@Beta`)

Located in `dev.anvilcraft.lib.v2.font.FontManager`, with global singleton `FontManager.INSTANCE`.

On construction, `FontManager` calls `GraphicsEnvironment.getLocalGraphicsEnvironment().getAllFonts()` to collect all system fonts, groups weight variants (such as `HarmonyOS Sans SC Regular`, `HarmonyOS Sans SC Bold`) under a single family name via an internal `FontTrieNode` on space boundaries, and picks the default font (`DEFAULT_FONTS`) in this priority order:
1. `"HarmonyOS Sans SC"` → 2. `"Microsoft YaHei"` → 3. `"微软雅黑"` → 4. `"PingFang"` → 5. `"苹方"` → 6. `"Cantarell"` → 7. `"Noto Sans"` → 8. Swing `UIManager.getFont("Label.font")` → 9. any available system font.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public Collection<String> getFamilyNames()` | `Collection<String>` | Returns the collection of all grouped font family names. |
| `public String getFamilyName(Font font)` | `String` | Returns the family name for the given `Font` (falls back to `font.getFontName()` if ungrouped). |
| `public String getDefaultFontFamily()` | `String` | Returns the family name of the default font. |
| `public Collection<String> getFamilyFontNames(String familyName)` | `Collection<String>` | Returns all full font names under `familyName`; returns `Set.of()` if the family does not exist. |
| `public Font getFont(@Nullable String name)` | `Font` | Returns the `Font` instance by full font name; safely falls back to `getDefaultFont()` if `name == null` or not found. |
| `public Font getDefaultFont()` | `Font` | (Lombok `@Getter`) Returns the system default fallback font. |

### 4. `AnvilLibFont`, `AnvilLibFontConfig` & `ALFPipelines`

| Class | Key Constants / Method Signatures | Description |
| :--- | :--- | :--- |
| `AnvilLibFont` | `MAIN_ID = "anvillib"`<br>`MOD_ID = "anvillib_font"`<br>`CONFIG = new AnvilLibFontConfig()`<br>`public static Font getSelectFont()`<br>`public static Identifier of(String path)` | Client mod entry point. Reads JSON config on construction, registers `FontConfigScreen` on `ModContainer`, and pre-warms `SdfGlyphAtlas` on background virtual threads for the base font and its `BOLD`, `ITALIC`, and `BOLD \| ITALIC` variants to avoid hitches on first styled text render. |
| `AnvilLibFontConfig` | `public String getFontFamily()` / `setFontFamily(String)`<br>`public String getFont()` / `setFont(String)` | Client font config model persisted with Gson to `config/anvillib/anvillib_font-client.json`. Calling `setFontFamily` or `setFont` saves to disk automatically. |
| `ALFPipelines` | `public static final VertexFormat SDF_TEXT_FORMAT`<br>`public static final RenderPipeline SDF_TEXT` | (`@ApiStatus.Internal`) Registers the `anvillib_font:sdf_text` render pipeline in `RegisterRenderPipelinesEvent` (vertex format `Position + Color + UV`, topology `QUADS`, `BlendFunction.TRANSLUCENT` enabled, backface culling disabled). |
