---
title: Font SDF 字体渲染
prev: false
next: false
---

# SDF 字体渲染模块 <Badge type="tip" text=">=26.1" />

包 `dev.anvilcraft.lib.v2.font` 提供了一套基于 **SDF（Signed Distance Field）** 的字体渲染系统，支持加载任意系统 AWT
字体并将其用于 Minecraft GUI 文本绘制，附带完整的配置界面和风格化文本支持。

::: warning Availability
本模块**仅**在 Minecraft **26.1** 版本中存在。
:::

## 架构概览

1. **入口层** — `AnvilLibFont` 是 `@Mod` 入口点（CLIENT-only），提供 `getSelectFont()` 获取当前配置的 AWT Font，并注册
   `FontConfigScreen` 作为配置界面
2. **发现层** — `FontManager` 单例通过 AWT `GraphicsEnvironment` 发现所有系统字体，建立字体族 Trie 索引，提供
   `getFont(String name)` 和 `getFamilyNames()`/`getFamilyFontNames()`
3. **配置层** — `AnvilLibFontConfig` 基于 JSON 的配置（存储在 `config/anvillib/anvillib-font-client.json`），通过 Gson 读写
   `fontFamily` 和 `font` 选择
4. **渲染层** — `SdfTextRenderer` 主渲染器，支持 `drawString`、`drawFormatted`、`drawComponent`、`drawCentered`、
   `drawWrapped` 等绘制方法
5. **图集层** — `SdfGlyphAtlas` 多页 CPU 端 SDF 字形图集，1024x1024 页，预烘焙 ASCII 32-126，按需渲染其他码点，使用 Dead
   Reckoning EDT 算法计算 SDF
6. **布局层** — `SdfTextLayout` CPU 端字形布局，按图集页分组字形，输出 `PageQuads` 携带每字形的 UV 坐标
7. **上传层** — `SdfAtlasTexture` 将图集页上传到 GPU 为 `RED8` 纹理（LINEAR + CLAMP 过滤）
8. **状态层** — `SdfTextRenderState` 实现 `LibGuiElementRenderState`，构建 SDF 文本渲染所需的四边形顶点，通过
   `ALFPipelines.SDF_TEXT` 管线提交

## 文档索引

| 文档              | 内容                                                                                      |
|-----------------|-----------------------------------------------------------------------------------------|
| [核心 API](./api) | `AnvilLibFont`、`FontManager`、`SdfTextRenderer`、`SdfGlyphAtlas`、`SdfTextLayout`、GUI 扩展方法 |

## 快速开始

```java
// 1. 获取当前配置的字体
Font font = AnvilLibFont.getSelectFont();

// 2. 在 GuiGraphics 中绘制文本
graphics.anvillib$text(font, "Hello SDF Text", x, y, 0xFFFFFFFF);

// 3. 绘制居中文本
graphics.anvillib$centeredText(font, Component.literal("Centered"), x, y, 0xFFFFFF00);

// 4. 绘制支持自动换行的文本
graphics.anvillib$textWithWordWrap(font, FormattedText.of("Long text..."), x, y, width, 0xFFFFFFFF);

// 5. 绘制带背景色描边的文本
graphics.anvillib$textWithBackdrop(font, "Backdrop Text", x, y, 0xFFFFFFFF, 0x80000000);
```

## 依赖管理

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-font-neoforge-26.1:2.0.0"
}
```

> 本模块依赖 `module.rendering`（使用 `LibGuiElementRenderState`），且仅限客户端环境（`@Mod(dist = Dist.CLIENT)`）。

## 注意事项

- `AnvilLibFont.getSelectFont()` 返回的是 AWT `java.awt.Font` 实例
- `SdfGlyphAtlas` 基于字体名称 + 样式 + 大小建立静态缓存，相同参数复用图集
- 图集页尺寸为 1024x1024，字形按需延迟渲染
- GUI 扩展方法通过 Mixin（`GuiGraphicsExtractorMixin`）注入到 `GuiGraphics` 中，通过 `GuiGraphicsExtractorExtension` 接口暴露
- 支持的文本风格：加粗、斜体、下划线、删除线、混淆（obfuscated）
