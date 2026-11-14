# SDF 字形图集与文本排版渲染 (`dev.anvilcraft.lib.v2.font.sdf`)

<BranchContextCard branch="26.2" />

本篇深入解析 `module.font` 的底层 SDF（Signed Distance Field，有向距离场）字形生成算法、分页图集动态管理、文本布局缓存以及 26.2 GUI 渲染状态提交管线。

---

## 一、 SDF 文本渲染管线工作原理

1. **虚拟线程异步字形光栅化与 EDT 距离场计算 (`SdfGlyphAtlas`)**：
   - 每个 `java.awt.Font`（按 `fontName.style.size` 唯一标识，字号不足 4 时自动派生为 `64px` 高清字号）对应一个 `SdfGlyphAtlas` 实例；
   - 图集初始化时预先同步生成 ASCII `32 ~ 126` 常用字符；当渲染遇到中文、日文或符号等非 ASCII 码点时，`atlas.glyph(codepoint, ...)` 会立即返回 `null`（当前帧暂按半字宽留白推进，绝不阻塞主渲染线程），同时将该码点投入 `AnvilLib-SDF-Glyph-*` 虚拟线程后台生成；
   - 在后台线程中，先用 AWT `Graphics2D` 将字符绘制为白底透明抗锯齿掩码，再通过两遍扫描的 **Dead Reckoning 欧氏距离变换（EDT）** 计算每个像素到最近字形边缘的有向距离 `signed`，归一化到 `[0, 255]` 灰度值写入 `SdfGlyphPage`（`0.5` 即 `128` 对应字形轮廓边界），并在单元格四周填充 `padding` 边缘延展像素防止双线性插值越界采样。
   - 后台字形生成完毕后，自动递增 `SdfGlyphPage.version` 并调用 `SdfTextLayout.invalidateAtlas(key)` 使布局缓存失效，下一帧即可直接显示新字形。
2. **按需脏页上传至单通道 GPU 纹理 (`SdfAtlasTexture` & `SdfGlyphPage`)**：
   - 每个 `SdfGlyphPage` 尺寸为 `1024 × 1024`。在每帧绘制前，`SdfAtlasTexture.ensureUploaded(atlas)` 检查所有页面的 `dirty` 与 `version` 原子版本号；若有更新，则将其上传为 `TextureFormat.RED8` 单通道 GPU 纹理，并绑定 `FilterMode.LINEAR` 线性采样器。
3. **按图集页分桶的 CPU 排版缓存 (`SdfTextLayout`)**：
   - `SdfTextLayout.fromAtlas(atlas, text, x, y, scale)` 将字符串中的码点转换为相对于原点 `(0, 0)` 的 `GlyphQuad` 矩形，并按所属的 `pageIndex` 分桶组装为 `List<PageQuads>`；
   - 当一段文本的所有码点均已在图集中就绪（`allGlyphsAvailable == true`）时，排版结果以 `(atlasKey, text, round(scale * 1000))` 为键存入最大容量 `1024` 的 `LAYOUT_CACHE`。
4. **提交 GUI 渲染状态 (`SdfTextRenderer` & `SdfTextRenderState`)**：
   - `SdfTextRenderer` 解析 `FormattedCharSequence` 中的颜色、粗斜体（自动切换 `base.deriveFont(mask)`）、下划线/删除线与混淆样式（每 `300 ms` 变换随机 ASCII 字符），将每个 `PageQuads` 封装为实现 `LibGuiElementRenderState` 的 `SdfTextRenderState`，调用 `graphics.submitGuiElementRenderState(state)` 提交至 Minecraft 26.2 的 GUI 渲染管线。

---

## 二、 类与 API 详解

### 1. `SdfTextRenderer`（SDF 文本渲染器，`@Beta`）

位于 `dev.anvilcraft.lib.v2.font.sdf.SdfTextRenderer`。通常通过 `GuiGraphicsExtractor#anvillib$textRenderer()` 获取，也可直接实例化使用。

| 构造器 / 方法签名 | 参数与行为说明 |
| :--- | :--- |
| `public SdfTextRenderer()` | 创建渲染器并绑定 `FilterMode.LINEAR` 边缘钳制采样器。 |
| `public void drawString(GuiGraphicsExtractor graphics, @Nullable Font font, @Nullable String text, int x, int y, int color, boolean dropShadow)` | 使用 `font`（为 `null` 时回退 `Dialog` 64px）在 `(x, y)` 绘制纯文本字符串。若 `text` 为 `null` 或空串则直接返回。 |
| `public void drawComponent(GuiGraphicsExtractor graphics, @Nullable Font font, Component text, int x, int y, int color, boolean dropShadow)` | 将 `Component` 转为 `text.getVisualOrderText()` 后委托 `drawFormatted` 绘制。 |
| `public void drawFormatted(GuiGraphicsExtractor graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color, boolean dropShadow)` | 按字符遍历 `FormattedCharSequence`：<br>• 支持 `style.isObfuscated()` 动态随机字符混淆；<br>• 当颜色、`bold` 或 `italic` 发生变化时自动分段刷出（`flushFormattedSegment`）并派生对应字重 `Font`；<br>• 支持 `style.isUnderlined()` 与 `style.isStrikethrough()`，通过 `0.5f` Y 轴缩放绘制高精度细下划线与删除线。 |
| `public void drawWrapped(GuiGraphicsExtractor graphics, @Nullable Font font, FormattedText text, int x, int y, int width, int color, boolean dropShadow)` | 使用 `ALFont.wrapLines` 将 `text` 按最大宽度 `width` 折行后，按 `lineHeight` 行距逐行绘制。 |
| `public void drawCentered(GuiGraphicsExtractor graphics, @Nullable Font font, Component text, int x, int y, int color)` | 测量 `Component` 视觉文本总宽度并以 `x` 为中心调用 `drawFormatted` 绘制。 |
| `public void drawCentered(GuiGraphicsExtractor graphics, @Nullable Font font, FormattedCharSequence text, int x, int y, int color)` | 测量 `FormattedCharSequence` 总宽度并以 `x` 为中心调用 `drawFormatted` 绘制。 |

### 2. `SdfGlyphAtlas`（多页按需 SDF 字形图集，`@ApiStatus.Internal`）

位于 `dev.anvilcraft.lib.v2.font.sdf.SdfGlyphAtlas`。

| 方法 / 记录签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static CompletableFuture<SdfGlyphAtlas> getOrCreate(@Nullable Font font)` | `CompletableFuture<SdfGlyphAtlas>` | 在后台虚拟线程池中异步构建（或从缓存获取）指定 `Font` 的 SDF 图集 Future。 |
| `public static @Nullable SdfGlyphAtlas getIfReady(@Nullable Font font)` | `@Nullable SdfGlyphAtlas` | 非阻塞获取图集：若后台已构建完成则返回实例；若仍在构建中则返回 `null`；若此前构建异常失败则自动移除失败 Future 并重新触发构建。 |
| `public String key()` / `public Font font()` | `String` / `Font` | 获取图集唯一键（`<fontName>.<style>.<size>`）与解析后的 `64px` `Font`。 |
| `public int awtHeight()` / `public int awtAscent()` | `int` | 获取 AWT 字体在图集字号下的总高度与基线上升高度（Ascent）。 |
| `public int pageCount()` / `public SdfGlyphPage page(int index)` | `int` / `SdfGlyphPage` | 获取当前已分配的 `1024×1024` 图集页数量及指定页对象。 |
| `public @Nullable GlyphEntry glyph(int codepoint, Consumer<SdfGlyphPage> pageConsumer)` | `@Nullable GlyphEntry` | 查询指定 Unicode 码点的字形条目。若尚未生成，自动提交虚拟线程任务异步生成并返回 `null`。 |
| `public int measureText(String text)` / `measureText(String text, int start, int end)` | `int` | 测量字符串或子串在图集像素坐标系下的总步进宽度（`advance` 之和；未就绪字形暂按 `cellSize / 2` 计）。 |
| `public int measureCodepoint(int codepoint)` | `int` | 测量单个码点在图集像素坐标系下的步进宽度。 |
| `public record GlyphEntry(int pageIndex, int atlasX, int atlasY, int width, int height, int advance)` | `record` | 记录单个字形所在的图集页索引、页内左上角坐标 `(atlasX, atlasY)`、宽高（含 `endX()` / `endY()` 计算方法）与水平步进 `advance`。 |

### 3. `SdfGlyphPage`、`SdfAtlasTexture`、`SdfTextLayout` 与 `SdfTextRenderState`（`@ApiStatus.Internal`）

| 类名 | 核心方法签名 | 职责说明 |
| :--- | :--- | :--- |
| `SdfGlyphPage` | `public void updateHash()` | 维护单张 `1024×1024` `TYPE_BYTE_GRAY` 灰度缓冲图像、网格行列游标与 `AtomicInteger version` 版本号。 |
| `SdfAtlasTexture` | `public static Identifier uploadPage(SdfGlyphAtlas atlas, int pageIndex)`<br>`public static void ensureUploaded(SdfGlyphAtlas atlas)` | 将脏页原子转换为 `NativeImage` 并上传为 `TextureFormat.RED8` + `FilterMode.LINEAR` 的 GPU 纹理，注册到 `Minecraft.getInstance().getTextureManager()`（纹理路径形如 `anvillib_font:dynamic/sdf_atlas/<sanitized_key>`）。 |
| `SdfTextLayout` | `public static SdfTextLayout fromAtlas(SdfGlyphAtlas atlas, @Nullable String text, int x, int y, float scale)`<br>`public static void invalidateAtlas(String atlasKey)`<br>`public static void clearCache()`<br>`public List<PageQuads> pages()`<br>`public int width()` / `public int height()` | 计算并缓存字符串的字形四边形集合。包含公开记录 `PageQuads(int pageIndex, @Nullable Identifier atlasTexture, int pageWidth, int pageHeight, List<GlyphQuad> quads)` 与 `GlyphQuad(int x0, int y0, int x1, int y1, float u0, float v0, float u1, float v1, char glyph)`。 |
| `SdfTextRenderState` | `public record SdfTextRenderState(...) implements LibGuiElementRenderState` | 实现 `module.rendering` 的 `LibGuiElementRenderState`，绑定 `ALFPipelines.SDF_TEXT` 管线与 `DiffuseSampler` 图集纹理，在 `buildVertices` 中使用 `consumer.addVertexWith2DPose` 提交字形四边形顶点，并通过 `LibGuiElementRenderState.getBounds` 计算裁剪边界。 |
