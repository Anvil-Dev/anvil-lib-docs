# Structure Read-Only Sandbox & UI Preview (`Preview`)

`dev.anvilcraft.lib.v2.rendering.preview` provides a complete isolated sandbox world and client GUI hover 3D structure preview system. It builds zero-side-effect read-only micro-worlds from `StructureTemplate`s and renders interactive, rotatable, ray-pickable 3D structure preview windows with block entity inspection in recipe screens, item tooltips, or block detail screens.

## Read-Only Sandbox World: `StructureSandboxFactory` & `SandboxRenderLevel`

### `StructureSandboxFactory`

| Method Signature | Description |
| --- | --- |
| `create(@Nullable Level clientLevel, StructureTemplate template, BlockPos placementPos)` | Places `StructureTemplate` into an isolated `SandboxRenderLevel` and initializes chunk caches; returns `null` if `clientLevel == null` or template size is empty |
| `centeredPlacement(StructureTemplate template)` | Computes the recommended `BlockPos` offset to anchor the structure's center near the origin |

### Sandbox Components: `SandboxRenderLevel` / `DelegatingServerLevelAccessor` / `SandboxLevelChunk`

- `SandboxRenderLevel` extends `ClientLevel` and runs virtual `SandboxChunkProvider`, `SandboxLevelChunk`, and `PreviewLightmapAtlas`, supporting `tickFrameClock()` to drive animated fluid textures and emissive rendering.
- `DelegatingServerLevelAccessor` implements `ServerLevelAccessor`, providing a read-only proxy for server-style queries (for cross-mod structure placement and feature logic) without mutating the real world.

## 3D Rendering & Camera Control: `StructurePreviewRenderer` & `ViewportCameraRig`

### `ViewportCameraRig` Orthographic/Isometric Camera

| Method / Enum | Description |
| --- | --- |
| `new ViewportCameraRig()` | Initializes the default orthographic preview camera rig |
| `configureViewport(int width, int height)` | Sets pixel aspect ratio of the current offscreen or clipped viewport |
| `applyPreset(PerspectivePreset preset)` | Quickly switches perspective presets (orthographic isometric and multi-angle presets implementing `StringRepresentable`) |
| `setOrthographicAngles(float yawDeg, float pitchDeg, float rollDeg)` | Sets custom pitch, yaw, and roll angles |
| `buildViewMatrix()` / `buildProjectionMatrix()` | Builds matrices for Blaze3D `ModelViewStack` and `RenderSystem.setProjectionMatrix(..., ProjectionType.ORTHOGRAPHIC)` |

### `StructurePreviewRenderer`

| Method | Description |
| --- | --- |
| `StructurePreviewRenderer.getInstance()` | Returns the global renderer singleton |
| `render(SandboxRenderLevel, ViewportCameraRig, MultiBufferSource.BufferSource[, int minY, int maxYExclusive][, Effects effects])` | Clears depth (`RenderSystem.clear(GlConst.GL_DEPTH_BUFFER_BIT)`), disables fog (`FogParameters.NO_FOG`), renders opaque blocks and `Entity`/`BlockEntity`s first, then translucent layers and flushes batches per the camera rig |
| `renderContent(SandboxRenderLevel, MultiBufferSource.BufferSource[, minY, maxYExclusive, Effects])` | Submits scene geometry directly when managing matrices and camera externally |
| `markFluidSpritesActive(FluidState fluidState)` | Pings `SodiumSpriteBridge.pingSpriteUsage(...)` so animated water/lava textures keep updating every frame when Sodium is installed |

> [!NOTE]
> In 1.21.4, entity rendering uses the `EntityRenderState` pipeline. `StructurePreviewRenderer` automatically calls `renderer.createRenderState(entity, partialTicks)` and `renderer.render(renderState, poseStack, buffers, packedLight)` for each entity, so callers do not need to manage entity state caches manually.

## GUI Hover Preview Popup: `StructureGuiPreview` & `StructureGuiProviders`

To render a 3D structure preview card that scales and fades in anchored to the cursor next to JEI/EMI recipes or item tooltips (e.g., structure-carrying tools), use `StructureGuiPreview` and `StructureGuiSession`:

### Registering Structure Sources: `StructureGuiProviders`

```java
StructureGuiProviders.register(
    ResourceLocation.fromNamespaceAndPath("mymod", "multiblock_core"),
    (StructureGuiProviders.Context ctx) -> {
        // ctx provides level(), player(), pos(), and template()
        // Attach tooltips, check activation conditions, or append metadata for specific block positions here
        return List.of();
    }
);
```

### `StructureGuiPreview` Lifecycle & Interaction API

| Method | Description |
| --- | --- |
| `new StructureGuiPreview()` / `new StructureGuiPreview(BooleanSupplier reducedMotion)` | Creates a GUI preview popup; can hook into client reduced-motion accessibility settings |
| `open(Object owner, StructureTemplate template, BlockPos pos, float anchorX, float anchorY)` | Opens the structure preview for `owner`; returns `true` and smoothly transitions open if valid |
| `beginFrame()` | Resets anchor flags before each frame render |
| `anchor(float x, float y, boolean visible)` | Binds the screen-space trigger anchor position and visibility for this frame |
| `contains(double mouseX, double mouseY)` | Checks whether the mouse is inside the preview panel (for capturing scroll/hover events) |
| `mouseClicked(...)` / `mouseDragged(...)` / `mouseReleased(...)` | Forwards left/right mouse drags and clicks to internal `ViewportCameraRig` for camera rotation and block ray-picking |
| `blockFor(Object component)` | Looks up the sandbox-local `BlockPos` corresponding to the currently rendered or associated component |
| `render(GuiGraphics graphics)` | Draws the preview panel in `Screen#render`, using `StructureGuiSession.renderOnly(progress, ...)` with `RenderSystem.setShaderColor` for unified fade-in/out opacity |
| `clear()` | Closes the preview and cleans up associated sandbox resources |

## Ray Picking & Details Pagination: `StructurePreviewPicker` & `StructureDetailsPager`

- `StructurePreviewPicker.pick(SandboxRenderLevel level, Vec3 start, Vec3 end, int minY, int maxY)`: raycasts within the restricted Y-layer range in the sandbox and returns the first hit `BlockPos` (supports Y-sliced picking);
- `StructurePreviewPicker.tooltip(SandboxRenderLevel level, BlockPos pos, BlockPos placementPos)`: extracts the target block's name, property states, and inventory/fluid summary parsed via `StructureBlockEntityDetails`;
- `StructureDetailsPager`: multi-line tooltip pagination and scroll controller (`visible(Font, screenWidth, screenHeight)`, `scroll(double amount)`) for complex machine tooltips taller than the screen.
