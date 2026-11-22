# Structure Read-Only Sandbox & UI Preview (`Preview`)

In in-game guidebooks, recipe viewers (JEI/EMI), or blueprint browsers, developers often need an **interactive, rotatable, zoomable 3D `StructureTemplate` preview** inside a GUI, letting players hover to inspect block entity NBT or click chests/machines to pop up their native container UI.

Operating directly on the real world or opening a real `AbstractContainerScreen` causes severe issues: packets mutating the player's menu, slot clicks voiding items, or block ticks/updates breaking the structure. `dev.anvilcraft.lib.v2.rendering.preview` is a **completely isolated client sandbox and read-only UI framework** built for this.

## Architecture Overview

| Layer | Subpackage | Core Classes | Responsibility |
| --- | --- | --- | --- |
| **Viewport & Helpers** | `preview` | `ViewportCameraRig`, `SectionOffsetVertexConsumer`, `SodiumSpriteBridge` | Orthographic camera matrices, 16x16x16 section vertex offset, Sodium animated sprite pinging |
| **Sandbox Level & Render** | `preview.level` | `StructureSandboxFactory`, `SandboxRenderLevel`, `StructurePreviewRenderer`, `PreviewLightmapAtlas` | Builds isolated fake level from `StructureTemplate`, offscreen/viewport 3D rendering, `Effects` injection |
| **Picking & Details Pager** | `preview.level` | `StructurePreviewPicker`, `StructureBlockEntityDetails`, `StructureDetailsPager` | 3D ray picking, block entity NBT tree formatting, and scroll pagination |
| **Read-Only Container Popup** | `preview.gui` | `StructureGuiProviders`, `StructureGuiSession`, `StructureGuiPreview`, `StructureGuiGeometry` | Instantiates and renders vanilla or custom read-only container screens in an isolated player/sandbox |

---

## Part 1: Building the Sandbox Level & Rendering (`preview.level`)

### 1. Creating an Isolated World: `StructureSandboxFactory` & `SandboxRenderLevel`

`StructureSandboxFactory.create(clientLevel, template, placementPos)` safely loads a vanilla `StructureTemplate` into an isolated `SandboxRenderLevel`:

- Uses internal `DelegatingServerLevelAccessor` and `Block.UPDATE_KNOWN_SHAPE` so placing blocks **never triggers neighbor updates or physics drops**.
- Captures raw NBT snapshots of all block entities in the template before placement (queryable via `level.getStructureBlockEntityData(pos)`).
- Reconstructs entities in the structure (fixing `FallingBlockEntity` and hanging entity `TileX`/`TileY`/`TileZ` local offsets).

::: warning Important Pitfall: `getFilledBlocks()` Reuses a Mutable BlockPos
`SandboxRenderLevel.getFilledBlocks()` returns `Stream<BlockPos>`, which **reuses a single `BlockPos.MutableBlockPos` internally** for performance. If collecting into a collection or retaining positions across elements, **you must call `.immutable()`** (e.g., `level.getFilledBlocks().map(BlockPos::immutable).toList()`).
:::

### 2. Orthographic Camera & 3D Rendering: `ViewportCameraRig` & `StructurePreviewRenderer`

`ViewportCameraRig` provides orthographic projection scaled to GUI block proportions (`0.625F * 16 * zoom`) and perspective presets (`PerspectivePreset`), ensuring **`StructurePreviewRenderer`** and **`StructurePreviewPicker`** share identical transform matrices.

`StructurePreviewRenderer` (singleton via `getInstance()`, render thread only) supports both full-structure rendering, Y-layer slice filtering (`visibleMinY`–`visibleMaxYExclusive` for step-by-step building guides), and `Effects` callbacks (submitting extra models or outlines to the same `BufferSource` under active camera matrices in 1.21.1).

### 3. Full Code Example: Sliceable Interactive 3D Structure with NBT Paging & Ray Picking in a `Screen`

```java
package com.example.examplemod.client;

import dev.anvilcraft.lib.v2.rendering.preview.ViewportCameraRig;
import dev.anvilcraft.lib.v2.rendering.preview.gui.StructureGuiPreview;
import dev.anvilcraft.lib.v2.rendering.preview.level.SandboxRenderLevel;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewPicker;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewRenderer;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureSandboxFactory;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureDetailsPager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector2f;
import org.joml.Vector4f;

import java.util.List;

public class DemoStructureScreen extends Screen {
    private final StructureTemplate template;
    private final BlockPos placementPos;
    private final ViewportCameraRig cameraRig = new ViewportCameraRig();
    private final StructureDetailsPager pager = new StructureDetailsPager();
    private final StructureGuiPreview guiPreview = new StructureGuiPreview();

    private SandboxRenderLevel sandboxLevel;
    private BlockPos hoveredPos;
    private int layerCapY = Integer.MAX_VALUE;

    public DemoStructureScreen(Component title, StructureTemplate template) {
        super(title);
        this.template = template;
        this.placementPos = StructureSandboxFactory.centeredPlacement(template);
    }

    @Override
    protected void init() {
        this.sandboxLevel = StructureSandboxFactory.create(Minecraft.getInstance().level, this.template, this.placementPos);
        this.cameraRig.applyPreset(ViewportCameraRig.PerspectivePreset.ISOMETRIC_NORTH_EAST);
        this.cameraRig.configureViewport(this.width, this.height);
        this.cameraRig.setZoom(1.5F);
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);
        if (this.sandboxLevel == null) {
            return;
        }
        this.sandboxLevel.tickFrameClock();
        this.guiPreview.beginFrame();

        // 1. Prepare view-projection matrices and slice range
        SandboxRenderLevel.Bounds bounds = this.sandboxLevel.getBounds();
        int maxY = bounds == null ? Integer.MAX_VALUE : Math.min(this.layerCapY, bounds.max().getY() + 1);
        int minY = bounds == null ? Integer.MIN_VALUE : bounds.min().getY();

        // 2. Render 3D structure body (including optional Effects example)
        StructurePreviewRenderer.getInstance().render(
            this.sandboxLevel,
            this.cameraRig,
            graphics.bufferSource(),
            minY,
            maxY,
            StructurePreviewRenderer.Effects.NONE
        );

        // 3. Unproject screen mouse position to world ray and pick
        this.hoveredPos = pickAtScreen(mouseX, mouseY, minY, maxY);
        if (this.hoveredPos != null) {
            List<Component> lines = StructurePreviewPicker.tooltip(this.sandboxLevel, this.hoveredPos, this.placementPos);
            this.pager.setLines(lines);

            // Update screen anchor for the read-only container popup (simplified using mouse pos; project hoveredPos center in production)
            Vector2f anchor = projectBlockCenter(this.hoveredPos);
            this.guiPreview.anchor(anchor.x, anchor.y, !this.guiPreview.contains(mouseX, mouseY));
        }

        // 4. Render read-only container popup and paginated tooltips
        this.guiPreview.render(graphics);
        if (this.hoveredPos != null && !this.guiPreview.contains(mouseX, mouseY)) {
            List<Component> visibleTooltip = this.pager.visible(this.font, this.width, this.height);
            if (!visibleTooltip.isEmpty()) {
                graphics.renderComponentTooltip(this.font, visibleTooltip, mouseX, mouseY);
            }
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (this.guiPreview.mouseClicked(mouseX, mouseY, button)) {
            return true;
        }
        if (button == 0 && this.hoveredPos != null && this.sandboxLevel != null) {
            Vector2f anchor = projectBlockCenter(this.hoveredPos);
            // Left-click a block with a container/provider to open the read-only native GUI popup
            if (this.guiPreview.open(this.hoveredPos, this.template, this.hoveredPos, anchor.x, anchor.y)) {
                return true;
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dragX, double dragY) {
        if (this.guiPreview.mouseDragged(mouseX, mouseY, button)) {
            return true;
        }
        this.cameraRig.setRotationY(this.cameraRig.getRotationY() + (float) dragX * 0.6F);
        this.cameraRig.setRotationX(this.cameraRig.getRotationX() + (float) dragY * 0.6F);
        return true;
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (this.guiPreview.mouseReleased(button)) {
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (this.hoveredPos != null && !this.guiPreview.contains(mouseX, mouseY)) {
            this.pager.scroll(scrollY);
            return true;
        }
        this.cameraRig.setZoom(Math.max(0.25F, Math.min(4.0F, this.cameraRig.getZoom() + (float) scrollY * 0.15F)));
        return true;
    }

    @Override
    public void removed() {
        // Must call clear() on screen exit to clean up isolated session; never call AbstractContainerScreen#onClose manually
        this.guiPreview.clear();
        super.removed();
    }

    private BlockPos pickAtScreen(double mouseX, double mouseY, int minY, int maxY) {
        Matrix4f inv = new Matrix4f(this.cameraRig.buildProjectionMatrix())
            .mul(this.cameraRig.buildViewMatrix())
            .invert();
        float ndcX = (float) (2.0 * mouseX / this.width - 1.0);
        float ndcY = (float) (1.0 - 2.0 * mouseY / this.height);
        Vector4f near = new Vector4f(ndcX, ndcY, -1.0F, 1.0F).mul(inv);
        Vector4f far = new Vector4f(ndcX, ndcY, 1.0F, 1.0F).mul(inv);
        near.div(near.w);
        far.div(far.w);
        return StructurePreviewPicker.pick(
            this.sandboxLevel,
            new Vec3(near.x, near.y, near.z),
            new Vec3(far.x, far.y, far.z),
            minY,
            maxY
        );
    }

    private Vector2f projectBlockCenter(BlockPos pos) {
        Matrix4f vp = new Matrix4f(this.cameraRig.buildProjectionMatrix())
            .mul(this.cameraRig.buildViewMatrix());
        Vector4f clip = new Vector4f(pos.getX() + 0.5F, pos.getY() + 0.5F, pos.getZ() + 0.5F, 1.0F).mul(vp);
        clip.div(clip.w);
        return new Vector2f((clip.x * 0.5F + 0.5F) * this.width, (0.5F - clip.y * 0.5F) * this.height);
    }
}
```

---

## Part 2: Read-Only Container Popups & Custom Providers (`preview.gui`)

`StructureGuiPreview` renders chest, furnace, hopper, or custom machine UIs as floating popups without modifying the real player's inventory or sending packets:

- **Auto-detects vanilla containers**: if the target block entity implements `MenuProvider`, `StructureGuiSession.create(...)` creates an isolated creative-mode fake `Player`, builds the screen via `MenuScreens.getScreenFactory(...)`, and safely restores the real player's `containerMenu`.
- **Custom menu-less block UIs (`StructureGuiProviders`)**: for blocks without standard `MenuProvider`s or with custom storage protocols, register a read-only screen builder on client init via `StructureGuiProviders.register(blockId, provider)`.
- **Lifecycle safety rules**:
  1. Read-only screens **only receive init, resize, and render**—never `tick`, `mouseClicked` (except `StructureGuiPreview`'s own drag/close), `onClose`, or `removed`, preventing server packets or item drops.
  2. Inside providers, **only use `context.level()`, `context.player()`, `context.pos()`, and `context.template()`**; never install as `Minecraft.screen`.
  3. Always call `guiPreview.clear()` when closing the screen, resizing, or switching structures.

### Example: Registering a Custom Read-Only Screen

```java
package com.example.examplemod.client;

import dev.anvilcraft.lib.v2.rendering.preview.gui.StructureGuiProviders;
import net.minecraft.resources.ResourceLocation;

public final class CustomGuiProviderInit {
    public static void onClientSetup() {
        StructureGuiProviders.register(
            ResourceLocation.fromNamespaceAndPath("examplemod", "arcane_pedestal"),
            context -> {
                // Read block entity or raw structure data from isolated sandbox using context.level() and context.pos()
                if (context.level().getBlockEntity(context.pos()) == null) {
                    return null;
                }
                return new ReadonlyPedestalScreen(context.level(), context.pos(), context.player().getInventory());
            }
        );
    }
}
```

::: danger Duplicate Registration Guard
Registering the same block `ResourceLocation` twice in `StructureGuiProviders.register(...)` throws `IllegalStateException`. Ensure each block is registered only once in `FMLClientSetupEvent`.
:::

---

## Full Public API Reference

### 1. `dev.anvilcraft.lib.v2.rendering.preview`

#### `ViewportCameraRig` & `PerspectivePreset`

| Member / Method Signature | Parameters / Attributes | Description |
| --- | --- | --- |
| `enum PerspectivePreset` | `ISOMETRIC_NORTH_EAST` (`225, 30, 0`), `ISOMETRIC_NORTH_WEST` (`135, 30, 0`), `UP` (`120, 0, 45`) | Preset orthographic viewing angles (`yawDeg, pitchDeg, rollDeg`) |
| `ViewportCameraRig()` | No-arg | Creates camera controller with default `zoom = 1` |
| `void configureViewport(int width, int height)` | Viewport width/height (pixels) | Configures orthographic viewport dimensions |
| `void applyPreset(PerspectivePreset preset)` | Preset enum | Applies yaw/pitch/roll angles in one call |
| `void setOrthographicAngles(float yawDeg, float pitchDeg, float rollDeg)` | Angles (degrees) | Sets custom orthographic Euler angles |
| `Matrix4f buildViewMatrix()` | Returns view matrix | Builds orthographic view matrix with `0.625F * 16 * zoom` scale and pan/rotation |
| `Matrix4f buildProjectionMatrix()` | Returns projection matrix | Builds orthographic projection matrix with near `-1000` and far `3000` |
| `get/setZoom(float)` | Lombok `@Getter/@Setter` | Gets or sets zoom factor |
| `get/setRotationX/Y/Z(float)` | Lombok `@Getter/@Setter` | Gets or sets per-axis rotation angles |
| `get/setOffsetX/Y(float)` | Lombok `@Getter/@Setter` | Gets or sets viewport pan offsets |

#### `SectionOffsetVertexConsumer` & `SodiumSpriteBridge`

| Class / Method Signature | Description |
| --- | --- |
| `SectionOffsetVertexConsumer(VertexConsumer delegate, SectionPos sectionPos)` | Wraps any `VertexConsumer`, intercepting `addVertex(x, y, z)` and translating local section coords by `sectionPos * 16` |
| `static void SodiumSpriteBridge.pingSpriteUsage(@Nullable TextureAtlasSprite sprite)` | When Sodium is installed, notifies Sodium's `SpriteUtil` that the sprite is active so animated water/lava textures keep ticking in previews |

---

### 2. `dev.anvilcraft.lib.v2.rendering.preview.level`

#### `StructureSandboxFactory`

| Method Signature | Parameters & Return | Description |
| --- | --- | --- |
| `static @Nullable SandboxRenderLevel create(@Nullable Level clientLevel, StructureTemplate template, BlockPos placementPos)` | `clientLevel`: reference level for registries/features (nullable); `template`: vanilla structure template; `placementPos`: placement anchor | Builds a populated isolated sandbox level, capturing raw block entity NBT and reconstructing states as needed |
| `static BlockPos centeredPlacement(StructureTemplate template)` | Recommended placement coord near origin | Computes centered anchor `BlockPos` from template dimensions |

#### `SandboxRenderLevel`

Extends `net.minecraft.world.level.Level` and includes public `record Bounds(BlockPos min, BlockPos max)`.

| Constructor / Method Signature | Description |
| --- | --- |
| `SandboxRenderLevel()` | Constructs sandbox level with default empty registries and feature flags |
| `SandboxRenderLevel(RegistryAccess registryAccess)` | Constructs sandbox level with specified `RegistryAccess` |
| `SandboxRenderLevel(RegistryAccess registryAccess, FeatureFlagSet enabledFeatures)` | Constructs sandbox level with both `RegistryAccess` and `FeatureFlagSet` |
| `@Nullable CompoundTag getStructureBlockEntityData(BlockPos pos)` | Returns a **copy** of the raw block entity NBT captured from the structure template at `pos` (or `null`) |
| `void restoreBlockEntitiesForInspection()` | Writes all captured raw block entity NBTs back into their corresponding block entities for read-only GUI inspection |
| `@Nullable BlockEntity getBlockEntity(BlockPos pos)` | Returns the loaded block entity in the sandbox |
| `Iterable<Entity> getEntitiesForRendering()` | Iterates all display entities loaded into the sandbox |
| `void addEntity(Entity entity)` | Adds an entity to the sandbox |
| `void removeEntity(int id, Entity.RemovalReason reason)` | Removes an entity from the sandbox |
| `void tickFrameClock()` | Advances the sandbox render clock and animation interpolation tick (typically called once per frame before render) |
| `float getPartialTick()` | Returns the fractional tick progress of the sandbox frame clock |
| `boolean hasContent()` | Whether the sandbox contains any blocks or entities |
| `boolean hasFilledBlocks()` | Whether any non-air blocks exist |
| `Stream<BlockPos> getFilledBlocks()` | Streams all non-air block coordinates; **note: reuses a single `MutableBlockPos`—call `.immutable()` when storing** |
| `@Nullable Bounds getBounds()` | Returns `Bounds(min, max)` enclosing all non-air blocks, or `null` if empty |
| `boolean isFilledBlock(BlockPos pos)` | Checks whether `pos` is a non-air filled block |
| `void refreshLightingAround(BlockPos pos)` | Locally refreshes light engine data around `pos` |

#### `StructurePreviewRenderer`

| Member / Method Signature | Description |
| --- | --- |
| `interface Effects` | Extra render effect callback interface: includes no-op `Effects.NONE`, `default void submit(MultiBufferSource.BufferSource buffers)`, and `default void render()` |
| `static StructurePreviewRenderer getInstance()` | Returns the singleton renderer (render thread only) |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig)` | Renders the entire sandbox level using default buffers |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, MultiBufferSource.BufferSource buffers)` | Renders the entire sandbox level using caller's `buffers` |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, MultiBufferSource.BufferSource buffers, int visibleMinY, int visibleMaxYExclusive)` | Renders only block layers with Y in `[visibleMinY, visibleMaxYExclusive)`, clipping entities and BEs accordingly |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, MultiBufferSource.BufferSource buffers, int visibleMinY, int visibleMaxYExclusive, Effects effects)` | Same sliced render plus `effects` callbacks |
| `void renderContent(SandboxRenderLevel level, MultiBufferSource.BufferSource buffers)` | Draws all sandbox geometry, block entities, and entities directly using externally configured camera/matrix state |
| `void renderContent(SandboxRenderLevel level, MultiBufferSource.BufferSource buffers, int visibleMinY, int visibleMaxYExclusive)` | Draws `[visibleMinY, visibleMaxYExclusive)` sliced content directly using external camera/matrix state |
| `static void markFluidSpritesActive(FluidState fluidState)` | Marks the fluid's still/flowing sprites active via `SodiumSpriteBridge` |

#### Picking, NBT Details & Lighting/Chunk Support Classes

| Class | Core Public Methods & Description |
| --- | --- |
| `StructurePreviewPicker` | `static @Nullable BlockPos pick(SandboxRenderLevel level, Vec3 start, Vec3 end, int minY, int maxY)`: runs DDA/bounding-box ray picking within the Y range.<br>`static List<Component> tooltip(SandboxRenderLevel level, BlockPos pos, BlockPos placementPos)`: builds tooltip lines with relative coords, block name, and formatted NBT summary. |
| `StructureBlockEntityDetails` | `static Map<BlockPos, CompoundTag> capture(CompoundTag template, BlockPos placementPos)`: extracts BE data indexed by target pos from raw template NBT.<br>`static List<Component> describe(String blockId, CompoundTag data)`: formats NBT into readable components (max 4096 lines, depth 32, using `tooltip.anvillib_rendering.structure_preview.nbt.*` keys). |
| `StructureDetailsPager` | `void setLines(List<Component> lines)`: sets full detail lines.<br>`List<Component> visible(Font font, int screenWidth, int screenHeight)`: wraps to `min(320, screenWidth - 24)` width and max `12` lines per page with `page x / total`.<br>`void scroll(double amount)`: switches pages on mouse scroll. |
| `PreviewLightmapAtlas` | Implements `AutoCloseable`: manages the dedicated preview lightmap texture (`computeSkyDarken(Level, float partialTick)`, `update(Level)`, `bind()`, `close()`). |
| `SandboxChunkProvider` | Extends `ChunkSource`, lazily providing and caching `SandboxLevelChunk`s and `LevelLightEngine` for `SandboxRenderLevel`. |
| `SandboxLevelChunk` | Extends `LevelChunk`, storing block states and block entities directly in the isolated client sandbox without a real world connection. |
| `DelegatingServerLevelAccessor` | Implements `ServerLevelAccessor`, intercepting `StructureTemplate#placeInWorld` writes in `StructureSandboxFactory` and routing them to `SandboxRenderLevel`. |

---

### 3. `dev.anvilcraft.lib.v2.rendering.preview.gui`

#### `StructureGuiProviders`

| Member / Method Signature | Description |
| --- | --- |
| `@FunctionalInterface interface Provider` | `@Nullable AbstractContainerScreen<?> create(Context context)`: creates a read-only container screen from sandbox context |
| `record Context(SandboxRenderLevel level, Player player, BlockPos pos, StructureTemplate template)` | Read-only sandbox context passed to custom providers |
| `static void register(ResourceLocation block, Provider provider)` | Registers a custom read-only screen provider for `block` ID; throws `IllegalStateException` on duplicate registration |

#### `StructureGuiSession`

| Member / Method Signature | Description |
| --- | --- |
| `StructureGuiSession(AbstractContainerScreen<?> screen, SandboxRenderLevel level, Player player)` | Wraps the initialized read-only screen, isolated level, and fake player |
| `static @Nullable StructureGuiSession create(Minecraft minecraft, StructureTemplate template, BlockPos pos)` | Builds a read-only session from template and target pos: restores sandbox BE -> creates fake creative player -> checks `StructureGuiProviders` or falls back to `MenuProvider` + `MenuScreens` -> initializes screen inside `renderOnly` and restores real player menu |
| `static boolean isRendering()` | Checks whether currently inside a read-only GUI preview render/init scope |
| `static void renderOnly(Runnable action)` | Enters read-only scope at opacity `1.0F` and runs `action` (auto-pops in `try/finally`, supports nesting) |
| `static void renderOnly(float alpha, Runnable action)` | Enters read-only scope at specified opacity `alpha` |
| `static float opacity()` | Returns the opacity of the current nested read-only scope |
| `static int tint(int color)` | Multiplies the ARGB color's alpha channel by `opacity()` for Mixins and custom draws |

#### `StructureGuiPreview` & `StructureGuiGeometry`

| Class / Method Signature | Description |
| --- | --- |
| `StructureGuiPreview()` / `StructureGuiPreview(BooleanSupplier reducedMotion)` | Constructs the floating preview controller, optionally taking a reduced-motion preference supplier (e.g., `() -> Minecraft.getInstance().options.reducedMotion().get()`) |
| `boolean open(Object owner, StructureTemplate template, BlockPos pos, float anchorX, float anchorY)` | Opens the read-only container popup for `owner` at `pos`, animating from the anchor; returns `false` if no screen is available |
| `@Nullable BlockPos blockFor(Object component)` | Queries the structure block coordinate currently bound to the given UI component/owner |
| `void beginFrame()` | Called once per frame before rendering to reset visibility flags and advance open/close animations |
| `void anchor(float x, float y, boolean visible)` | Updates the block's latest screen-projected anchor coordinates and visibility each frame |
| `boolean contains(double mouseX, double mouseY)` | Checks whether the mouse is currently inside the expanded popup region |
| `boolean mouseClicked(double mouseX, double mouseY, int button)` | Handles mouse clicks: left-drag inside popup moves it, right-click triggers close animation |
| `boolean mouseDragged(double mouseX, double mouseY, int button)` | Handles drag translation of the popup |
| `boolean mouseReleased(int button)` | Ends drag state |
| `void clear()` | Immediately destroys the current popup session and resets animation state (**never fires `Screen#onClose` / `removed`**) |
| `void render(GuiGraphics graphics)` | Renders the popup and scale transition inside `StructureGuiSession.renderOnly(alpha, ...)` |
| `static Vector2f StructureGuiGeometry.edge(float x, float y, float width, float height, float anchorX, float anchorY)` | Computes the point on the rectangle's edge closest to `(anchorX, anchorY)` |
| `static float StructureGuiGeometry.easeOut(float progress)` | Ease-out interpolation curve corresponding to `cubic-bezier(0.23, 1, 0.32, 1)` |
