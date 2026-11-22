# Full-Branch Module & Sub-Document Checklist

This document tracks the sub-document breakdown and completion status of **1 `main` aggregate module and 20 feature submodules** across all **7 `dev` branches** of `AnvilLib`.

## 1. Overview of the 7 Target `dev` Branches

| No. | Git Branch | Route Prefix | Minecraft | NeoForge | Java | Rendering Module Scope |
| :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| 1 | `dev/1.21.1` | `/en/1.21.1/` | `1.21.1` | `21.1.x` | 21 | Projection structure rendering (4 docs) |
| 2 | `dev/1.21.4` | `/en/1.21.4/` | `1.21.4` | `21.4.x` | 21 | Projection structure rendering (4 docs) |
| 3 | `dev/1.21.8` | `/en/1.21.8/` | `1.21.8` | `21.8.x` | 21 | Projection + 2D SDF + Blur/Buffers + GuiState (6 docs) |
| 4 | `dev/1.21.11` | `/en/1.21.11/` | `1.21.11` | `21.11.x` | 21 | Projection + 2D SDF + Blur/Buffers + GuiState (6 docs) |
| 5 | `dev/26.1` | `/en/26.1/` | `26.1.2` | `26.1.2.x` | 25 | Full ALR rendering engine: Compute/Bindless/Bloom/CachedBER/Hi-Z/Projection/Preview/SDF/PiP (10 docs) |
| 6 | `dev/26.2` | `/en/26.2/` | `26.2` | `26.2.x` | 25 | Full ALR rendering engine: Compute/Bindless/Bloom/CachedBER/Hi-Z/Projection/Preview/SDF/PiP (10 docs) |
| 7 | `dev/26.3` | `/en/26.3/` | `26.3` | `26.3.x` | 25 | Full ALR rendering engine: Compute/Bindless/Bloom/CachedBER/Hi-Z/Projection/Preview/SDF/PiP (10 docs) |

---

## 2. Per-Branch Module & Sub-Document Breakdown (Independent per Branch)

The paths below use `/en/<branch>/` to represent each branch's independent route (e.g., `/en/26.3/`, `/en/26.2/`, `/en/26.1/`, `/en/1.21.1/`):

### 1. Main & Getting Started (`module.main`)
- [x] All branches (`1.21.1` / `1.21.4` / `1.21.8` / `1.21.11` / `26.1` / `26.2` / `26.3`): `/en/<branch>/index.md` & `/en/<branch>/getting-started.md`

### 2. Codec Data Serialization (`module.codec`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/codec/index.md` — `CodecUtil` & `StreamCodecUtil`

### 3. Collision Detection Utilities (`module.collision`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/collision/index.md` — `AnvilLibCollision` & `CollisionTest` SAT collision detection

### 4. Config Annotation System (`module.config`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/config/index.md`, `client-screen.md`, `datagen-and-util.md`

### 5. Cube Sloped Edges & Precise Picking (`module.cube`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/cube/index.md`, `picking-and-selection.md`, `model-and-geometry.md`

### 6. Explosion System (`module.explosion`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/explosion/index.md` — `AnvilLibExplosion`, `AnvilLibExplosionConfig`, `ExplosionExecutor`, `ExplosionSession`

### 7. Font & SDF Text Rendering (`module.font`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/font/index.md`, `sdf-renderer.md`, `screens.md`

### 8. Integration Mod Compatibility (`module.integration`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/integration/index.md` — `@Integration`, `IntegrationHook`, `IntegrationType`, `ModVersionRange`, `IntegrationInstance`, `IntegrationManager`

### 9. Math Expression System (`module.math`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/math/index.md`, `functions-and-registries.md`

### 10. Moveable Entity Block (`module.moveable-entity-block`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/moveable-entity-block/index.md` — `IMoveableEntityBlock`, `AnvilLibMoveableEntityBlock`, `IPistonMovingBlockEntityExtension`

### 11. Multiblock Dynamic Structures (`module.multiblock`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/multiblock/index.md`, `controller-and-state.md`, `events-and-network.md`

### 12. Network Communication Framework (`module.network`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/network/index.md`, `registrar-and-util.md`

### 13. Recipe In-World System (`module.recipe`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/recipe/index.md`, `triggers.md`, `predicates.md`, `outcomes.md`, `caches.md`, `context-and-events.md`

### 14. Registrum Registration & Datagen (`module.registrum`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/registrum/index.md`, `block-and-be.md`, `item-and-creativetab.md`, `entity-fluid-menu.md`, `data-villager-modifier.md`, `datagen-providers.md`

### 15. Rendering Extensions (`module.rendering`)
- **In `dev/1.21.1` & `dev/1.21.4` (4 docs)**:
  - [x] `/en/<branch>/rendering/index.md` — `AnvilLibRendering`, `ProjectionRenderTypes`, `ProjectionShaders`, `ProjectionBuffers`
  - [x] `/en/<branch>/rendering/projection-scene.md` — `ProjectionScene`, `ProjectionMesh`, `GhostConsumer`
  - [x] `/en/<branch>/rendering/projection-renderer.md` — `ProjectionRenderer`, `ProjectionOverlay`
  - [x] `/en/<branch>/rendering/structure-preview.md` — Read-only structure sandbox & UI preview
- **In `dev/1.21.8` & `dev/1.21.11` (6 docs)**:
  - [x] `/en/<branch>/rendering/index.md` — `AnvilLibRendering` & `ALRPipelines`
  - [x] `/en/<branch>/rendering/projection.md` — `ProjectionScene`, `ProjectionMesh`, `ProjectionRenderer`, `ProjectionOverlay`, `ProjectionRenderTypes`, `ProjectionFeatures`, `ProjectionRenderEvents`
  - [x] `/en/<branch>/rendering/structure-preview.md` — Read-only structure sandbox & UI preview
  - [x] `/en/<branch>/rendering/sdf.md` — `Sdf2d`, `SdfGraphics`, `SdfParameters`, `SdfPassType`, `SdfRenderType`
  - [x] `/en/<branch>/rendering/buffers-and-blur.md` — `GaussianBlur`, `BlurParametersUbo`, `TransformsUbo`, `BufferLayout` (`Std140` / `Std430`), `BufferObject`, `VertexBufferHost`, `EmptyBufferSource`
  - [x] `/en/<branch>/rendering/gui-state.md` — `GuiRenderAccess`, `LibGuiElementRenderState`, `LibQuadGuiElementRenderState`
- **In `dev/26.1`, `dev/26.2` & `dev/26.3` (10 docs)**:
  - [x] `dev/26.1`, `dev/26.2`, `dev/26.3`: `/en/<branch>/rendering/index.md`, `blaze3d-compute.md`, `buffers-foundation.md`, `post-effects.md`, `cached-ber.md`, `occlusion-culling.md`, `projection.md`, `structure-preview.md`, `sdf.md`, `gui-and-fakeworld.md`

### 16. RPC Cross-Side Calls (`module.rpc`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/rpc/index.md`, `refs-and-validation.md`

### 17. Space Select Region Selection (`module.space-select`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/space-select/index.md`, `client-and-events.md`

### 18. Sync Field Auto-Synchronization (`module.sync` & `module.sync:processor`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/sync/index.md`, `processor-and-network.md`

### 19. UI Flexible Widget Library (`module.ui`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/ui/index.md`, `buttons-and-flyouts.md`

### 20. Util General Utilities (`module.util`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/util/index.md`, `flatten-loop.md`, `components.md`, `predicates.md`, `nullness-and-stack.md`

### 21. Wheel Radial Menu Client API (`module.wheel`)
- [x] All branches (`1.21.1` ~ `26.3`): `/en/<branch>/wheel/index.md`, `controller-and-screen.md`
