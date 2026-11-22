# Structure Read-Only Sandbox & UI Preview (`Preview`)

<BranchContextCard branch="26.1" />

When rendering multiblock structures directly in JEI/EMI recipe displays, guidebook pages, or machine blueprint tooltips, a regular client level is heavily coupled to chunk loading, player connections, and client ticks. `dev.anvilcraft.lib.v2.rendering.preview` provides a completely offline, lightweight structure preview suite with interactive picking and Y-layer filtering:

- **`level` subpackage**: Offline read-only `SandboxRenderLevel` and its chunk provider, `StructureSandboxFactory`, ray-picking `StructurePreviewPicker`, read-only block entity NBT parser `StructureBlockEntityDetails`, text pager `StructureDetailsPager`, and PiP render entry `StructurePreviewRenderer`.
- **`preview` root package**: Orthographic orbit camera controller `ViewportCameraRig`, Minecraft 26.1 native PiP renderer `StructurePreviewPipRenderer`, and automatic event binding `StructureRenderEvents`.
- **`gui` subpackage**: In-container right-click/hotkey floating preview framework `StructureGuiPreview`, block-ID preview provider registry `StructureGuiProviders`, offscreen fake player session `StructureGuiSession`, and geometry easing utilities.

---

## Full Example: Rendering a Rotatable, Pickable Structure Preview in a `Screen`

The example below builds a sandbox level from a `StructureTemplate`, renders the 3D structure in a GUI with `ViewportCameraRig` and `StructurePreviewRenderer`, picks hovered blocks, and reads read-only block entity details:

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.rendering.preview.ViewportCameraRig;
import dev.anvilcraft.lib.v2.rendering.preview.level.SandboxRenderLevel;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureBlockEntityDetails;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureDetailsPager;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewPicker;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewRenderer;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureSandboxFactory;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

public class BlueprintPreviewScreen extends Screen {
    private final StructureTemplate template;
    private final BlockPos placementPos;
    private final ViewportCameraRig cameraRig = new ViewportCameraRig();
    private final StructureDetailsPager detailsPager = new StructureDetailsPager();

    private @Nullable SandboxRenderLevel sandboxLevel;
    private @Nullable BlockPos lastPickedPos;
    private int minVisibleY;
    private int maxVisibleYExclusive;
    private float panX;
    private float panY;

    public BlueprintPreviewScreen(StructureTemplate template) {
        super(Component.literal("Structure Preview"));
        this.template = template;
        this.placementPos = StructureSandboxFactory.centeredPlacement(template);
    }

    @Override
    protected void init() {
        this.sandboxLevel = StructureSandboxFactory.create(Minecraft.getInstance().level, this.template, this.placementPos);
        if (this.sandboxLevel != null) {
            SandboxRenderLevel.Bounds bounds = this.sandboxLevel.getBounds();
            this.minVisibleY = bounds.min().getY();
            this.maxVisibleYExclusive = bounds.max().getY() + 1;
            this.cameraRig.applyPreset(ViewportCameraRig.PerspectivePreset.ISOMETRIC_NORTH_WEST);
            this.cameraRig.setZoom(1.4f);
        }
    }

    @Override
    public void tick() {
        if (this.sandboxLevel != null) {
            this.sandboxLevel.tickFrameClock();
        }
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        this.extractBackground(graphics, mouseX, mouseY, partialTick);
        if (this.sandboxLevel == null) {
            return;
        }

        int viewWidth = 220;
        int viewHeight = 180;
        int originX = (this.width - viewWidth) / 2;
        int originY = (this.height - viewHeight) / 2;

        graphics.pose().pushMatrix();
        graphics.pose().translate(originX, originY);
        StructurePreviewRenderer.getInstance().render(
            this.sandboxLevel,
            this.cameraRig,
            graphics,
            viewWidth,
            viewHeight,
            this.minVisibleY,
            this.maxVisibleYExclusive,
            this.panX,
            this.panY,
            1.0f
        );
        graphics.pose().popMatrix();

        // Compute local mouse coordinates inside the viewport widget and pick the frontmost visible block
        double localX = mouseX - originX;
        double localY = mouseY - originY;
        if (localX >= 0 && localX < viewWidth && localY >= 0 && localY < viewHeight) {
            BlockPos picked = StructurePreviewRenderer.getInstance().pick(
                this.sandboxLevel,
                this.cameraRig,
                viewWidth,
                viewHeight,
                localX,
                localY,
                this.minVisibleY,
                this.maxVisibleYExclusive,
                this.panX,
                this.panY
            );
            if (picked != null) {
                if (!picked.equals(this.lastPickedPos)) {
                    this.lastPickedPos = picked;
                    List<Component> lines = new ArrayList<>(
                        StructurePreviewPicker.tooltip(this.sandboxLevel, picked, this.placementPos)
                    );
                    CompoundTag nbt = this.sandboxLevel.getStructureBlockEntityData(picked);
                    if (nbt != null) {
                        String blockId = BuiltInRegistries.BLOCK.getKey(
                            this.sandboxLevel.getBlockState(picked).getBlock()
                        ).toString();
                        lines.addAll(StructureBlockEntityDetails.describe(blockId, nbt));
                    }
                    this.detailsPager.setLines(lines);
                }
                graphics.setComponentTooltipForNextFrame(
                    this.font,
                    this.detailsPager.visible(this.font, this.width, this.height),
                    mouseX,
                    mouseY
                );
            }
        }
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dragX, double dragY) {
        if (event.button() == 0) {
            this.cameraRig.setRotationY(this.cameraRig.getRotationY() + (float) dragX * 0.8f);
            this.cameraRig.setRotationX(this.cameraRig.getRotationX() + (float) dragY * 0.8f);
            return true;
        } else if (event.button() == 1) {
            this.panX += (float) dragX;
            this.panY += (float) dragY;
            return true;
        }
        return super.mouseDragged(event, dragX, dragY);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (this.lastPickedPos != null) {
            this.detailsPager.scroll(-scrollY);
            return true;
        }
        this.cameraRig.setZoom(Math.clamp(this.cameraRig.getZoom() + (float) scrollY * 0.15f, 0.3f, 5.0f));
        return true;
    }
}
```

---

## Camera, Rendering & Read-Only Sandbox API

### `ViewportCameraRig`

Camera model controlling viewport size, orthographic Euler rotation, zoom, and pan offset for structure previews (package `dev.anvilcraft.lib.v2.rendering.preview`).

| Member / Method Signature | Description |
| :--- | :--- |
| `public ViewportCameraRig()` | Constructs and applies `PerspectivePreset.ISOMETRIC_NORTH_WEST` by default |
| `public void configureViewport(int width, int height)` | Configures centered orthographic viewport `[-width/2, -height/2, width/2, height/2]` |
| `public void applyPreset(PerspectivePreset preset)` | Applies a perspective preset: `ISOMETRIC_NORTH_EAST` `(225, 30, 0)`, `ISOMETRIC_NORTH_WEST` `(135, 30, 0)`, `UP` `(120, 0, 45)` |
| `public void setOrthographicAngles(float yawDeg, float pitchDeg, float rollDeg)` | Sets orthographic yaw `rotationY`, pitch `rotationX`, and roll `rotationZ` in degrees |
| `public Matrix4f buildViewMatrix()` | Builds the view matrix from `offsetX/Y`, default GUI block scale (`0.625f * 16 * zoom`), and Z→X→Y rotation around `rotationCenter` |
| `public Matrix4f buildProjectionMatrix()` | Builds the `Matrix4f` orthographic projection matrix from current viewport and near/far planes `[-1000, 3000]` |
| `getZoom()` / `setZoom(float)` | Camera zoom factor |
| `getRotationX()` / `setRotationX(float)` | X-axis pitch angle (degrees) |
| `getRotationY()` / `setRotationY(float)` | Y-axis yaw angle (degrees) |
| `getRotationZ()` / `setRotationZ(float)` | Z-axis roll angle (degrees) |
| `getOffsetX()` / `setOffsetX(float)` | Viewport X-axis pan offset |
| `getOffsetY()` / `setOffsetY(float)` | Viewport Y-axis pan offset |

#### `ViewportCameraRig.PerspectivePreset`

Implements `StringRepresentable`: enum values are `ISOMETRIC_NORTH_EAST`, `ISOMETRIC_NORTH_WEST`, `UP`.

---

### `StructureSandboxFactory`

Builds a preview sandbox safely decoupled from server/world connections from a vanilla `StructureTemplate` (package `dev.anvilcraft.lib.v2.rendering.preview.level`).

| Method Signature | Description |
| :--- | :--- |
| `public static @Nullable SandboxRenderLevel create(@Nullable Level clientLevel, StructureTemplate template, BlockPos placementPos)` | Returns `null` if `clientLevel == null`. Places all template blocks, entities, and block entity data into a new `SandboxRenderLevel`, capturing raw block entity NBT snapshots via `StructureBlockEntityDetails.capture` before placement and reconstructing client entity instances inside the sandbox |
| `public static BlockPos centeredPlacement(StructureTemplate template)` | Returns the anchor offset needed to center `template.getSize()` at `(0, 0, 0)`: `new BlockPos(-Math.ceil(size.getX() / 2.0), 0, -Math.ceil(size.getZ() / 2.0))` |

---

### `SandboxRenderLevel` & Helper Chunk Classes

`SandboxRenderLevel extends net.minecraft.world.level.Level implements BlockAndTintGetter` (package `dev.anvilcraft.lib.v2.rendering.preview.level`), simulating all environmental queries needed for single-snapshot structure rendering without real-world chunk packets.

| Public Member / Method Signature | Description |
| :--- | :--- |
| `public SandboxRenderLevel()` | Constructs a sandbox level with empty/default registries |
| `public SandboxRenderLevel(RegistryAccess registryAccess)` | Constructs a sandbox level with the given registry access (recommended: `clientLevel.registryAccess()`) |
| `public SandboxRenderLevel(RegistryAccess registryAccess, FeatureFlagSet enabledFeatures)` | Constructs a sandbox level with registry access and feature flags |
| `public @Nullable CompoundTag getStructureBlockEntityData(BlockPos pos)` | Returns the raw read-only NBT snapshot recorded by the structure template at `pos` |
| `public void restoreBlockEntitiesForInspection()` | Reloads stored structure block entity snapshots into their corresponding block entities for read-only inspection |
| `public void tickFrameClock()` | Advances the game clock via an internal `DeltaTracker.Timer` and computes `partialTick` for animated fluid/glint/pulse textures |
| `public boolean hasContent()` / `public boolean hasFilledBlocks()` | Checks whether the sandbox contains any entities or non-air blocks |
| `public Stream<BlockPos> getFilledBlocks()` | Streams all placed non-air coordinates |
| `public Bounds getBounds()` | Returns `record Bounds(BlockPos min, BlockPos max)` for the structure's bounding box |
| `public boolean isFilledBlock(BlockPos blockPos)` | Checks whether `blockPos` is recorded as a non-air block |
| `public void refreshLightingAround(BlockPos pos)` | Refreshes virtual lighting state around `pos` |
| `public void addEntity(Entity entity)` / `removeEntity(int entityId, Entity.RemovalReason reason)` | Adds or removes a render entity (armor stand, falling block, item frame, etc.) in the sandbox |
| `public Iterable<Entity> getEntitiesForRendering()` | Returns all sandbox entities for rendering |
| `public CardinalLighting cardinalLighting()` | Returns `CardinalLighting.DEFAULT` |
| `public ClockManager clockManager()` | Returns an isolated `ClientClockManager` initialized to noon (6000 ticks) |

Helper public components (for extending sandbox behavior):
- `SandboxChunkProvider extends ChunkSource`: lazily generates and retains `SandboxLevelChunk`s in memory; provides `getChunk(int, int, ChunkStatus, boolean)` and `getLoadedChunksCount()`.
- `SandboxLevelChunk extends LevelChunk`: updates `SandboxRenderLevel`'s non-air index and surrounding lighting in `setBlockState`; `getFullStatus()` returns `FullChunkStatus.FULL`.
- `DelegatingServerLevelAccessor implements ServerLevelAccessor`: wraps `SandboxRenderLevel` as a `ServerLevelAccessor` to reuse vanilla structure-template placement logic.

---

### `StructurePreviewRenderer` & `StructurePreviewPipRenderer` & `StructureRenderEvents`

| Type | Method Signature | Description |
| :--- | :--- | :--- |
| `StructurePreviewRenderer` | `public static StructurePreviewRenderer getInstance()` | Returns the thread-safe singleton |
| `StructurePreviewRenderer` | `public void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, GuiGraphicsExtractor graphics, int maxX, int height, int visibleMinY, int visibleMaxYExclusive, float panOffsetX, float panOffsetY, float scale)` | Submits the sandbox render task to 26.1's native `GuiGraphicsExtractor.submitPictureInPictureRenderState` |
| `StructurePreviewRenderer` | `public @Nullable BlockPos pick(SandboxRenderLevel level, ViewportCameraRig cameraRig, int width, int height, double mouseX, double mouseY, int minY, int maxY, float panOffsetX, float panOffsetY)` | Casts an orthographic ray from screen-relative coordinates and returns the nearest non-air block position within visible Y layers `[minY, maxY)` |
| `StructurePreviewRenderer` | `public Vector2f projectCenter(BlockPos pos, ViewportCameraRig cameraRig, int width, int height, float panOffsetX, float panOffsetY)` | Projects the center `(pos + 0.5)` of `pos` back to widget-local 2D coordinates (useful for pointer lines or hover anchors) |
| `StructurePreviewPipRenderer` | `public StructurePreviewPipRenderer(MultiBufferSource.BufferSource buffers)` | Extends `PictureInPictureRenderer<State>`; renders opaque blocks, block entities, entities, and sorted translucent blocks/fluids onto an isolated texture target via `SubmitNodeStorage` and `FeatureRenderDispatcher` (disposed via `close()`) |
| `StructurePreviewPipRenderer.Effects` | `default void submit(SubmitNodeCollector collector, PoseStack pose)`<br>`default void render(State state)` | Extension interface (default no-op `Effects.NONE`): `submit` attaches custom models during node submission; `render` overlays screen effects after structure drawing |
| `StructurePreviewPipRenderer.State` | `State(SandboxRenderLevel level, int minY, int maxY, Matrix4f transform, int x0, int y0, int x1, int y1, float scale, @Nullable ScreenRectangle scissorArea, Effects effects)` | Implements `PictureInPictureRenderState`, plus a convenience constructor omitting `effects` |
| `StructureRenderEvents` | `previews(RegisterPictureInPictureRenderersEvent)` / `fallingBlocks(RegisterRenderStateModifiersEvent)` | Client event listener auto-registering `StructurePreviewPipRenderer` and fixing biome, `CardinalLighting`, and light sampling for falling block entities in the sandbox |

---

### Block Picking & Details Pagination: `StructurePreviewPicker` / `StructureBlockEntityDetails` / `StructureDetailsPager`

| Class | Public Method Signatures | Description |
| :--- | :--- | :--- |
| `StructurePreviewPicker` | `public static @Nullable BlockPos pick(SandboxRenderLevel level, Vec3 start, Vec3 end, int minY, int maxY)` | Raycasts block collision shapes within visible Y layers; empty-shape blocks like fluids fall back to `Shapes.block()` so their info remains inspectable |
| `StructurePreviewPicker` | `public static List<Component> tooltip(SandboxRenderLevel level, BlockPos pos, BlockPos placementPos)` | Returns the block's translated name, local coordinates relative to `placementPos`, and full property list |
| `StructureBlockEntityDetails` | `public static Map<BlockPos, CompoundTag> capture(CompoundTag template, BlockPos placementPos)` | Captures initial block entity data directly from template NBT mapped by placement origin |
| `StructureBlockEntityDetails` | `public static List<Component> describe(String blockId, CompoundTag data)` | Parses nested block entity NBT (stripping `id`/`x`/`y`/`z`/`keepPacked` metadata), supporting up to 32 recursion levels and 4096 lines; untranslated fields keep their path and value |
| `StructureDetailsPager` | `public void setLines(List<Component> lines)` | Sets the tooltip lines to paginate and resets the page index |
| `StructureDetailsPager` | `public List<Component> visible(Font font, int screenWidth, int screenHeight)` | Dynamically wraps lines by screen width and line height (max width 320px, max 12 lines) and returns the current page with pagination indicator |
| `StructureDetailsPager` | `public void scroll(double amount)` | Scrolls between preview detail pages |

---

## In-Container Floating Preview: `gui` Subpackage

`dev.anvilcraft.lib.v2.rendering.preview.gui` lets mods register standard container `Screen` preview popups for specific blocks in a structure (e.g., clicking/hovering a chest or machine slides out a read-only inventory preview alongside a pointer line to the block anchor).

### `StructureGuiProviders`

Registry mapping specific block IDs to their read-only preview `AbstractContainerScreen` builders.

| Public Member | Signature | Description |
| :--- | :--- | :--- |
| `register` | `public static void register(Identifier block, Provider provider)` | Registers a client factory callback mapping a target block to its preview container screen (one per block) |
| `Provider` | `public interface Provider { @Nullable AbstractContainerScreen<?> create(Context context); }` | Returning `null` indicates that this instance cannot currently be previewed |
| `Context` | `public record Context(SandboxRenderLevel level, Player player, BlockPos pos, StructureTemplate template)` | Provides the read-only sandbox, virtual client player, block world pos, and original structure template |

### `StructureGuiSession`

Manages the spoofed client player needed to create virtual preview `Screen`s in the sandbox (overriding `gameMode()` to `GameType.CREATIVE` so local container menus can open) and the thread context controlling item icon translucency during popup rendering.

| Public Member | Description |
| :--- | :--- |
| `StructureGuiSession(AbstractContainerScreen<?> screen, SandboxRenderLevel level, Player player)` | Holds the opened preview container screen, sandbox level, and virtual player |
| `public static @Nullable StructureGuiSession create(Minecraft minecraft, StructureTemplate template, BlockPos pos)` | Queries `StructureGuiProviders` or falls back to native `MenuProvider`, initializes dimensions, and builds a read-only session |
| `public static boolean isRendering()` | Checks whether read-only popup rendering is currently active |
| `public static void renderOnly(Runnable render)` / `renderOnly(float alpha, Runnable render)` | Runs inline rendering with interaction and background suppressed; `alpha` is propagated via `StructureGuiItemOpacity` to slot item atlases and oversized item rendering |
| `public static float opacity()` / `public static int tint(int color)` | Returns the current popup render opacity and scales an ARGB color by that opacity |

### `StructureGuiPreview`

Out-of-the-box floating preview controller with built-in show/move/hide smooth easing (`StructureGuiGeometry.easeOut`), window-edge-to-anchor connector rendering, drag-to-move, mouse interception, and scroll protection.

| Method Signature | Description |
| :--- | :--- |
| `public StructureGuiPreview()` / `public StructureGuiPreview(BooleanSupplier reducedMotion)` | Accepts an optional reduced-motion preference callback (defaults to `() -> false`) |
| `public boolean open(Object owner, StructureTemplate template, BlockPos pos, float anchorX, float anchorY)` | Opens or switches the popup screen for the given block and sets anchor coordinates; returns `true` on success |
| `public @Nullable BlockPos blockFor(Object component)` | If `component` belongs to the currently open or closing popup, returns its corresponding block position |
| `public void beginFrame()` | Resets the anchor visibility flag before each frame (paired with subsequent `anchor(...)` updates) |
| `public void anchor(float x, float y, boolean visible)` | Updates the block's screen-projected anchor and visibility after outer 3D camera rotation/panning |
| `public boolean contains(double mouseX, double mouseY)` | Checks whether the mouse is currently inside the open popup region |
| `public boolean mouseClicked(double mouseX, double mouseY, int button)` | Supports left-drag to move the popup and right-click to close it |
| `public boolean mouseDragged(double mouseX, double mouseY, int button)` | Handles popup drag movement |
| `public boolean mouseReleased(int button)` | Ends dragging and forwards mouse release to the popup (returns whether consumed) |
| `public void clear()` | Clears the popup session and drag state |
| `public void render(GuiGraphicsExtractor graphics)` | Sequentially draws the connector line from window edge to anchor, anchor dot, scissor region, and read-only content via `StructureGuiSession.renderOnly` |

### Geometry & Opacity Helpers: `StructureGuiGeometry` / `StructureGuiItemOpacity`

- `StructureGuiGeometry.edge(float x, float y, float width, float height, float anchorX, float anchorY) -> Vector2f`: computes the intersection of the ray from the window center toward `(anchorX, anchorY)` with the window edge (returns the anchor itself if inside).
- `StructureGuiGeometry.easeOut(float progress) -> float`: evaluates the `cubic-bezier(0.23, 1, 0.32, 1)` easing curve.
- `StructureGuiItemOpacity`: opacity-channel query interface mixed onto `GuiItemRenderState`, providing `StructureGuiItemOpacity.premultipliedColor(float opacity)` to generate premultiplied ARGB color integers.
