# AnvilLib `dev/1.21.8` Branch Overview

<BranchContextCard branch="1.21.8" />

This document corresponds to `AnvilLib`'s `dev/1.21.8` branch, targeting **Minecraft 1.21.8**, **NeoForge 21.8.x**, and **Java 21**. All code examples, class paths (e.g., `net.minecraft.resources.ResourceLocation`, `GuiGraphics`, `GuiRenderState`, `ValueInput`/`ValueOutput`, `GatherDataEvent.Client`/`GatherDataEvent.Server`, etc. in 1.21.8), and Maven coordinates in this branch strictly align with the `dev/1.21.8` source code.

---

## Environment & Build Baseline

| Setting | `dev/1.21.8` Requirement |
| :--- | :--- |
| **JDK Version** | Java 21 (`java_version=21`) |
| **Minecraft Version Range** | `[1.21.8, 1.21.9)` (dev environment based on `1.21.8`, Parchment `2025.09.14`) |
| **NeoForge Version Range** | `[21,)` (dev environment based on `21.8.53`) |
| **Loader Version Range** | `[4,)` |
| **Maven GroupId** | `dev.anvilcraft.lib` |
| **Aggregate ArtifactId** | `anvillib-neoforge-1.21.8` |
| **Current Project Version (`mod_version`)** | `2.0.0` |

---

## Module Matrix (`dev/1.21.8`)

`AnvilLib` provides **1 aggregate distribution module (`main`)** and **20 independent feature submodules** on `dev/1.21.8` (plus 1 internal test module `test` and the sync annotation/bytecode processor `anvillib-sync-processor-neoforge-1.21.8`):

| Module Name | ArtifactId (`dev.anvilcraft.lib`) | Root Package | Interface Injection | Core Responsibilities & Use Cases |
| :--- | :--- | :--- | :---: | :--- |
| **[Main (Aggregate)](./getting-started)** | `anvillib-neoforge-1.21.8` | `dev.anvilcraft.lib.v2` | Pass-through | Packages and re-exports all 20 runtime feature submodules |
| **[Codec](./codec/)** | `anvillib-codec-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.codec` | No | `Codec` / `MapCodec` / `StreamCodec` presets, 1–16 parameter builder proxies & vanilla `critereon` predicate stream codecs |
| **[Collision](./collision/)** | `anvillib-collision-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.collision` | No | 13-axis SAT AABB-vs-triangle-mesh static collision, 3-axis independent sweep, and true swept collision |
| **[Config](./config/)** | `anvillib-config-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.config` | No | Annotation-driven config declaration, range/slider constraints, nested collapsible objects, translucent sidebar GUI & lang datagen |
| **[Cube](./cube/)** | `anvillib-cube-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.cube` | No | Sloped model edge outline highlighting, BVH precise ray picking, dynamic part providers & runtime exclusion rules |
| **[Explosion](./explosion/)** | `anvillib-explosion-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.explosion` | No | Layered spherical shell explosion sessions (`ExplosionSession`), executor (`ExplosionExecutor`) & smelting/blasting melting cache |
| **[Font](./font/)** | `anvillib-font-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.font` | **Yes** | Client TrueType font management, SDF glyph atlas rendering, config screen & `GuiGraphics` extensions |
| **[Integration](./integration/)** | `anvillib-integration-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.integration` | No | `@Integration`-based conditional loading by external mod presence, version range & physical side / client & server Datagen |
| **[Math](./math/)** | `anvillib-math-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.math` | No | Serializable math expression trees, bidirectional Flat text parsing & validation, vararg custom functions & dual registries |
| **[Moveable Entity Block](./moveable-entity-block/)** | `anvillib-moveable-entity-block-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.piston` | **Yes** | Allows blocks with `BlockEntity` to be pushed by pistons while preserving NBT/ValueInput state & moving render data |
| **[Multiblock](./multiblock/)** | `anvillib-multiblock-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.multiblock` | No | Data-driven dynamic multiblock definitions, controller registration, Codec `SavedData` persistence, formation/disassembly & network sync |
| **[Network](./network/)** | `anvillib-network-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.network` | No | Direction-typed packet interfaces for `PLAY` / `CONFIGURATION` / `COMMON` phases, `@Network` auto-registration & broadcast/packing utils |
| **[Recipe](./recipe/)** | `anvillib-recipe-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.recipe` | **Yes** | In-world recipe system: Triggers, block/item/entity Predicates, Outcomes, `ItemBatchPlan` & `IRecipeMapExtension` |
| **[Registrum](./registrum/)** | `anvillib-registrum-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.registrum` | No | Fluent registration, `AttachmentSync` auto-sync, creative tab sectioned variant pickers & 1.21.8 Datagen providers |
| **[Rendering](./rendering/)** | `anvillib-rendering-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.rendering` | No | 1.21.8 `RenderPipeline` infrastructure: holographic structure projection, sandbox preview, SDF 2D pipeline, Gaussian blur, Std140/Std430 UBOs & `GuiRenderState` bridge |
| **[RPC](./rpc/)** | `anvillib-rpc-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.rpc` | No | `@RemoteCallable` & method-reference cross-side RPC, async/sync return calls & argument validation |
| **[Space Select](./space-select/)** | `anvillib-space-select-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.space_select` | No | 3D region (`District`) management, selector items, client scroll resizing & wireframe rendering |
| **[Sync](./sync/)** | `anvillib-sync-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.sync` | No | `@Sync` / `@LazySync` annotation & bytecode injection (`anvillib-sync-processor-neoforge-1.21.8`) field auto-sync |
| **[UI](./ui/)** | `anvillib-ui-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.ui` | No | Nine-slice / three-slice flexible widget rendering: light/dark themes, 5-state interaction variants, opacity, pointer arrows, buttons & flyouts |
| **[Util](./util/)** | `anvillib-util-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.util` | No | Collection/math/VoxelShape/inventory utils, `FlattenLoop` multi-dim loop flattening, component info, predicate models & `UnlimitedItemStack` |
| **[Wheel](./wheel/)** | `anvillib-wheel-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.wheel` | No | Client radial wheel menu API: `TAP` / `HOLD` modes, auto-pagination, submenus, frosted disc & 1.21.8 `RenderPipeline` / `GuiElementRenderState` |
