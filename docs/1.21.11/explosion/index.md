# Explosion 分层球形爆炸系统 (`module.explosion`)

<BranchContextCard branch="1.21.11" />

`module.explosion`（构件名 `anvillib-explosion-neoforge-1.21.11`，包名 `dev.anvilcraft.lib.v2.explosion`）提供了一套**支持超大半径（百格级）、按球面距离层分摊到每 Tick 渐进破坏、后台工作窃取线程池预计算下一层坐标、且同时支持核心完全破坏区 + 地表概率破坏区 + 地表高温融化区**的球形爆炸执行框架。

原版 `Level#explode` 在同一 Tick 内同步执行射线采样与方块移除，当爆炸半径超过 20~30 格时就会导致服务端主线程严重卡顿。`ExplosionExecutor` 通过创建自注册到 `NeoForge.EVENT_BUS` 的 `ExplosionSession`，在每个 `ServerTickEvent.Post` 中最多只破坏 `maxBreakPerTick` 个方块，并用 `Executors.newWorkStealingPool()` 异步预计算下一球壳层（Layer）的方块列表，实现平滑渐进的冲击波破坏。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.11`，则已自动包含本模块；若仅需单独引入 `explosion` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-explosion-neoforge-1.21.11:2.0.0")
}
```

---

## 二、 三重作用半径与融化缓存机制

`ExplosionExecutor` 从爆炸中心 `center` 由内向外按欧几里得距离划分为三个同心球区域：

1. **核心完全破坏半径（`radius`，默认 `100`）**：
   距离 $\le \text{radius}$ 的所有非排除方块（含地下与地表）100% 被破坏（若方块含流体则保留流体对应方块 `fluidState.createLegacyBlock()`）。
2. **地表概率破坏半径（`probabilityRadius`，默认 `128`，实际生效值 $\ge \text{radius}$）**：
   在 $(\text{radius}, \text{probabilityRadius}]$ 区间内：
   - **脆弱方块（`frangibleBlocks`）**：无论处于地下还是地表，100% 被破坏；
   - **地表方块（`target.getY() >= WORLD_SURFACE - ceil(radius * 0.1) - 1`）**：按距离从内边界的 **80% 概率**线性衰减至外边界的 **0% 概率**随机破坏。
3. **地表高温融化半径（`meltingRadius`，默认 `160`，实际生效值 $\ge \text{radius}$）**：
   在 $(\text{probabilityRadius}, \text{meltingRadius}]$ 区间及外围地表范围内，方块按距离衰减概率触发**方块融化**——根据全局线程安全映射表 **`AnvilLibExplosion.MELTING_CACHE`** 将原方块替换为目标方块。

### 自动扫描与自定义融化映射 (`AnvilLibExplosion.MELTING_CACHE`)

`AnvilLibExplosion.MELTING_CACHE` 是一个 `Map<Block, Block>`（底层为 `ConcurrentHashMap<>`）。每当 `ServerStartedEvent` 或无特定玩家过滤的 `OnDatapackSyncEvent` 触发时，框架会自动清空并重新填充：
- `BlockTags.LOGS_THAT_BURN` -> `Blocks.COAL_BLOCK`
- `Blocks.GRASS_BLOCK` / `Blocks.MYCELIUM` -> `Blocks.PODZOL`
- `Blocks.DIRT_PATH` / `Blocks.DIRT` / `Blocks.ROOTED_DIRT` / `Blocks.FARMLAND` -> `Blocks.COARSE_DIRT`
- `Blocks.MUD` -> `Blocks.DIRT`
- 服务端全部 `SmeltingRecipe` 与 `BlastingRecipe`：遍历单物品方块原料并通过 Mixin 访问器 `SingleItemRecipeAccessor#getResult()` 读取配方产物，将单产出方块（`result.getCount() == 1 && result.getItem() instanceof BlockItem`）自动加入融化表！

> **注意**：由于 `MELTING_CACHE` 会在每次数据包重载/服务端启动时清空重建，若需添加不依赖熔炉配方的自定义融化条目，应在 `ServerStartedEvent` / `OnDatapackSyncEvent` 之后追加写入，或直接通过数据包提供对应的熔炼/高炉配方。

---

## 三、 完整代码示例：触发自定义核爆级分层冲击波

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
import org.jspecify.annotations.Nullable;

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
                entity.hurtServer(serverLevel, entity.damageSources().explosion(null, sourceEntity), 35.0F);
                if (entity instanceof LivingEntity) {
                    entity.igniteForSeconds(8.0F);
                }
            })
            .execute(level, center);
    }
}
```

---

## 四、 公开类与配置 API 详解

### 1. `ExplosionExecutor`（链式构建器）

位于 `dev.anvilcraft.lib.v2.explosion.ExplosionExecutor`。

| 方法签名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `public static ExplosionExecutor create()` | — | 创建新的爆炸执行器配置实例。 |
| `public ExplosionExecutor radius(int radius)` | `100` | 设置核心 100% 破坏半径（格）。 |
| `public ExplosionExecutor maxBreakPreTick(int maxBreakPreTick)` | `CONFIG.defaultRemoveBlocksPerTick` (`128`) | 设置每服务端 Tick 最多移除/融化的方块数（实际生效值为 `Math.min(maxBreakPreTick, CONFIG.maxRemoveBlocksPerTick)`）。 |
| `public ExplosionExecutor dropItems(boolean dropItems)` | `false` | 方块被破坏时是否产生掉落物。 |
| `public ExplosionExecutor probabilityRadius(int probabilityRadius)` | `128` | 设置地表概率破坏外半径（执行时自动取 `Math.max(probabilityRadius, radius)`）。 |
| `public ExplosionExecutor meltingRadius(int meltingRadius)` | `160` | 设置地表高温融化外半径（执行时自动取 `Math.max(meltingRadius, radius)`）。 |
| `public ExplosionExecutor excludedBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor excludedBlocks(Block... blocks)`<br>`public ExplosionExecutor excludedBlocks(TagKey<Block>... blocks)` | 默认已包含 `block -> block.defaultDestroyTime() < 0`（不可破坏方块） | 向排除列表**追加**不允许被破坏或融化的方块条件。 |
| `public ExplosionExecutor frangibleBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor frangibleBlocks(Block... blocks)`<br>`public ExplosionExecutor frangibleBlocks(TagKey<Block>... blocks)` | 默认已包含 `GLASS_BLOCKS`、`GLASS_PANES`、`LEAVES`、`REPLACEABLE` | 向脆弱方块列表**追加**在波及范围内 100% 被震碎的方块条件。 |
| `public ExplosionExecutor executor(@Nullable Entity executor)` | `null` | 设置爆炸归属实体。 |
| `public ExplosionExecutor entityProcessor(@Nullable TriConsumer<ServerLevel, BlockPos, Entity> entityProcessor)` | 默认调用 `entity.hurtServer(level, entity.damageSources().explosion(null, executor), radius * 0.5f)` | 设置爆炸坐标扫描到实体时的处理回调（传入 `null` 可禁用实体处理）。 |
| `public void execute(ServerLevel level, BlockPos pos)` | — | 创建并启动 `@ApiStatus.Internal` `ExplosionSession`。 |

### 2. `AnvilLibExplosion` 与 `AnvilLibExplosionConfig`

| 类 / 成员名 | 类型与默认值 | 说明 |
| :--- | :--- | :--- |
| `AnvilLibExplosion.MAIN_ID` | `"anvillib"` | 主命名空间常量 |
| `AnvilLibExplosion.MOD_ID` | `"anvillib_explosion"` | 模块 Mod ID |
| `AnvilLibExplosion.of(String path)` | `Identifier` | 构造 `anvillib:<path>` 资源定位符 |
| `AnvilLibExplosion.CONFIG` | `AnvilLibExplosionConfig` | 全局通用配置实例（`@Config(name = MOD_ID, group = "anvillib")`） |
| `AnvilLibExplosion.MELTING_CACHE` | `Map<Block, Block>`（`ConcurrentHashMap`） | 全局融化方块映射表 |
| `CONFIG.maxRemoveBlocksPerTick` | `int`（默认 `2048`） | 单个爆炸会话每 Tick 允许移除方块数的全局上限 |
| `CONFIG.defaultRemoveBlocksPerTick` | `int`（默认 `128`） | 未显式调用 `.maxBreakPreTick(...)` 时的默认每 Tick 移除方块数 |
