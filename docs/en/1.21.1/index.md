# AnvilLib `dev/1.21.1` Branch Overview

<BranchContextCard branch="1.21.1" />

This document corresponds to `AnvilLib`'s `dev/1.21.1` branch, targeting **Minecraft 1.21.1**, **NeoForge 21.1.x**, and **Java 21**. All code examples, class paths (e.g., `net.minecraft.resources.ResourceLocation`, `GuiGraphics`, `BakedModel`, `ItemStack`, etc. in 1.21.1), and Maven coordinates in this branch strictly align with the `dev/1.21.1` source code.

---

## Environment & Build Baseline

| Setting | `dev/1.21.1` Requirement |
| :--- | :--- |
| **JDK Version** | Java 21 (`java_version=21`) |
| **Minecraft Version Range** | `[1.21.1, 1.21.2)` (dev environment based on `1.21.1`, Parchment `2024.11.17`) |
| **NeoForge Version Range** | `[21,)` (dev environment based on `21.1.x`) |
| **Loader Version Range** | `[4,)` |
| **Maven GroupId** | `dev.anvilcraft.lib` |
| **Aggregate ArtifactId** | `anvillib-neoforge-1.21.1` |
| **Current Project Version (`mod_version`)** | `2.0.0` |

---

## Module Matrix (`dev/1.21.1`)

`AnvilLib` provides **1 aggregate distribution module (`main`)** and **20 independent feature submodules** on `dev/1.21.1` (plus 1 internal test module `test`):

| Module Name | ArtifactId (`dev.anvilcraft.lib`) | Root Package | Interface Injection | Core Responsibilities & Use Cases |
| :--- | :--- | :--- | :---: | :--- |
| **[Main (Aggregate)](./getting-started)** | `anvillib-neoforge-1.21.1` | `dev.anvilcraft.lib.v2` | Pass-through | Packages and re-exports all 20 runtime feature submodules |
| **[Codec](./codec/)** | `anvillib-codec-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.codec` | No | `Codec` / `MapCodec` / `StreamCodec` presets, 1–16 parameter builder proxies & vanilla `critereon` predicate stream codecs |
| **[Collision](./collision/)** | `anvillib-collision-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.collision` | No | 13-axis SAT AABB-vs-triangle-mesh static collision, 3-axis independent sweep, and true swept collision |
| **[Config](./config/)** | `anvillib-config-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.config` | No | Annotation-driven config declaration, range/slider constraints, nested collapsible objects, translucent sidebar GUI & lang datagen |
| **[Cube](./cube/)** | `anvillib-cube-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.cube` | No | Sloped model edge outline highlighting, BVH precise ray picking, dynamic part providers & runtime blacklist exclusion |
| **[Explosion](./explosion/)** | `anvillib-explosion-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.explosion` | No | Multi-tick batched explosion sessions (`ExplosionSession`) & custom explosion executor (`ExplosionExecutor`) |
| **[Font](./font/)** | `anvillib-font-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.font` | **Yes** | Client TrueType font management, multi/single-channel SDF glyph atlases & `GuiGraphics` extensions |
| **[Integration](./integration/)** | `anvillib-integration-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.integration` | No | `@Integration`-based conditional loading by external mod presence, version range & physical side |
| **[Math](./math/)** | `anvillib-math-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.math` | No | Serializable math expression trees, bidirectional Flat text parsing & validation, vararg custom functions & dual registries |
| **[Moveable Entity Block](./moveable-entity-block/)** | `anvillib-moveable-entity-block-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.piston` | **Yes** | Allows blocks with `BlockEntity` to be pushed by pistons while preserving NBT state & moving render data |
| **[Multiblock](./multiblock/)** | `anvillib-multiblock-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.multiblock` | No | Data-driven dynamic multiblock structure definitions, controller registration, formation/disassembly state & network sync |
| **[Network](./network/)** | `anvillib-network-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.network` | No | Direction-typed packet interfaces for `PLAY` / `CONFIGURATION` / `COMMON` phases & `@Network` auto-registration |
| **[Recipe](./recipe/)** | `anvillib-recipe-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.recipe` | **Yes** | In-world recipe system: Triggers, block/item/entity Predicates, Outcomes & capacity-constrained `ItemBatchPlan` |
| **[Registrum](./registrum/)** | `anvillib-registrum-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.registrum` | No | Fluent registration & Datagen framework covering blocks, items, creative tab variant selectors, entities, fluids, components & attachments |
| **[Rendering](./rendering/)** | `anvillib-rendering-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.rendering` | No | Holographic structure projection system (`ProjectionScene`, `ProjectionRenderer`, `ProjectionFeatures`, `ProjectionOverlay`) |
| **[RPC](./rpc/)** | `anvillib-rpc-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.rpc` | No | `@RemoteCallable` & method-reference cross-side RPC, async return callbacks & argument validation |
| **[Space Select](./space-select/)** | `anvillib-space-select-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.space_select` | No | 3D region (`District`) management, selector items, client scroll resizing & wireframe rendering |
| **[Sync](./sync/)** | `anvillib-sync-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.sync` | No | `@Sync` / `@LazySync` annotation & compile-time bytecode injection (`anvillib-sync-processor-neoforge-1.21.1`) auto-sync |
| **[UI](./ui/)** | `anvillib-ui-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.ui` | No | Nine-slice / three-slice flexible widget rendering: light/dark themes, 5-state interaction variants, opacity, pointer arrows, buttons & flyouts |
| **[Util](./util/)** | `anvillib-util-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.util` | No | Collection/math/VoxelShape/inventory utils, `FlattenLoop` multi-dim loop flattening, component info, predicate models & `UnlimitedItemStack` |
| **[Wheel](./wheel/)** | `anvillib-wheel-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.wheel` | No | Client radial wheel menu API: `TAP` / `HOLD` modes, auto-pagination, submenus & frosted-glass disc rendering |
