# Explosion Layered Spherical Explosion System (`module.explosion`)

<BranchContextCard branch="1.21.1" />

`module.explosion` (artifact `anvillib-explosion-neoforge-1.21.1`, package `dev.anvilcraft.lib.v2.explosion`) provides a spherical explosion framework supporting **ultra-large radii (100+ blocks), progressive per-tick destruction by spherical distance shells, async next-shell precomputation on a work-stealing thread pool, plus a core complete-destruction zone, surface probabilistic destruction zone, and surface high-temperature melting zone**.

Vanilla `Level#explode` runs ray sampling and block removal synchronously in a single tick, severely lagging the server main thread or even triggering Watchdog crashes when radius exceeds 20–30 blocks. `ExplosionExecutor` creates an `ExplosionSession` self-registered to `NeoForge.EVENT_BUS` that breaks at most `maxBreakPerTick` blocks per `ServerTickEvent.Post` while asynchronously precomputing the next spherical shell's block list using `Executors.newWorkStealingPool()`, delivering dramatic outward-expanding shockwave destruction while keeping the server smooth.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.1`, this module is included automatically. To depend on `explosion` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-explosion-neoforge-1.21.1:2.0.0")
}
```

---

## 2. Three Action Radii & Melting Cache Mechanics

`ExplosionExecutor` divides the region outward from `center` into three concentric spheres by Euclidean distance:

1. **Core Complete Destruction Radius (`radius`, default `100`)**:
   All non-excluded blocks with distance $\le \text{radius}$ (both underground and surface) are 100% destroyed (if a block contains water/fluid, its legacy fluid block `fluidState.createLegacyBlock()` is preserved).
2. **Surface Probabilistic Destruction Radius (`probabilityRadius`, default `128`, clamped $\ge \text{radius}$)**:
   Within $(\text{radius}, \text{probabilityRadius}]$:
   - **Frangible blocks (`frangibleBlocks`)**: 100% destroyed whether underground or on the surface;
   - **Surface blocks (`target.getY() >= WORLD_SURFACE - ceil(radius * 0.1) - 1`)**: destroyed with probability decaying linearly from **80%** at the inner boundary to **0%** at the outer boundary.
3. **Surface High-Temperature Melting Radius (`meltingRadius`, default `160`, clamped $\ge \text{radius}$)**:
   Within $(\text{probabilityRadius}, \text{meltingRadius}]$ (and unbroken surface areas outside the core), surface blocks trigger **block melting (`ExplosionSession.meltBlock`)** with probability decaying linearly from **80%** at `probabilityRadius` to **0%** at `meltingRadius`—replacing the original block per **`AnvilLibExplosion.MELTING_CACHE`**!

### Default Melting Map (`AnvilLibExplosion.MELTING_CACHE`)

`AnvilLibExplosion.MELTING_CACHE` is a public `IdentityHashMap<Block, Block>` pre-populated with 4 default mappings (mods can append custom rules during init via `AnvilLibExplosion.MELTING_CACHE.put(fromBlock, toBlock)`):
- `Blocks.SAND` → `Blocks.GLASS` (sand sinters into glass)
- `Blocks.RED_SAND` → `Blocks.RED_STAINED_GLASS` (red sand sinters into red stained glass)
- `Blocks.SNOW` → `Blocks.WATER` (snow layer melts into water)
- `Blocks.SNOW_BLOCK` → `Blocks.WATER` (snow block melts into water)

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
    static {
        // Register custom melting rules: outer shockwave heat melts cobblestone and stone into magma blocks
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.COBBLESTONE, Blocks.MAGMA_BLOCK);
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.STONE, Blocks.MAGMA_BLOCK);
    }

    private SupernovaExplosionHelper() {
    }

    public static void triggerSupernova(ServerLevel level, BlockPos center, @Nullable Entity sourceEntity) {
        ExplosionExecutor.create()
            // 1. Core 100% destruction radius 48, probability radius 72, melting radius 96
            .radius(48)
            .probabilityRadius(72)
            .meltingRadius(96)
            // 2. Break at most 1024 blocks per tick (capped by global config maxRemoveBlocksPerTick)
            .maxBreakPreTick(1024)
            // 3. Disable item drops for large explosions to prevent tens of thousands of ItemEntities lagging the server
            .dropItems(false)
            // 4. Set explosion source entity
            .executor(sourceEntity)
            // 5. Append protected blocks (obsidian, crying obsidian, and blast-resistant tags are spared)
            .excludedBlocks(Blocks.OBSIDIAN, Blocks.CRYING_OBSIDIAN)
            .excludedBlocks(BlockTags.DRAGON_IMMUNE)
            // 6. Append frangible blocks (flowers and torches are guaranteed shattered within range)
            .frangibleBlocks(BlockTags.FLOWERS, BlockTags.CANDLES)
            // 7. Custom entity damage and ignition logic at affected block positions
            .entityProcessor((serverLevel, blockPos, entity) -> {
                entity.hurt(entity.damageSources().explosion(null, sourceEntity), 35.0F);
                if (entity instanceof LivingEntity) {
                    entity.igniteForSeconds(8.0F);
                }
            })
            // 8. Start the layered explosion session (auto-hooks ServerTickEvent.Post and unregisters on finish)
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
| `public ExplosionExecutor dropItems(boolean dropItems)` | `false` | Whether destroyed blocks call `Block.dropResources` to drop loot. |
| `public ExplosionExecutor probabilityRadius(int probabilityRadius)` | `128` | Sets the outer radius for surface probabilistic destruction (clamped to `Math.max(probabilityRadius, radius)` on execute). |
| `public ExplosionExecutor meltingRadius(int meltingRadius)` | `160` | Sets the outer radius for surface high-temperature melting (clamped to `Math.max(meltingRadius, radius)` on execute). |
| `public ExplosionExecutor excludedBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor excludedBlocks(Block... blocks)`<br>`public ExplosionExecutor excludedBlocks(TagKey<Block>... blocks)` | Defaults to `block -> block.defaultDestroyTime() < 0` (bedrock, end portal frames, etc.) | **Appends** block conditions excluded from destruction or melting (appends rather than overwriting default unbreakable checks). |
| `public ExplosionExecutor frangibleBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor frangibleBlocks(Block... blocks)`<br>`public ExplosionExecutor frangibleBlocks(TagKey<Block>... blocks)` | Defaults to `Tags.Blocks.GLASS_BLOCKS`, `GLASS_PANES`, `BlockTags.LEAVES`, `BlockTags.REPLACEABLE` | **Appends** block conditions that are 100% shattered anywhere within the blast radius. |
| `public ExplosionExecutor executor(@Nullable Entity executor)` | `null` | Sets the entity responsible for the explosion (used for damage source tracking in default `entityProcessor`). |
| `public ExplosionExecutor entityProcessor(@Nullable TriConsumer<ServerLevel, BlockPos, Entity> entityProcessor)` | Deals `radius * 0.5f` explosion damage by default | Sets the callback invoked for entities inside each scanned block cell (pass `null` to disable entity handling). |
| `public void execute(ServerLevel level, BlockPos pos)` | — | Creates and starts `ExplosionSession`. |

### 2. `AnvilLibExplosion` & `AnvilLibExplosionConfig`

| Class / Field | Type & Default | Description |
| :--- | :--- | :--- |
| `AnvilLibExplosion.CONFIG` | `AnvilLibExplosionConfig` | Global server config instance (`anvillib_explosion-server.toml`). |
| `AnvilLibExplosion.MELTING_CACHE` | `Map<Block, Block>` | Global block melting map (`IdentityHashMap`). |
| `CONFIG.maxRemoveBlocksPerTick` | `int` (default `16384`, range `[64, 65536]`) | Hard cap on blocks removed per tick per explosion session. |
| `CONFIG.defaultRemoveBlocksPerTick` | `int` (default `512`, range `[64, 65536]`) | Default blocks removed per tick when `.maxBreakPreTick(...)` is not called. |
