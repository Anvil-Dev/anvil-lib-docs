# Cube Sloped Edges & Precise Picking: Overview & Exclusion Rules (`module.cube`)

<BranchContextCard branch="26.2" />

`module.cube` (artifact `anvillib-cube-neoforge-26.2`, package `dev.anvilcraft.lib.v2.cube`) provides **precise ray picking** and **true polyhedral union outline highlighting** for blocks containing rotated elements (sloped blocks, mechanical parts, decorative models).

In vanilla Minecraft, a block's selection box (`VoxelShape`) can only be composed of axis-aligned cuboids (AABBs). If a block JSON model contains rotated `elements` (such as 22.5° / 45° diagonal struts or 26.2 tri-axis Euler rotations), vanilla crosshair picking and black outlines either degrade into rough stepped AABBs or box the entire 1x1x1 block. `module.cube` extracts the real rotated cuboid elements during client model baking, converts them into closed convex polyhedra (`ConvexShape`), builds a BVH acceleration structure, and computes true outer contour edges on a background thread with coplanar seams removed.

This module is split into 3 sub-documents by functionality:
- **This page (Overview, Events & Target Exclusion Rules)**: Covers namespace opt-in, permanent exclusions, ID-keyed reloadable runtime target exclusion rules, plus `AnvilLibCube`, `CubeSelection` (config entry), `CubeHighlightEvents`, and `CubeModelEvents`.
- **[Precise Picking & Dynamic Part Providers](./picking-and-selection)**: Covers `CubePicking`, `BlockSelectionProvider` (for dynamic BlockEntity BER parts), `SelectionPart`, `CubeSelection.Target`, and `OutlineRenderer`.
- **[Model Capture, Decoding & Geometry Outline Cache](./model-and-geometry)**: Covers `ModelCapture`, `CubeModelDecoder`, `ModelSelection`, `ModelSelections`, `ConvexShape`, `SelectionGeometry`, `OutlineBuilder`, `OutlineCache`, and `PackedOutline`.

---

## 1. Setup & Quick Enablement

### 1. Gradle Dependency

If you already depend on the aggregate artifact `anvillib-neoforge-26.2`, this module is included automatically. To depend on `cube` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-cube-neoforge-26.2:2.0.0")
}
```

### 2. Three Steps to Enable Sloped Outlines & Precise Picking

`module.cube` does **not** scan all mods' blocks indiscriminately by default. Your mod must explicitly opt in its namespace during **client initialization (before model baking occurs)** by calling `CubeSelection.enableNamespace(MOD_ID)`:

```java
package com.example.mymod.client;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;

@Mod(value = MyMod.MOD_ID, dist = Dist.CLIENT)
public class MyModClient {
    private static final Identifier BLACKLIST_RULE_ID =
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "config_blacklist");

    public MyModClient() {
        // 1. Enable precise model picking and sloped outline highlighting for all blocks under this mod's namespace
        CubeSelection.enableNamespace(MyMod.MOD_ID);

        // 2. (Optional) Permanently exclude specific blocks that do not need model picking (skips model geometry baking)
        CubeSelection.exclude(ModBlocks.SIMPLE_CABLE.get());

        // 3. (Optional) Register runtime dynamic exclusion rules: toggle sloped outlines anytime based on client config or block state without rebaking models
        CubeSelection.registerTargetExclusion(
            BLACKLIST_RULE_ID,
            state -> !MyModClientConfig.INSTANCE.enableFancyOutline
                || state.is(ModBlocks.DEBUG_FRAME.get())
        );
    }
}
```

### 3. Data-Driven Resource Pack Rules (`assets/<namespace>/anvillib/cube_selection.json`)

In addition to the Java API, mods or modpacks (e.g., KubeJS) can declare or override selection and outline modes via `assets/<namespace>/anvillib/cube_selection.json` in resource packs, taking effect on `F3+T` reload:

```json
{
  "namespaces": {
    "kubejs": "model"
  },
  "blocks": {
    "kubejs:example": "outline",
    "kubejs:interaction_proxy": "vanilla"
  }
}
```

- **`model`**: Enables both precise model ray picking and model sloped outline rendering;
- **`outline`**: Preserves the block's original collision-shape ray picking while enabling only the model sloped outline (ideal for blocks needing a custom click box with detailed geometry outlines);
- **`vanilla`**: Completely falls back to vanilla picking and outline;
- **Priority & Merge Rules**: `blocks` takes precedence over `namespaces`, and unconfigured entries keep defaults registered by the Java API (`enableNamespace` / `registerDynamic`); loaded from lowest to highest resource pack, overriding key-by-key in lexicographical resource ID order within a pack; invalid fields, unknown modes, or invalid `Identifier`s log a warning and skip the file; `CubeSelection.exclude(Block)` and `registerTargetExclusion(...)` always take precedence over resource rules.

---

## 2. Core Workflow & Lifecycle

The full lifecycle of `module.cube` from resource loading to per-frame rendering is as follows:

1. **Namespace & Permanent Exclusion Registration (Client Mod Construction)**:
   Call `CubeSelection.enableNamespace(modId)` to whitelist your namespace, and `CubeSelection.exclude(block)` to permanently blacklist specific blocks.
2. **Model Capture & Geometry Baking (Resource Reload / Model Baking)**:
   - As vanilla bakes each `SimpleModelWrapper`, a Mixin calls `ModelCapture.remember(...)` to temporarily record `UnbakedCuboidGeometry`'s `elements` and combined `ModelState` in a `weakKeys` map.
   - In `ModelEvent.ModifyBakingResult` (`EventPriority.LOWEST`), `CubeModelEvents.prepare` loads merged `CubeSelectionRules` from `anvillib/cube_selection.json`, then calls `ModelSelections.bake(...)` to consume and clear `ModelCapture`, decoding rotated cuboids of enabled (`model` or `outline`) `BlockState`s into `ConvexShape`s and building shared `SelectionGeometry` (capped at `16 MB` and `32768` states).
   - In `ModelEvent.BakingCompleted`, `CubeModelEvents.apply` calls `CubeSelection.install(snapshot, rules)` (which calls `install(snapshot)`) to atomically swap the active model table and rules, clearing old frame and outline caches.
3. **Crosshair Ray Precise Picking (Per-Frame `Entity#pick`)**:
   During client crosshair raycasting, `CubePicking.pick(...)` first calls `CubeSelection.beginFrame(level, partialTick)` so dynamic geometry in `outline` mode also refreshes per frame, then when `CubeSelection.active()` is `true` (at least one static or dynamic `model`-mode block exists), checks the current block and neighboring blocks within `searchRadius()` (up to 2 blocks); if `CubeSelection.target(...)` returns a valid target, computes exact intersection and hit face normal in local space using BVH and convex polyhedron clipping.
4. **Sloped Outline Highlighting (Per-Frame `ExtractBlockOutlineRenderStateEvent`)**:
   `CubeHighlightEvents.highlight` calls `CubeSelection.outlineTarget(...)` (responding to both `model` and `outline` modes) for the targeted block, asynchronously retrieves the union outline `PackedOutline` from `OutlineCache` (or falls back to lightweight `fallbackOutline`), filters out tiny offset inner seams `< 0.1/16` pixels via `forView(localCamera)`, and draws vanilla lines or high-contrast dual-pass outlines via `OutlineRenderer.render`.

---

## 3. Public Classes & API Reference

### 1. `AnvilLibCube` (Module Main Class)

| Class / Constant Signature | Description |
| :--- | :--- |
| `public static final String MOD_ID = "anvillib_cube"` | Module Mod ID constant. |

### 2. `CubeSelection` (Namespace, Exclusion Rules & Global State)

Located in `dev.anvilcraft.lib.v2.cube.client.CubeSelection`. This section lists its configuration and lifecycle methods (see [Precise Picking & Dynamic Part Providers](./picking-and-selection) for dynamic parts and query methods):

| Constant / Method Signature | Return Type | Timing, Parameters & Boundary Conditions |
| :--- | :--- | :--- |
| `public static final int MAX_PARTS = 32` | `int` | Maximum number of `SelectionPart`s allowed per block state (including multipart and dynamic BER parts). Exceeding 32 parts falls back to vanilla selection box. |
| `public static void enableNamespace(String namespace)` | `void` | **Must be called before model baking**. Validates `namespace` (via `Identifier.fromNamespaceAndPath(namespace, "cube_selection")`) and adds it to the enabled set. Throws `IdentifierException` if `namespace` contains invalid characters. |
| `public static void exclude(Block block)` | `void` | Adds `block` to the permanent exclusion set. Excluded blocks neither bake model geometry in `ModelSelections.bake` nor respond to dynamic parts or `modelParts` queries. |
| `public static void registerTargetExclusion(Identifier id, Predicate<BlockState> exclusion)` | `void` | Registers a **runtime target exclusion rule** keyed by `id`.<br>• Re-registering the same `id` replaces the old rule; distinct `id`s do not overwrite each other.<br>• When any registered rule returns `true` for a `BlockState`, `CubeSelection.target(...)` returns `null`, falling back to vanilla picking and outline immediately.<br>• **Advantage**: Evaluated before frame-cache lookup without affecting baked model caches; changing client config or unregistering restores sloped outlines immediately without resource reload.<br>• **Note**: `exclusion` runs on the per-frame render/pick hot path, so it must be side-effect-free and must not hold strong references to `Level` or `BlockEntity`. |
| `public static boolean unregisterTargetExclusion(Identifier id)` | `boolean` | Removes the runtime target exclusion rule for `id`. Returns `true` if previously present and removed. Does not affect other `id`s or permanent exclusions set via `exclude(Block)`. |
| `public static boolean isTargetExcluded(BlockState state)` | `boolean` | Checks whether `state.getBlock()` is permanently excluded via `exclude(Block)` or matches any registered `registerTargetExclusion` rule. |
| `public static boolean isEnabled(Block block)` | `boolean` | Determines whether `block` has model geometry enabled (final mode `MODEL` or `OUTLINE`, not `VANILLA`) after combining `exclude(Block)`, Java defaults (`enableNamespace` / `registerDynamic`), and active `anvillib/cube_selection.json` rules. |
| `public static boolean supportedBounds(AABB bounds)` | `boolean` | Validates that all bounding box coordinates are finite floats and lie within `[-2, 3]` block coordinates (extending at most 2 blocks outward). For blocks with vanilla random offset (`state.hasOffsetFunction()`), `bounds.inflate(0.5)` is checked during baking and dynamic registration. |
| `public static void install(ModelSelections.Snapshot snapshot)` | `void` | Installs a new baked model snapshot, clears `OutlineCache` and the frame cache, and recomputes precise-picking flags and cross-block search `radius` (`0–2`) for `MODEL`-mode blocks only. Called automatically by `CubeModelEvents.apply`. |
| `public static void beginFrame(ClientLevel level, float fraction)` | `void` | Resets the single-frame target cache `FRAME` and records the current `ClientLevel` and `partialTick` interpolation fraction. |
| `public static void clearWorld()` | `void` | Clears the single-frame target cache and `OutlineCache`. Called automatically by `CubeHighlightEvents.disconnect` when leaving a world. |
| `public static OutlineCache outlines()` | `OutlineCache` | Returns the global shared background outline cache instance. |
| `public static int searchRadius()` | `int` | Returns the maximum block extension beyond `[0, 1]` among active `MODEL`-mode models and dynamic parts (`0–2`). When `0`, `CubePicking` skips scanning neighboring blocks. |
| `public static boolean active()` | `boolean` | Whether the current snapshot has at least one static model or dynamic block provider in `MODEL` mode (`OUTLINE`-only geometry does not trigger neighbor ray-rescanning). |
| `public static boolean extendsBlock(BlockState state)` | `boolean` | Checks whether a `MODEL`-mode `BlockState` model or dynamic part bounds extend beyond the standard `[0, 1]^3` unit block. |
| `public static Statistics statistics()` | `CubeSelection.Statistics` | Returns a memory and cache statistics snapshot: `states` (cached state count), `geometryBytes` (estimated shared geometry bytes), `unsupportedStates` (skipped states due to budget or non-convexity), and `outlines` (`OutlineCache.Statistics`). |

### 3. `CubeModelEvents` & `CubeHighlightEvents` (Client Event Listeners)

Both classes are annotated with `@EventBusSubscriber(modid = AnvilLibCube.MOD_ID, value = Dist.CLIENT)` and registered automatically by NeoForge:

| Class | Event & Method Signature | Description |
| :--- | :--- | :--- |
| `CubeModelEvents` | `@SubscribeEvent(priority = EventPriority.LOWEST)`<br>`public static void prepare(ModelEvent.ModifyBakingResult event)` | Reads and merges `anvillib/cube_selection.json` rules by resource pack priority from `ResourceManager`, then calls `ModelSelections.bake(...)` to extract and bake a snapshot of all geometry-enabled (`MODEL` and `OUTLINE`) blocks. |
| `CubeModelEvents` | `@SubscribeEvent`<br>`public static void apply(ModelEvent.BakingCompleted event)` | Once model baking completes, calls `CubeSelection.install(pending, pendingRules)` to atomically publish rules and geometry snapshot and release temporary references. |
| `CubeHighlightEvents` | `@SubscribeEvent(priority = EventPriority.LOWEST)`<br>`public static void highlight(ExtractBlockOutlineRenderStateEvent event)` | Intercepts vanilla block outline render-state extraction. If `CubeSelection.outlineTarget(...)` returns a valid target (supporting both `MODEL` and `OUTLINE` modes), registers a custom renderer via `event.addCustomRenderer(...)`: automatically handles translucent pass (`translucentPass`), accessibility high-contrast dual-pass outlines (`state.highContrast()`, drawing a `7.0F`-wide black base line then the high-contrast thin line), and bounding-box `fallback` when a target exceeds `4096` segments. |
| `CubeHighlightEvents` | `@SubscribeEvent`<br>`public static void disconnect(ClientPlayerNetworkEvent.LoggingOut event)` | Calls `CubeSelection.clearWorld()` to release caches when the player disconnects from a world. |
