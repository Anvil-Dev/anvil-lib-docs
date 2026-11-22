# Explosion Layered Spherical Explosion System (`module.explosion`)

<BranchContextCard branch="26.2" />

`module.explosion` (artifact `anvillib-explosion-neoforge-26.2`, package `dev.anvilcraft.lib.v2.explosion`) provides a large-scale spherical explosion simulator featuring **multi-tick progressive execution, asynchronous shell precomputation, probabilistic surface destruction, and high-temperature melting effects**.

In vanilla Minecraft, calling `Level#explode` with a large radius (e.g., `R > 30`) runs massive ray-marching and block updates synchronously within a single server tick, easily freezing the server main thread (plummeting TPS) or causing OOM. `ExplosionExecutor` and `ExplosionSession` split the sphere into concentric shells by Euclidean distance (`layer = 0 .. effectiveMaxRadius`), precompute the next shell's block coordinates in parallel on a work-stealing thread pool (`Executors.newWorkStealingPool()`), and strictly cap blocks processed per tick (`maxBreakPreTick`) in `ServerTickEvent.Post`, enabling hundred-block nuclear/meteor craters while maintaining smooth TPS.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.2`, this module is included automatically. To depend on `explosion` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-explosion-neoforge-26.2:2.0.0")
}
```

---

## 2. Three-Zone Explosion Model & Melting Mechanics

An `ExplosionExecutor` explosion is divided outward from the center into three concentric zones:

1. **Core Complete Destruction Zone (`distance <= radius`, default `100`)**:
   All non-excluded blocks inside the sphere (both underground and surface) are 100% destroyed (preserving fluid legacy states and firing `GameEvent.BLOCK_DESTROY`).
2. **Surface Probabilistic Destruction Zone (`radius < distance <= probabilityRadius`, default `128`)**:
   Affects only the **surface layer** (`target.getY() >= WORLD_SURFACE_HEIGHT - (ceil(radius * 0.1) + 1)`). Destruction probability decays linearly from **80%** at `radius` to **0%** at `probabilityRadius`.
3. **Surface High-Temperature Melting Zone (`radius < distance <= meltingRadius`, default `160`)**:
   Affects only unbroken blocks in the **surface layer**. Melting probability decays linearly from **80%** at `probabilityRadius` to **0%** at `meltingRadius`. When triggered, blocks are replaced by their smelting/blasting output according to `AnvilLibExplosion.MELTING_CACHE` (e.g., burnable logs → coal block, stone → smooth stone, sand → glass, grass block/mycelium → podzol, dirt/farmland/dirt path → coarse dirt, mud → dirt).
4. **Frangible Blocks (`frangibleBlocks`) Special Rule**:
   Any block matching the `frangibleBlocks` predicate (defaulting to `#c:glass_blocks`, `#c:glass_panes`, `#minecraft:leaves`, `#minecraft:replaceable`) within the outermost effective radius `max(probabilityRadius, meltingRadius)` is **100% shattered**, whether underground or on the surface.

---

## 3. Full Code Example

The example below shows how to configure and trigger a custom spherical explosion for a nuke block or weapon, and register custom smelting mappings to the global melting table:

```java
package com.example.mymod.explosion;

import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.explosion.AnvilLibExplosion;
import dev.anvilcraft.lib.v2.explosion.ExplosionExecutor;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.Blocks;
import org.jetbrains.annotations.Nullable;

public final class MeteorImpactHandler {
    private MeteorImpactHandler() {
    }

    /**
     * Optional: register custom high-temperature block transformations into global MELTING_CACHE during mod init or events
     */
    public static void registerCustomMeltingRules() {
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.COBBLESTONE, Blocks.MAGMA_BLOCK);
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.OBSIDIAN, Blocks.CRYING_OBSIDIAN);
    }

    /**
     * Trigger a large impact explosion with core radius 45, probability radius 65, and melting radius 85
     */
    public static void triggerMeteorExplosion(
        ServerLevel level,
        BlockPos center,
        @Nullable Entity sourceEntity
    ) {
        ExplosionExecutor.create()
            .radius(45)
            .probabilityRadius(65)
            .meltingRadius(85)
            .maxBreakPreTick(256)          // Process at most 256 blocks per tick (capped by config)
            .dropItems(false)              // Do not drop block items to avoid lag from massive drops
            .executor(sourceEntity)        // Entity responsible for the explosion
            // Append unbreakable blocks, tags, or custom predicates
            .excludedBlocks(Blocks.REINFORCED_DEEPSLATE, ModBlocks.BLAST_PROOF_CASING.get())
            .excludedBlocks(BlockTags.WITHER_IMMUNE)
            .excludedBlocks(block -> block.defaultDestroyTime() > 50.0F)
            // Append frangible blocks (100% shattered across the entire 85-block radius)
            .frangibleBlocks(Blocks.GLOWSTONE, Blocks.SEA_LANTERN)
            .frangibleBlocks(BlockTags.CANDLES)
            // Custom entity damage and knockback logic within core radius
            .entityProcessor((serverLevel, targetPos, entity) -> {
                if (entity instanceof LivingEntity living) {
                    living.hurtServer(
                        serverLevel,
                        living.damageSources().explosion(null, sourceEntity),
                        40.0F
                    );
                    living.igniteForSeconds(8.0F);
                }
            })
            .execute(level, center);
    }
}
```

---

## 4. Public Classes & API Reference

### 1. `ExplosionExecutor` (Fluent Explosion Builder & Executor)

Located in `dev.anvilcraft.lib.v2.explosion.ExplosionExecutor`. Annotated with Lombok `@Setter` and `@Accessors(fluent = true)`, providing fluent setters without `set` prefixes for all configuration fields.

| Method Signature | Default | Parameters & Boundary Conditions |
| :--- | :--- | :--- |
| `public static ExplosionExecutor create()` | — | Creates a new `ExplosionExecutor` instance (private constructor; must instantiate via `create()`). |
| `public ExplosionExecutor radius(int radius)` | `100` | Sets the core 100% destruction radius (in blocks). |
| `public ExplosionExecutor maxBreakPreTick(int maxBreakPreTick)` | `CONFIG.defaultRemoveBlocksPerTick` (`128`) | Sets the maximum number of blocks destroyed/melted per server tick. **Note**: the method name is spelled `maxBreakPreTick` (`Pre`, not `Per`); at `execute` time it is clamped by `Math.min(this.maxBreakPreTick, AnvilLibExplosion.CONFIG.maxRemoveBlocksPerTick)` (default cap `2048`). |
| `public ExplosionExecutor dropItems(boolean dropItems)` | `false` | Whether to call `Block.dropResources` to drop loot when destroying blocks. Strongly recommended to keep `false` for large explosions. |
| `public ExplosionExecutor probabilityRadius(int probabilityRadius)` | `128` | Sets the outer radius for surface probabilistic destruction. Clamped via `Math.max(probabilityRadius, radius)` at `execute` time if `< radius`. |
| `public ExplosionExecutor meltingRadius(int meltingRadius)` | `160` | Sets the outer radius for surface high-temperature melting. Clamped via `Math.max(meltingRadius, radius)` at `execute` time if `< radius`. |
| `public ExplosionExecutor excludedBlocks(List<Predicate<Block>> list)` | `[block -> block.defaultDestroyTime() < 0]` | (Lombok-generated) Replaces the entire exclusion predicate list. Default list includes unbreakable blocks like bedrock with `defaultDestroyTime() < 0`. |
| `public final ExplosionExecutor excludedBlocks(Predicate<Block>... blocks)` | — | **Appends** one or more `Block` predicates to the existing `excludedBlocks` list (preserving default unbreakable rules). |
| `public final ExplosionExecutor excludedBlocks(Block... blocks)` | — | **Appends** one or more specific `Block` instances to the existing `excludedBlocks` list. |
| `public final ExplosionExecutor excludedBlocks(TagKey<Block>... blocks)` | — | **Appends** one or more `TagKey<Block>` block tags to the existing `excludedBlocks` list. |
| `public ExplosionExecutor frangibleBlocks(List<Predicate<Block>> list)` | `[GLASS_BLOCKS, GLASS_PANES, LEAVES, REPLACEABLE]` | (Lombok-generated) Replaces the entire frangible block predicate list. |
| `public final ExplosionExecutor frangibleBlocks(Predicate<Block>... blocks)` | — | **Appends** one or more `Block` predicates to the existing `frangibleBlocks` list. |
| `public final ExplosionExecutor frangibleBlocks(Block... blocks)` | — | **Appends** one or more specific `Block` instances to the existing `frangibleBlocks` list. |
| `public final ExplosionExecutor frangibleBlocks(TagKey<Block>... blocks)` | — | **Appends** one or more `TagKey<Block>` block tags to the existing `frangibleBlocks` list. |
| `public ExplosionExecutor executor(@Nullable Entity executor)` | `null` | Sets the source entity causing the explosion (used by the default `entityProcessor` to construct `damageSources().explosion(null, executor)`). |
| `public ExplosionExecutor entityProcessor(@Nullable TriConsumer<ServerLevel, BlockPos, Entity> entityProcessor)` | Deals `radius * 0.5f` explosion damage by default | Sets the callback (`org.apache.logging.log4j.util.TriConsumer<ServerLevel, BlockPos, Entity>`) invoked for entities at each processed `BlockPos`. Set to `null` to skip entity collection and damage. |
| `public void execute(ServerLevel level, BlockPos pos)` | — | Creates an `ExplosionSession` and immediately registers it on `NeoForge.EVENT_BUS`, executing the explosion outward layer by layer starting on the next `ServerTickEvent.Post`. |

### 2. `AnvilLibExplosion` & `AnvilLibExplosionConfig`

| Class / Field / Method Signature | Description |
| :--- | :--- |
| `AnvilLibExplosion.MAIN_ID` | `"anvillib"` |
| `AnvilLibExplosion.MOD_ID` | `"anvillib_explosion"` |
| `AnvilLibExplosion.CONFIG` | `AnvilLibExplosionConfig` singleton generated at `config/anvillib/anvillib_explosion-common.toml`, containing:<br>• `public int maxRemoveBlocksPerTick = 2048`: hard cap on blocks removed per tick per session;<br>• `public int defaultRemoveBlocksPerTick = 128`: default blocks removed per tick for `ExplosionExecutor`. |
| `AnvilLibExplosion.MELTING_CACHE` | `public static final Map<Block, Block> MELTING_CACHE = new ConcurrentHashMap<>()`.<br>Automatically rebuilt on `ServerStartedEvent` and server datapack reload (`OnDatapackSyncEvent` with `event.getPlayer() == null`):<br>1. Built-in mappings: `#minecraft:logs_that_burn` → `COAL_BLOCK`, `GRASS_BLOCK` / `MYCELIUM` → `PODZOL`, `DIRT_PATH` / `DIRT` / `ROOTED_DIRT` / `FARMLAND` → `COARSE_DIRT`, `MUD` → `DIRT`;<br>2. Automatically scans all `SmeltingRecipe` and `BlastingRecipe` entries in the recipe manager with output count `1` where both input and output are `BlockItem`, mapping input blocks to output blocks. |
| `public static Identifier of(String path)` | Returns `Identifier.fromNamespaceAndPath("anvillib", path)`. |

### 3. `ExplosionSession` (Internal Session Runner, `@ApiStatus.Internal`)

`ExplosionSession` is package-private, but understanding its internals helps when tuning `ExplosionExecutor`:

- **Concentric shell layering & parallel slice precomputation**: `layer` corresponds to integer offsets satisfying `(layer - 1)^2 < x^2 + y^2 + z^2 <= layer^2`, shuffled via `Collections.shuffle` so per-tick destruction edges look natural. Background precomputation activates when `nextLayer >= 32`, and parallel X-axis slicing across CPU cores activates when `layer >= 96`.
- **Single-block static utilities**: includes `ExplosionSession.meltBlock(ServerLevel, BlockPos)` and `ExplosionSession.destroyBlock(ServerLevel, BlockPos, boolean)`, both checking `level.isLoaded(pos)` and `!blockState.isAir()` to avoid synchronous chunk loading.
