# Rendering 模块概述与接入配置

`module.rendering`（模组 ID：`anvillib_rendering`，入口类 `dev.anvilcraft.lib.v2.rendering.AnvilLibRendering`）是 AnvilLib 在 NeoForge 1.21.1 上提供的**客户端结构渲染与只读预览工具库**。

在 `dev/1.21.1` 分支中，该模块专注于两套互相配合的高性能客户端渲染子系统：

1. **结构投影渲染 (`projection`)**：将任意方块、流体、方块实体与实体快照预烘焙为 GPU 顶点缓冲（VBO），结合自定义核心着色器实现半透明幽灵投影、世界状态逐格比对（缺失/状态错误/方块错误高亮）与跨多投影一致的深度遮挡排序。
2. **结构只读沙盒与界面预览 (`preview`)**：将原版 `StructureTemplate` 解析并挂载到完全隔离的客户端假世界 `SandboxRenderLevel` 中，支持正交视角渲染、射线拾取、方块实体 NBT 检查翻页，以及无需发送网络包即可悬浮查看机器/容器原生 GUI 的 `StructureGuiPreview`。

::: tip 本分支能力范围说明
在 1.21.1 分支中，`module.rendering` 仅包含 `projection`（结构投影）与 `preview`（只读沙盒预览）两大功能域，不依赖特定上层模组，也不包含后处理/计算着色器管线。
:::

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，避免因 NeoForge Maven 未完全同步 Maven Central 导致接口注入或依赖元数据解析异常：

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
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### 模组元数据

- **Mod ID**：`anvillib_rendering`（常量定义于 `AnvilLibRendering.MOD_ID`）
- **运行端**：仅客户端渲染相关功能生效；`AnvilLibRendering` 本身使用 `@Mod(AnvilLibRendering.MOD_ID)` 声明，服务端存在模块本身不会崩溃，但 `projection` 与 `preview` 下的渲染与预览 API 均**只能在渲染线程（Render Thread）调用**。

## 核心子系统导航

| 子文档 | 核心包路径 | 适用场景 |
| --- | --- | --- |
| [结构投影场景与网格](./projection-scene.md) | `dev.anvilcraft.lib.v2.rendering.projection` | 构建幽灵结构快照 `ProjectionScene`、理解 `ProjectionShaders` 着色器生命周期 |
| [投影渲染器与覆盖层](./projection-renderer.md) | `dev.anvilcraft.lib.v2.rendering.projection` | 使用 `ProjectionRenderer` 预烘焙网格、与真实世界比对、多投影统一排序绘制与显存释放 |
| [结构只读沙盒与界面预览](./structure-preview.md) | `dev.anvilcraft.lib.v2.rendering.preview.*` | 在 GUI / 说明书中嵌入 `StructureTemplate` 3D 交互预览、射线拾取与只读容器浮窗 |

## 架构设计边界与使用约定

### 1. 显式生命周期与资源释放

- `ProjectionRenderer` 与 `PreviewLightmapAtlas` 均实现 `AutoCloseable`，内部持有原生堆内存（`MemoryUtil`）及 OpenGL 资源（`VertexBuffer` / 光照贴图纹理）。
- 当建筑蓝图卸载、界面关闭或渲染器不再使用时，必须显式调用 `close()`，切勿等待 GC。
- 当玩家触发资源包/着色器热重载（如按下 `F3+T`）时，`ProjectionShaders` 会递增全局代数 `generation`。调用方应在渲染前检查 `projectionRenderer.isValid()`，失效时重新调用 `rebuild(...)`。

### 2. 包内私有实现与 Mixin 作用域

- `projection` 包中的 `ProjectionMesh`、`GhostConsumer`、`ProjectionBuffers`、`ProjectionRenderTypes`、`ProjectionOverlay` 均为**包级私有（package-private）**内部组件，外部代码只与公开类 `ProjectionScene`、`ProjectionRenderer`、`ProjectionShaders` 及 `ProjectionRenderer.Prepared` 交互。
- `preview.gui` 依赖 `anvillib_rendering.mixins.json` 中的 4 个预览 Mixin（`StructureGuiGraphicsMixin`、`StructureGuiRecipeBookMixin`、`StructureGuiRenderStateMixin`、`StructureGuiScreenMixin`）配合 `StructureGuiSession.renderOnly(...)` 作用域实现只读 GUI 半透明着色并屏蔽危险交互；**调用方无需手动配置这些 Mixin**，但必须遵循规范：所有只读屏幕的渲染与初始化只能通过 `StructureGuiPreview` / `StructureGuiSession` 驱动，切勿自行安装为 `Minecraft.screen`。

## 入口类 API 速查

### `AnvilLibRendering`

包名：`dev.anvilcraft.lib.v2.rendering`

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `MOD_ID` | `public static final String` | 固定为 `"anvillib_rendering"`，同时用于核心着色器与翻译键命名空间 |
| `AnvilLibRendering()` | 构造器 | 由 NeoForge `@Mod` 注解自动实例化 |
