# Explosion Layered Spherical Explosion System (`module.explosion`)

<BranchContextCard branch="1.21.4" />

`module.explosion` (artifact `anvillib-explosion-neoforge-1.21.4`, package `dev.anvilcraft.lib.v2.explosion`) provides a spherical explosion framework supporting **ultra-large radii (100+ blocks), progressive per-tick destruction by spherical distance shells, async next-shell precomputation on a work-stealing thread pool, plus a core complete-destruction zone, surface probabilistic destruction zone, and surface high-temperature melting zone**.

Vanilla `Level#explode` runs ray sampling and block removal synchronously in a single tick, severely lagging the server main thread when radius exceeds 20–30 blocks. `ExplosionExecutor` creates an `ExplosionSession` self-registered to `NeoForge.EVENT_BUS` that breaks at most `maxBreakPerTick` blocks per `ServerTickEvent.Post` while asynchronously precomputing the next spherical shell's block list using `Executors.newWorkStealingPool()`, achieving smooth progressive shockwave destruction.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.4`, this module is included automatically. To depend on `explosion` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-explosion-neoforge-1.21.4:2.0.0")
}
```

---

## 2. Three Action Radii & Melting Cache Mechanics

`ExplosionExecutor` divides the region outward from `center` into three concentric spheres by Euclidean distance:

1. **Core Complete Destruction Radius (`radius`, default `100`)**:
   All non-excluded blocks with distance $\le \text{radius}$ (both underground and surface) are 100% destroyed (if a block contains fluid, its legacy fluid block `fluidState.createLegacyBlock()` is preserved).
2. **Surface Probabilistic Destruction Radius (`probabilityRadius`, default `128`, clamped $\ge \text{radius}$)**:
   Within $(\text{radius}, \text{probabilityRadius}]$:
   - **Frangible blocks (`frangibleBlocks`)**: 100% destroyed whether underground or on the surface;
   - **Surface blocks (`target.getY() >= WORLD_SURFACE - ceil(radius * 0.1) - 1`)**: destroyed with probability decaying linearly from **80%** at the inner boundary to **0%** at the outer boundary.
3. **Surface High-Temperature Melting Radius (`meltingRadius`, default `160`, clamped $\ge \text{radius}$)**:
   Within $(\text{probabilityRadius}, \text{meltingRadius}]$ and the outer surface region, blocks trigger **block melting** with distance-decaying probability—replacing the original block according to the global thread-safe **`AnvilLibExplosion.MELTING_CACHE`**.

### Auto-Scanning & Custom Melting Mappings (`AnvilLibExplosion.MELTING_CACHE`)

`AnvilLibExplosion.MELTING_CACHE` is a `Map<Block, Block>` (backed by `ConcurrentHashMap<>`). Whenever `ServerStartedEvent` or an unfiltered `OnDatapackSyncEvent` fires, the framework clears and repopulates it:
- `BlockTags.LOGS_THAT_BURN` -> `Blocks.COAL_BLOCK`
- `Blocks.GRASS_BLOCK` / `Blocks.MYCELIUM` -> `Blocks.PODZOL`
- `Blocks.DIRT_PATH` / `Blocks.DIRT` / `Blocks.ROOTED_DIRT` / `Blocks.FARMLAND` -> `Blocks.COARSE_DIRT`
- `Blocks.MUD` -> `Blocks.DIRT`
- All server `SmeltingRecipe` and `BlastingRecipe` entries: iterates single-item block ingredients, calls `recipe.assemble(new SingleRecipeInput(...), registries)`, and automatically adds single-output blocks (`result.getCount() == 1 && result.getItem() instanceof BlockItem`) to the melting table!

> **Note**: Because `MELTING_CACHE` is cleared and rebuilt on every datapack reload/server start, custom melting entries that do not rely on furnace recipes should be appended after `ServerStartedEvent` / `OnDatapackSyncEvent`, or provided as smelting/blasting recipes in a datapack.

---

## 3. Full Code Example: Triggering a Custom Nuclear-Scale Layered Shockwave

```java
package com.example.mymod.explosion;

import dev.anvilcraft.lib.v2.explosion.AnvilLibExplosion;
import dev.anvilcraft.lib.v2.explosion.ExplosionExecutor;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.Blocks;
import org.jetbrains.annotations.Nullable;

public final class SupernovaExplosionHelper {
    private SupernovaExplosionHelper() {
    }

    public static void registerExtraMeltingRules() {
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.COBBLESTONE, Blocks.MAGMA_BLOCK);
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.STONE, Blocks.MAGMA_BLOCK);
    }

    public static void triggerSupernova(ServerLevel level, BlockPos center, @Nullable Entity sourceEntity) {
        ExplosionExecutor.create()
            .radius(48)
            .probabilityRadius(72)
            .meltingRadius(96)
            .maxBreakPreTick(1024)
            .dropItems(false)
            .executor(sourceEntity)
            .excludedBlocks(Blocks.OBSIDIAN, Blocks.CRYING_OBSIDIAN)
            .excludedBlocks(BlockTags.DRAGON_IMMUNE)
            .frangibleBlocks(BlockTags.FLOWERS, BlockTags.CANDLES)
            .entityProcessor((serverLevel, blockPos, entity) -> {
                entity.hurt(entity.damageSources().explosion(null, sourceEntity), 35.0F);
                if (entity instanceof LivingEntity) {
                    entity.igniteForSeconds(8.0F);
                }
            })
            .execute(level, center);
    }
}
```

---

## 4. Public Classes & Config API Reference

### 1. `ExplosionExecutor` (Fluent Builder)

Located in `dev.anvilcraft.lib.v2.explosion.ExplosionExecutor`.

| Method Signature | Default | Description |
| :--- | :--- | :--- |
| `public static ExplosionExecutor create()` | — | Creates a new explosion executor config instance. |
| `public ExplosionExecutor radius(int radius)` | `100` | Sets the core 100% destruction radius (in blocks). |
| `public ExplosionExecutor maxBreakPreTick(int maxBreakPreTick)` | `CONFIG.defaultRemoveBlocksPerTick` (`512`) | Sets max blocks removed/melted per server tick (effective value is `Math.min(maxBreakPreTick, CONFIG.maxRemoveBlocksPerTick)`). |
| `public ExplosionExecutor dropItems(boolean dropItems)` | `false` | Whether destroyed blocks drop items. |
| `public ExplosionExecutor probabilityRadius(int probabilityRadius)` | `128` | Sets the outer radius for surface probabilistic destruction (clamped to `Math.max(probabilityRadius, radius)` on execute). |
| `public ExplosionExecutor meltingRadius(int meltingRadius)` | `160` | Sets the outer radius for surface high-temperature melting (clamped to `Math.max(meltingRadius, radius)` on execute). |
| `public ExplosionExecutor excludedBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor excludedBlocks(Block... blocks)`<br>`public ExplosionExecutor excludedBlocks(TagKey<Block>... blocks)` | Defaults to `block -> block.defaultDestroyTime() < 0` (unbreakable blocks) | **Appends** block conditions excluded from destruction or melting. |
| `public ExplosionExecutor frangibleBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor frangibleBlocks(Block... blocks)`<br>`public ExplosionExecutor frangibleBlocks(TagKey<Block>... blocks)` | Defaults to `GLASS_BLOCKS`, `GLASS_PANES`, `LEAVES`, `REPLACEABLE` | **Appends** block conditions that are 100% shattered anywhere within the blast radius. |
| `public ExplosionExecutor executor(@Nullable Entity executor)` | `null` | Sets the entity responsible for the explosion. |
| `public ExplosionExecutor entityProcessor(@Nullable TriConsumer<ServerLevel, BlockPos, Entity> entityProcessor)` | Deals `radius * 0.5f` explosion damage by default | Sets the callback invoked for entities at scanned explosion positions (pass `null` to disable entity handling). |
| `public void execute(ServerLevel level, BlockPos pos)` | — | Creates and starts `ExplosionSession`. |

### 2. `AnvilLibExplosion` & `AnvilLibExplosionConfig`

| Class / Member | Type & Default | Description |
| :--- | :--- | :--- |
| `AnvilLibExplosion.MAIN_ID` | `"anvillib"` | Main namespace constant |
| `AnvilLibExplosion.MOD_ID` | `"anvillib_explosion"` | Module Mod ID |
| `AnvilLibExplosion.of(String path)` | `ResourceLocation` | Constructs `anvillib:<path>` resource location |
| `AnvilLibExplosion.CONFIG` | `AnvilLibExplosionConfig` | Global server config instance (`anvillib_explosion-server.toml`) |
| `AnvilLibExplosion.MELTING_CACHE` | `Map<Block, Block>` (`ConcurrentHashMap`) | Global block melting map |
| `CONFIG.maxRemoveBlocksPerTick` | `int` (default `16384`, range `[64, 65536]`) | Hard cap on blocks removed per tick per explosion session |
| `CONFIG.defaultRemoveBlocksPerTick` | `int` (default `512`, range `[64, 65536]`) | Default blocks removed per tick when `.maxBreakPreTick(...)` is not called |
