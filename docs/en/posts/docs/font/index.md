---
title: Font SDF Text Rendering
prev: false
next: false
---

# SDF Font Rendering Module <Badge type="tip" text=">=26.1" />

The package `dev.anvilcraft.lib.v2.font` provides an **SDF (Signed Distance Field)** based font rendering system that
supports loading arbitrary system AWT fonts and using them for Minecraft GUI text rendering, complete with a
configuration
screen and styled text support.

::: warning Availability
This module is **only** available in Minecraft **26.1**.
:::

## Architecture Overview

1. **Entry Layer** — `AnvilLibFont` is the `@Mod` entry point (CLIENT-only), provides `getSelectFont()` to get the
   currently configured AWT Font, and registers `FontConfigScreen` as the config screen
2. **Discovery Layer** — `FontManager` singleton discovers all system fonts via AWT `GraphicsEnvironment`, builds a
   font family Trie index, and provides `getFont(String name)` and `getFamilyNames()`/`getFamilyFontNames()`
3. **Configuration Layer** — `AnvilLibFontConfig` is a JSON-based config (stored at
   `config/anvillib/anvillib-font-client.json`), reading/writing `fontFamily` and `font` selections via Gson
4. **Rendering Layer** — `SdfTextRenderer` is the main renderer supporting `drawString`, `drawFormatted`,
   `drawComponent`,
   `drawCentered`, and `drawWrapped` methods
5. **Atlas Layer** — `SdfGlyphAtlas` is a multi-page CPU-side SDF glyph atlas with 1024x1024 pages, pre-warming
   ASCII 32-126, lazy-rendering other codepoints, using the Dead Reckoning EDT algorithm for SDF computation
6. **Layout Layer** — `SdfTextLayout` performs CPU-side glyph layout, grouping glyphs by atlas page and outputting
   `PageQuads` with UV coordinates per glyph
7. **Upload Layer** — `SdfAtlasTexture` uploads atlas pages to the GPU as `RED8` textures (LINEAR + CLAMP filtering)
8. **State Layer** — `SdfTextRenderState` implements `LibGuiElementRenderState`, building quad vertices for SDF text
   rendering through the `ALFPipelines.SDF_TEXT` pipeline

## Document Index

| Document          | Contents                                                                                                  |
|-------------------|-----------------------------------------------------------------------------------------------------------|
| [Core API](./api) | `AnvilLibFont`, `FontManager`, `SdfTextRenderer`, `SdfGlyphAtlas`, `SdfTextLayout`, GUI extension methods |

## Quick Start

```java
// 1. Get the currently configured font
Font font = AnvilLibFont.getSelectFont();

// 2. Draw text in GuiGraphics
graphics.anvillib$text(font, "Hello SDF Text", x, y, 0xFFFFFFFF);

// 3. Draw centered text
graphics.anvillib$centeredText(font, Component.literal("Centered"), x, y, 0xFFFFFF00);

// 4. Draw text with word wrap
graphics.anvillib$textWithWordWrap(font, FormattedText.of("Long text..."), x, y, width, 0xFFFFFFFF);

// 5. Draw text with backdrop color outline
graphics.anvillib$textWithBackdrop(font, "Backdrop Text", x, y, 0xFFFFFFFF, 0x80000000);
```

## Dependency Management

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-font-neoforge-26.1:2.0.0"
}
```

> This module depends on `module.rendering` (uses `LibGuiElementRenderState`) and is client-side only
> (`@Mod(dist = Dist.CLIENT)`).

## Notes

- `AnvilLibFont.getSelectFont()` returns an AWT `java.awt.Font` instance
- `SdfGlyphAtlas` uses a static cache keyed by font name + style + size; identical parameters reuse the atlas
- Atlas pages are 1024x1024; glyphs are rendered lazily on demand
- GUI extension methods are injected into `GuiGraphics` via Mixin (`GuiGraphicsExtractorMixin`) and exposed through
  the `GuiGraphicsExtractorExtension` interface
- Supported text styles: bold, italic, underline, strikethrough, obfuscated
