# Rendering Module Overview & Setup

`module.rendering` on this branch provides two client rendering pipelines tailored for structural engineering mods:

1. **In-World Ghost Projection System (`projection`)**: Bakes any local `ProjectionScene` into a lightweight, clippable `VertexBuffer` mesh, using **two-pass rendering (Depth Prepass + Color Pass)** to eliminate translucent self-overlap z-fighting, bypassing shader pipelines to render translucent blueprints at `AFTER_LEVEL`, and highlighting wrong blocks/states with colored boxes.
2. **Structure Sandbox & GUI Hover 3D Preview (`preview`)**: Provides lightweight sandbox level `SandboxRenderLevel`, `ViewportCameraRig`, `StructurePreviewRenderer`, and the floating popup manager `StructureGuiPreview` for item/screen tooltips.

## Module Identity & Entry Points

- Mod ID: `anvillib_rendering` (`AnvilLibRendering.MOD_ID`)
- Resource namespace: `AnvilLibRendering.MOD_ID`

## Core Shaders & Render Types: `ProjectionShaders` & `ProjectionRenderTypes`

`ProjectionShaders` attaches client events via `@EventBusSubscriber(modid = AnvilLibRendering.MOD_ID, value = Dist.CLIENT)` and registers the built-in core shader `anvillib_rendering:core/projection` (vertex format `DefaultVertexFormat.BLOCK`) using `net.minecraft.client.renderer.ShaderProgram`.

| Class / Member | Scope | Description |
| --- | --- | --- |
| `ProjectionShaders.register(RegisterShadersEvent event)` | `public static` | Registers `anvillib_rendering:core/projection` `ShaderProgram` to `RegisterShadersEvent` |
| `ProjectionShaders.reload(ModelEvent.BakingCompleted event)` | `public static` | Increments `generation` and clears `ProjectionRenderTypes` cache after resource/model rebaking, causing `isValid()` on old projection meshes to return `false` and trigger rebuilds |

> [!IMPORTANT]
> Because model rebaking invalidates cached `ProjectionRenderer`s (`isValid()` returns `false`), callers should check `renderer.isValid()` before drawing each frame and call `renderer.rebuild(scene, alpha)` if `false` so atlas UVs and block models stay in sync.

## `ProjectionBuffers` (Internal Multi-Type Buffer Allocator)

`ProjectionBuffers` implements `MultiBufferSource` and `AutoCloseable` to capture geometry vertices emitted by `BlockEntityRenderer` and `EntityRenderDispatcher` in the virtual scene:

- Maps incoming vanilla `RenderType`s to `ProjectionRenderTypes.ghost(type, depthOnly)`, disabling depth-occlusion conflicts outside the translucent pass;
- Automatically multiplies and overrides overall projection `opacity` on every vertex, using `depthMask(true) + colorMask(false, false, false, false)` in the depth pass and `depthMask(false) + colorMask(true, true, true, true)` in the color pass.
