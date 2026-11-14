# Rendering 渲染扩展系统

`module.rendering`（Artifact：`anvillib-rendering-neoforge-1.21.11`，根包名 `dev.anvilcraft.lib.v2.rendering`）面向 Minecraft 1.21.11 与 NeoForge 21.8.x 基于 Blaze3D `RenderPipeline` 和 `GuiRenderState` 的新渲染架构，提供四大客户端图形子系统与底层缓冲基础设施：

- **结构投影渲染 (`projection`)**：将结构或方块集合烘焙为可复用的客户端网格 (`ProjectionRenderer`)，结合深度预通道实现多结构半透明幽灵叠加、缺失方块提示以及状态/方块错误高亮覆盖。
- **结构只读沙盒与界面预览 (`preview`)**：提供脱离真实世界、仅保留方块/方块实体/流体/实体的轻量只读 `SandboxRenderLevel`，配合正交轨道相机 `ViewportCameraRig`、`StructurePreviewPipRenderer`（基于 1.21.11 原生 `PictureInPictureRenderer`）以及屏幕内浮窗预览 `StructureGuiPreview`。
- **2D SDF 矢量图形渲染 (`sdf`)**：通过着色器驱动的有向距离场管线 `SdfGraphics` 与同源 CPU 距离计算工具 `Sdf2d`，支持圆角矩形、圆、弧、扇环、饼图、非对称胶囊、蛋形、线段与三角形的高质量抗锯齿填充、描边、发光及碰撞判定。
- **高斯模糊、UBO 布局与 GUI 状态扩展 (`blur` / `bloom` / `foundation.buffers` / `state`)**：提供双轴 4-Pass `GaussianBlur` 离屏模糊器、自动对齐写入的 `Std140`/`Std430` `BufferObject` 声明体系，以及向 `GuiRenderState` 提交自定义均匀缓冲区的 `LibGuiElementRenderState` / `LibQuadGuiElementRenderState`。

---

## 接入配置

若使用完整聚合包 `anvillib-neoforge-1.21.11`，`module.rendering` 会自动包含在内。若仅需单独引入渲染模块，请在 `build.gradle` 中声明 `Cjsah Maven`（或 `Maven Central`）与 `exclusiveContent` 过滤组：

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-rendering-neoforge-1.21.11:2.0.0")
}
```

---

## 模块入口与内置渲染管线

### `AnvilLibRendering`

`AnvilLibRendering`（包 `dev.anvilcraft.lib.v2.rendering`）是该模块的客户端入口类，通过 `@Mod(value = AnvilLibRendering.MODID, dist = Dist.CLIENT)` 声明，仅在客户端加载。

| 成员签名 | 说明 |
| :--- | :--- |
| `public static final String MODID = "anvillib_rendering"` | 渲染模块模组 ID，同时用作着色器与管线资源命名空间 |
| `public static Identifier location(String path)` | 返回 `Identifier.fromNamespaceAndPath(MODID, path)` 构造的资源路径 |

---

### `ALRPipelines`

`ALRPipelines`（`@EventBusSubscriber(modid = AnvilLibRendering.MODID, value = Dist.CLIENT)`）在 `RegisterRenderPipelinesEvent` 事件中集中注册公共渲染管线与顶点格式。其他模块（如 `module.wheel` 的毛玻璃背景与自研 GUI 控件）可直接复用这些公共管线或以此为模板构建自定义管线。

| 公开成员 | 类型 | 说明 |
| :--- | :--- | :--- |
| `POST_PASS` | `RenderPipeline.Snippet` | 后处理全屏通道片段模板：使用 `core/blit` 顶点着色器、采样器 `DiffuseSampler`、Uniform `Transforms`，深度测试为 `NO_DEPTH_TEST`、关闭深度写入与背面剔除 |
| `BLUR` | `RenderPipeline` | 基于 `POST_PASS` 构建的高斯模糊管线（`pipeline/blur`），片段着色器为 `anvillib_rendering:core/blur`，绑定额外的 `BlurParameters` Uniform |
| `SDF_GRAPHICS_FORMAT` | `VertexFormat` | SDF 渲染专用顶点格式，依次包含 `POSITION`、`COLOR`、`UV0`、`UV1` 四个属性 |
| `SDF_GRAPHICS` | `RenderPipeline` | 2D SDF 图形批处理管线（`pipeline/sdf_graphics`），着色器为 `anvillib_rendering:core/sdf_graphics`，绑定 `DynamicTransforms`、`Projection` 与 `SDFParameters` Uniform，开启 `BlendFunction.TRANSLUCENT` 且关闭背面剔除 |
| `on(RegisterRenderPipelinesEvent event)` | `static void` | 客户端总线自动回调，向原生渲染系统注册 `BLUR` 与 `SDF_GRAPHICS` |

---

## 子系统导航

| 子系统 | 文档章节 | 适用场景 |
| :--- | :--- | :--- |
| **结构投影渲染** | [结构投影渲染系统](./projection) | 世界内多方块/建筑蓝图幽灵预览、深度预写入排叠及校验红黄高亮覆盖层 |
| **结构沙盒与 UI 预览** | [结构只读沙盒与界面预览](./structure-preview) | 容器界面与配方预览中的 3D 旋转结构、层高切片、鼠标拾取与浮动预览窗 |
| **2D SDF 矢量绘图** | [2D SDF 矢量图形渲染](./sdf) | HUD/GUI 无损矢量几何绘制、发光/描边/平滑过渡、实例共享与精度碰撞检测 |
| **后处理模糊与 GPU 缓冲** | [高斯模糊与 UBO 缓冲布局](./buffers-and-blur) | 毛玻璃/后处理模糊纹理管线、`std140`/`std430` 结构体 UBO/SSBO 声明及空缓冲工具 |
| **GUI 自定义状态桥接** | [GUI 渲染状态扩展](./gui-state) | 在 1.21.11 `GuiRenderState` 中向自定义 `RenderPipeline` 绑定额外 `GpuBufferSlice` 与裁剪区 |
