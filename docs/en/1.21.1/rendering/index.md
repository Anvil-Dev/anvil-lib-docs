# Rendering Module Overview & Setup

`module.rendering` (Mod ID: `anvillib_rendering`, entry class `dev.anvilcraft.lib.v2.rendering.AnvilLibRendering`) is AnvilLib's **client-side structure rendering and read-only preview utility library** on NeoForge 1.21.1.

On `dev/1.21.1`, this module focuses on two cooperating high-performance client rendering subsystems:

1. **Structure Projection Rendering (`projection`)**: Pre-bakes arbitrary snapshots of blocks, fluids, block entities, and entities into GPU `VertexBuffer`s, using custom core shaders for translucent ghost projections, per-block world state diffing (missing/wrong-state/wrong-block highlights), and consistent multi-projection depth occlusion sorting.
2. **Structure Read-Only Sandbox & UI Preview (`preview`)**: Parses and mounts vanilla `StructureTemplate`s into a completely isolated fake client level `SandboxRenderLevel`, supporting orthographic rendering, ray picking, paginated block entity NBT inspection, and `StructureGuiPreview` for hovering native machine/container GUIs without sending packets.

::: tip Scope on This Branch
On 1.21.1, `module.rendering` includes only `projection` (structure projection) and `preview` (read-only sandbox preview), with no upper-mod dependencies and no post-processing/compute shader pipelines.
:::

## Setup

### Gradle Repositories & Dependencies

Official releases are available on Maven Central, but `Cjsah Maven` with `exclusiveContent` filtering is recommended to avoid NeoForge Maven's incomplete Maven Central sync causing interface injection or metadata resolution errors:

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

### Module Metadata

- **Mod ID**: `anvillib_rendering` (defined in `AnvilLibRendering.MOD_ID`)
- **Runtime Side**: Only client rendering features are active; `AnvilLibRendering` itself is declared with `@Mod(AnvilLibRendering.MOD_ID)` so its presence on servers won't crash, but all rendering and preview APIs under `projection` and `preview` **must only be called on the Render Thread**.

## Core Subsystem Navigation

| Sub-document | Core Package | Use Case |
| --- | --- | --- |
| [Structure Projection Scene & Mesh](./projection-scene.md) | `dev.anvilcraft.lib.v2.rendering.projection` | Building ghost structure snapshots (`ProjectionScene`) and understanding `ProjectionShaders` lifecycle |
| [Projection Renderer & Overlay](./projection-renderer.md) | `dev.anvilcraft.lib.v2.rendering.projection` | Pre-baking meshes with `ProjectionRenderer`, comparing against the real world, batch-sorting multiple projections, and freeing VRAM |
| [Structure Sandbox & UI Preview](./structure-preview.md) | `dev.anvilcraft.lib.v2.rendering.preview.*` | Embedding interactive `StructureTemplate` 3D previews, ray picking, and read-only container popups in GUIs/guidebooks |

## Architecture Boundaries & Conventions

### 1. Explicit Lifecycle & Resource Disposal

- Both `ProjectionRenderer` and `PreviewLightmapAtlas` implement `AutoCloseable` and hold native heap memory (`MemoryUtil`) and OpenGL resources (`VertexBuffer` / lightmap textures).
- Always call `close()` explicitly when unloading blueprints, closing screens, or discarding renderers—never rely on GC.
- When the player triggers a resource/shader reload (`F3+T`), `ProjectionShaders` increments the global `generation`. Callers should check `projectionRenderer.isValid()` before rendering and call `rebuild(...)` if invalidated.

### 2. Package-Private Internals & Mixin Scope

- `ProjectionMesh`, `GhostConsumer`, `ProjectionBuffers`, `ProjectionRenderTypes`, and `ProjectionOverlay` in `projection` are **package-private** internals; external code interacts only with `ProjectionScene`, `ProjectionRenderer`, `ProjectionShaders`, and `ProjectionRenderer.Prepared`.
- `preview.gui` relies on 4 preview Mixins in `anvillib_rendering.mixins.json` (`StructureGuiGraphicsMixin`, `StructureGuiRecipeBookMixin`, `StructureGuiRenderStateMixin`, `StructureGuiScreenMixin`) paired with `StructureGuiSession.renderOnly(...)` for translucent read-only GUI tinting and blocking unsafe interactions; **callers do not need to configure these Mixins**, but must only drive read-only screens via `StructureGuiPreview` / `StructureGuiSession` and never install them as `Minecraft.screen`.

## Entry Class Quick Reference

### `AnvilLibRendering`

Package: `dev.anvilcraft.lib.v2.rendering`

| Member | Type | Description |
| --- | --- | --- |
| `MOD_ID` | `public static final String` | Fixed to `"anvillib_rendering"`, also used as the namespace for core shaders and translation keys |
| `AnvilLibRendering()` | Constructor | Automatically instantiated by NeoForge `@Mod` |
