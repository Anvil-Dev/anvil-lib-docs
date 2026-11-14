# SDF 字形图集与文本渲染器 (`dev.anvilcraft.lib.v2.font.sdf`)

<BranchContextCard branch="1.21.4" />

本篇深入介绍 `module.font` 的 SDF（Signed Distance Field，有符号距离场）字形光栅化、分页图集管理、`ALFont` 宽度度量折行工具以及着色器绘制管线。

---

## 一、 SDF 字体渲染管线原理

为什么 `module.font` 能在保持高帧率的同时渲染出边缘锐利的任意系统 TrueType 字体？

1. **8× 超采样 EDT 距离场生成 (`SdfGlyphPage`)**：
   在后台守护线程（`"AnvilLib-SDF-Atlas-*"`）中，每个 Unicode 基本多文种平面（BMP，`0x0000 ~ 0xFFFF`）按 4096 个码点划分为 16 张页（Page `0..15`，其中 ASCII 所在的 Page 0 在初始化时立即预热构建，其余 15 页按需懒加载并在后台线程异步构建）。
   构建单页时，先以 `32 * 8 = 256px` 的 8 倍超采样字号在单比特位图上渲染字形，再利用 **Felzenszwalb & Huttenlocher 线性时间精确欧几里得距离变换（EDT，$O(W \times H)$）** 计算每个像素到字形轮廓的有符号距离，下采样写入 `2048×2048` 的单通道灰度图集（`0.5` 即 `128` 代表字形精确边界）。
2. **主线程零阻塞与分帧上传 (`SdfAtlasTexture`)**：
   后台线程完成 CPU 侧距离场计算后，主线程每帧通过 `SdfAtlasTexture.ensureUploaded(atlas)` **最多只上传 1 张已就绪的 `2048×2048` 纹理页**（将灰度像素写入 `NativeImage` 后注册并上传至 `TextureManager`），避免首次渲染大量中文字符或粗斜体时引起主线程掉帧。
3. **1.21.4 `ShaderProgram` 即时绘制 (`SdfTextRenderer` / `SdfTextRenderState`)**：
   `SdfTextRenderer` 先调用 `graphics.flush()` 确保底层图形已提交，随后开启混合（`RenderSystem.enableBlend()` + `defaultBlendFunc()`），通过 `RenderSystem.setShader(ALFPipelines.getSdfTextShader())` 绑定 `ShaderProgram` 与当前图集页纹理，利用 `Tesselator`、`ALFPipelines.SDF_TEXT_FORMAT` 和 `BufferUploader.drawWithShader` 提交字形四边形。

---

## 二、 完整代码示例：使用 `ALFont` 测量折行并直接调用 `SdfTextRenderer`

除了使用 `GuiGraphics` 上的 `anvillib$*` 扩展方法外，当你在编写自定义 UI 布局计算器（需要预先知道一段字符串在特定系统字体下的像素宽度、折行行数或截断子串）时，可以直接配合使用 **`ALFont`** 和 **`SdfTextRenderer`**：

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

        // 1. 包装为 ALFont 以测量宽度与计算折行
        ALFont alFont = new ALFont(awtFont);
        List<FormattedCharSequence> lines = alFont.split(message, maxBoxWidth);

        int actualMaxWidth = 0;
        for (FormattedCharSequence line : lines) {
            int w = alFont.width(line);
            if (w > actualMaxWidth) {
                actualMaxWidth = w;
            }
        }

        // 2. 根据测量到的宽高绘制自适应半透明背景面板
        int boxHeight = alFont.wordWrapHeight(message, maxBoxWidth);
        graphics.fill(x - 4, y - 4, x + actualMaxWidth + 4, y + boxHeight + 4, 0xCC10141C);

        // 3. 调用 SdfTextRenderer 逐行渲染或直接 drawWrapped
        RENDERER.drawWrapped(graphics, awtFont, message, x, y, maxBoxWidth, 0xFFFFFFFF, false);
    }
}
```

---

## 三、 公开类 API 详解 (`dev.anvilcraft.lib.v2.font.sdf`)

### 1. `SdfTextRenderer`

位于 `dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer`（标注为 `@Beta`）。

| 方法签名 | 说明 |
| :--- | :--- |
| `public SdfTextRenderer()` | 构造 SDF 文本渲染器实例。 |
| `public void drawString(GuiGraphics graphics, @Nullable Font font, @Nullable String text, int x, int y, int color, boolean dropShadow)` | 绘制普通字符串（`text` 为 `null` 或空串时直接返回）。 |
| `public void drawComponent(GuiGraphics graphics, @Nullable Font font, Component text, int x, int y, int color, boolean dropShadow)` | 绘制 `Component`（内部转为 `text.getVisualOrderText()` 并转发给 `drawFormatted`）。 |
| `public void drawFormatted(GuiGraphics graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color, boolean dropShadow)` | 核心分段绘制入口：按字符样式切分段（处理样式颜色覆盖 `ARGB`、粗体/斜体衍生字体、每 300ms 跳变的 `obfuscated` 随机 ASCII 码点、以及基于 `graphics.pose().scale(1.0F, 0.5F, 1.0F)` 的半像素精度下划线 `underline` 与删除线 `strikethrough`）。 |
| `public void drawWrapped(GuiGraphics graphics, @Nullable Font font, FormattedText text, int x, int y, int width, int color, boolean dropShadow)` | 调用 `ALFont.wrapLines` 按最大宽度 `width` 折行并逐行绘制。 |
| `public void drawCentered(GuiGraphics graphics, @Nullable Font font, Component text, int x, int y, int color)`<br>`public void drawCentered(GuiGraphics graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color)` | 利用 `SdfGlyphAtlas#measureText` 计算总宽度，以 `x` 为水平中心点绘制文本。 |

---

### 2. 图集与布局底层类 (`SdfGlyphAtlas` / `SdfGlyphPage` / `SdfAtlasTexture` / `SdfTextLayout` / `SdfTextRenderState`)

| 类名 | 关键常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`SdfGlyphAtlas`** | • `ATLAS_SIZE = 2048`、`GLYPH_SIZE = 32`、`SPREAD = 4`、`OVERSAMPLE = 8`、`PAGE_COUNT = 16`、`CHARS_PER_PAGE = 4096`<br>• `public static CompletableFuture<SdfGlyphAtlas> getOrCreate(@Nullable Font font)`<br>• `public static @Nullable SdfGlyphAtlas getIfReady(@Nullable Font font)`<br>• `public @Nullable GlyphMetrics metrics(int codepoint)`<br>• `public int measureText(String text)` / `measureText(String text, int start, int end)`<br>• `public record GlyphMetrics(int pageIndex, float u0, float v0, float u1, float v1, int width, int height, int bearingX, int bearingY, int advance)` | 管理单个 `Font` 的 16 张按需分页 SDF 图集及文本步进宽度测量。 |
| **`SdfGlyphPage`** | `public static SdfGlyphPage build(Font baseFont, int pageIndex, int rangeStart, int rangeEnd, int glyphSize, int spread, int oversample, int atlasSize)` | 执行 8× 超采样光栅化与线性时间 EDT 距离变换，构建单页 `2048×2048` 字节数据。 |
| **`SdfAtlasTexture`** | • `public static void ensureUploaded(SdfGlyphAtlas atlas)`<br>• `public static @Nullable ResourceLocation pageLocation(SdfGlyphAtlas atlas, int pageIndex)`<br>• `public static void releaseAll()` | 管理 CPU 图集页向 GPU `DynamicTexture` 的分帧上传（每帧最多上传 1 页）与纹理释放。 |
| **`SdfTextLayout`** | • `public static SdfTextLayout fromAtlas(SdfGlyphAtlas atlas, String text, int x, int y, float scale)`<br>• `public record GlyphQuad(float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1)`<br>• `public record PageQuads(int pageIndex, @Nullable ResourceLocation atlasTexture, List<GlyphQuad> quads)` | 将字符串排版为按图集页分组的屏幕空间四边形列表 `List<PageQuads>` 及总像素宽度 `width()`。 |
| **`SdfTextRenderState`** | • `public record SdfTextRenderState(Matrix4f pose, List<SdfTextLayout.GlyphQuad> glyphs, ResourceLocation atlasTexture, int color, int originX, int originY)`<br>• `public void buildVertices(VertexConsumer consumer)` | （`@ApiStatus.Internal`）封装单次图集页绘制的顶点构建状态。 |
