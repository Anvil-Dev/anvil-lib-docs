# Font Client Font Management & Config (`module.font`)

<BranchContextCard branch="1.21.1" />

`module.font` (artifact `anvillib-font-neoforge-1.21.1`, package `dev.anvilcraft.lib.v2.font`) is a physical-client **system TrueType/OpenType font scanner and Signed Distance Field (SDF) high-definition smooth text rendering module**.

Vanilla Minecraft's bitmap fonts alias when scaled or on HiDPI screens, while rasterizing vector fonts via Java AWT every frame stalls the main thread. `module.font` solves this with:
1. **`FontManager`**: Scans all OS-installed AWT fonts on startup, groups font families via a trie (`FontTrieNode`), and falls back in priority order to pick the best default font for CJK/Latin text (HarmonyOS Sans SC → Microsoft YaHei → PingFang → Cantarell → Noto Sans);
2. **Background async SDF glyph atlas pre-warming**: During mod init, background daemon threads build `2048×2048` 8×-oversampled SDF glyph atlases for Plain, Bold, Italic, and Bold+Italic variants of the selected font;
3. **`GuiGraphics` interface injection extensions**: Injects first-class methods `anvillib$text`, `anvillib$centeredText`, `anvillib$textWithWordWrap`, and `anvillib$textWithBackdrop` onto vanilla `net.minecraft.client.gui.GuiGraphics`!

This module is split into 3 sub-documents by functionality:
- **This page (Font Management, Config & `GuiGraphics` Extensions)**: Covers `AnvilLibFont`, `FontManager`, `AnvilLibFontConfig`, `ALFont`, `ALFPipelines`, and `GuiGraphicsExtractorExtension`.
- **[SDF Glyph Atlas & Text Renderer](./sdf-renderer)**: Covers `SdfTextRenderer`, `SdfGlyphAtlas`, `SdfGlyphPage`, `SdfAtlasTexture`, `SdfTextLayout`, `SdfTextMetrics`, and `SdfTextRenderState`.
- **[Font Config & Test Screens](./screens)**: Covers `FontConfigScreen`, `FontTestScreen`, and `Dropdown`.

---

## 1. Setup (Including Interface Injection Declaration)

To call `guiGraphics.anvillib$text(...)` and other injected methods on vanilla `GuiGraphics` at compile time, in addition to the module dependency, **you must declare `interfaceInjectionData` in `build.gradle.kts`**:

```kotlin
val anvillibVersion = "2.0.0"

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-font-neoforge-1.21.1:$anvillibVersion")
    // Enable GuiGraphics -> GuiGraphicsExtractorExtension interface injection
    interfaceInjectionData("dev.anvilcraft.lib:anvillib-font-neoforge-1.21.1:$anvillibVersion")
}
```

---

## 2. Full Code Example: Drawing Smooth SDF System-Font Text in a Screen or HUD

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
        // 1. Get the system font selected in the config screen (falls back to system default like Microsoft YaHei / HarmonyOS Sans)
        Font selectedFont = AnvilLibFont.getSelectFont();

        // 2. Draw a shadowed centered title directly on GuiGraphics via interface-injected methods
        Component title = Component.literal("High-Energy Magnetic Resonator - Nominal")
            .withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD);
        graphics.anvillib$centeredText(selectedFont, title, screenWidth / 2, 16, 0xFFFFFFFF);

        // 3. Draw a status line with a translucent backdrop
        Component statusLine = Component.literal("Current Flux: 12,800 FE/t")
            .withStyle(ChatFormatting.YELLOW);
        graphics.anvillib$textWithBackdrop(selectedFont, statusLine, 12, 36, 140, 0xFFFFFFFF);

        // 4. Draw an auto-wrapped paragraph (supports bold, italic, underline, strikethrough, and obfuscated styles)
        Font customFamilyFont = FontManager.INSTANCE.getFont("Microsoft YaHei");
        Component paragraph = Component.literal("Warning: When core temperature exceeds the critical threshold, immediately open the liquid nitrogen cooling loop to prevent meltdown.");
        graphics.anvillib$textWithWordWrap(customFamilyFont, paragraph, 12, 56, 180, 0xFFFF5555, true);
    }
}
```

---

## 3. Core Public Classes & Interfaces API Reference

### 1. `GuiGraphicsExtractorExtension` (Injected Interface on `GuiGraphics`)

Located in `dev.anvilcraft.lib.v2.font.extension.GuiGraphicsExtractorExtension`. Once injected via `interfaceInjectionData`, any `net.minecraft.client.gui.GuiGraphics` instance can call:

| Method Signature | Description |
| :--- | :--- |
| `default SdfTextRenderer anvillib$textRenderer()` | Returns the `SdfTextRenderer` bound to this `GuiGraphics`. |
| `default void anvillib$text(Font font, @Nullable String str, int x, int y, int color)`<br>`default void anvillib$text(Font font, @Nullable String str, int x, int y, int color, boolean dropShadow)` | Draws a plain string at `(x, y)` using `java.awt.Font` (with optional `dropShadow`). |
| `default void anvillib$text(Font font, FormattedCharSequence str, int x, int y, int color, [boolean dropShadow])` | Draws a `FormattedCharSequence`. |
| `default void anvillib$text(Font font, Component str, int x, int y, int color, [boolean dropShadow])` | Draws a `Component` (full support for color, bold, italic, underline, strikethrough, and `obfuscated` animations). |
| `default void anvillib$centeredText(Font font, String / Component / FormattedCharSequence text, int x, int y, int color)` | Draws text horizontally centered at `x` (using `SdfTextMetrics` for exact SDF width calculation). |
| `default void anvillib$textWithWordWrap(Font font, FormattedText string, int x, int y, int width, int col, [boolean dropShadow])` | Automatically wraps `FormattedText` to `width` pixels and draws line by line. |
| `default void anvillib$textWithBackdrop(Font font, Component str, int textX, int textY, int textWidth, int textColor)` | Draws a translucent backdrop padded by `2px` using vanilla `options.getBackgroundColor(0.0F)`, then draws shadowed `str` on top. |

---

### 2. `AnvilLibFont` & `FontManager`

| Class | Constants / Method Signatures | Return Type | Description |
| :--- | :--- | :--- | :--- |
| **`AnvilLibFont`** | • `public static final AnvilLibFontConfig CONFIG`<br>• `public static Font getSelectFont()`<br>• `public static ResourceLocation of(String path)` | `AnvilLibFontConfig`<br>`java.awt.Font`<br>`ResourceLocation` | Module main class. `getSelectFont()` returns the configured `Font` and ensures its background SDF atlas task is started. |
| **`FontManager`** | • `public static final FontManager INSTANCE`<br>• `public Font getDefaultFont()`<br>• `public String getDefaultFontFamily()`<br>• `public Collection<String> getFamilyNames()`<br>• `public String getFamilyName(Font font)`<br>• `public Collection<String> getFamilyFontNames(String familyName)`<br>• `public Font getFont(@Nullable String name)`<br>• `public Map<String, Font> getFontByName()` / `getFamilyByFont()` / `getFontMultimap()` | Corresponding type | System font manager singleton. `getFont(name)` safely falls back to `getDefaultFont()` when given `null` or an unknown font name. |

---

### 3. `AnvilLibFontConfig`, `ALFont` & `ALFPipelines`

| Class | Method / Field Signatures | Description |
| :--- | :--- | :--- |
| **`AnvilLibFontConfig`** | • `public String getFontFamily()` / `public String getFont()`<br>• `public void setFontFamily(String)` / `public void setFont(String)` (auto-saves JSON to `config/anvillib_font.json` on every setter call) | Client font config model persisted with Gson via `AnvilLibFontConfigManager.readConfig` / `saveConfig`. |
| **`ALFont`** | `public class ALFont extends net.minecraft.client.gui.Font`<br>`public ALFont(Function<ResourceLocation, FontSet> fonts, boolean filterFishyGlyphs)` | Reserved subclass extending vanilla `Font`. |
| **`ALFPipelines`** | • `public static final VertexFormat SDF_TEXT_FORMAT` (`Position` + `Color` + `UV`)<br>• `public static @Nullable ShaderInstance getSdfTextShader()` | (`@ApiStatus.Internal`) Registers the `anvillib_font:sdf_text` shader instance in `RegisterShadersEvent`. |
