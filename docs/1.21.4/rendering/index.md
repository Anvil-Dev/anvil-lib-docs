# Rendering 模块概述与接入

`module.rendering` 在当前分支提供了两套专用于结构工程类 Mod 的客户端渲染管线：

1. **世界内幽灵投影系统 (`projection`)**：将任意局部 `ProjectionScene` 烘焙为可局部裁剪的轻量级 `VertexBuffer` 网格，采用**双通道先行（Depth Prepass + Color Pass）**机制消除半透明内部重叠 z-fighting，绕过光影管线直接在 `AFTER_LEVEL` 阶段输出半透明建筑蓝图，并对错方块/错方块状态自动高亮提示框。
2. **结构只读沙盒与 GUI 悬停 3D 预览 (`preview`)**：提供轻量化沙盒渲染世界 `SandboxRenderLevel`、`ViewportCameraRig`、`StructurePreviewRenderer` 以及嵌入物品/界面提示区的动态弹窗管理器 `StructureGuiPreview`。

## 模块标识与入口

- 模组 ID：`anvillib_rendering`（`AnvilLibRendering.MOD_ID`）
- 资源命名空间：`AnvilLibRendering.MOD_ID`

## 核心着色器与渲染类型：`ProjectionShaders` 与 `ProjectionRenderTypes`

`ProjectionShaders` 通过 NeoForge `@EventBusSubscriber(modid = AnvilLibRendering.MOD_ID, value = Dist.CLIENT)` 挂载客户端事件，使用 `net.minecraft.client.renderer.ShaderProgram` 注册内置核心着色器 `anvillib_rendering:core/projection`（顶点格式 `DefaultVertexFormat.BLOCK`）。

| 类 / 成员 | 作用域 | 说明 |
| --- | --- | --- |
| `ProjectionShaders.register(RegisterShadersEvent event)` | `public static` | 向 `RegisterShadersEvent` 注册 `anvillib_rendering:core/projection` `ShaderProgram` |
| `ProjectionShaders.reload(ModelEvent.BakingCompleted event)` | `public static` | 资源包或方块模型重新烘焙完成后自增版本号 `generation` 并清空 `ProjectionRenderTypes` 缓存，使旧投影网格在下一帧检测到 `isValid() == false` 并触发重建 |

> [!IMPORTANT]
> 由于模型烘焙重载会使缓存的 `ProjectionRenderer` 失效（`isValid()` 返回 `false`），调用方在每帧准备绘制前应检查 `renderer.isValid()`；一旦返回 `false`，需要重新构造或调用 `renderer.rebuild(scene, alpha)`，确保图集 UV 与区块模型一致。

## `ProjectionBuffers`（内部多类型缓冲分配器）

`ProjectionBuffers` 实现了 `MultiBufferSource` 与 `AutoCloseable`，用于承接 `BlockEntityRenderer` 与 `EntityRenderDispatcher` 在虚拟场景中发射的几何顶点：

- 按传入的原版 `RenderType` 映射到 `ProjectionRenderTypes.ghost(type, depthOnly)`，自动关闭透明通道外的深度遮挡冲突；
- 为每个顶点自动乘算并覆盖投影整体透明度 `opacity`，并在绘制深度通道时使用 `depthMask(true) + colorMask(false, false, false, false)`，在颜色通道时切换回 `depthMask(false) + colorMask(true, true, true, true)`。
