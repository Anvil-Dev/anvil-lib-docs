# Explosion 分层球形爆炸系统 (`module.explosion`)

<BranchContextCard branch="26.1" />

`module.explosion`（构件名 `anvillib-explosion-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.explosion`）提供一套**跨 Tick 渐进执行、异步预计算外壳层、带地表概率破坏与高温融化效果**的大规模球形爆炸模拟器。

在 Minecraft 原版中，调用 `Level#explode` 计算大半径爆炸（如半径 `R > 30`）会在单个服务端 Tick 内同步执行大量射线步进与方块更新，极易造成服务器主线程严重卡死（TPS 骤降）甚至内存溢出。`ExplosionExecutor` 与 `ExplosionSession` 通过将球形爆炸按欧几里得距离切分为一层层同心球壳（`layer = 0 .. effectiveMaxRadius`），利用工作窃取线程池（`Executors.newWorkStealingPool()`）在后台提前并行计算下一层球壳的方块坐标，并在 `ServerTickEvent.Post` 中严格限制每 Tick 最多处理的方块数（`maxBreakPreTick`），从而在保持流畅 TPS 的前提下实现半径上百格的核爆/陨石级冲击坑效果。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `explosion` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-explosion-neoforge-26.1:2.0.0")
}
```

---

## 二、 爆炸三层区域模型与融化机制

一次 `ExplosionExecutor` 爆炸从中心向外依次划分为三个同心作用区：

1. **核心完全破坏区（`distance <= radius`，默认 `100`）**：
   球体内部所有非排除方块（含地下与地表）均被 100% 破坏（保留流体 legacy 状态并触发 `GameEvent.BLOCK_DESTROY`）。
2. **地表概率破坏区（`radius < distance <= probabilityRadius`，默认 `128`）**：
   仅作用于**地表层**（`target.getY() >= WORLD_SURFACE_HEIGHT - (ceil(radius * 0.1) + 1)`）。破坏概率从内边界 `radius` 处的 **80%** 随距离线性衰减至外边界 `probabilityRadius` 处的 **0%**。
3. **地表高温融化区（`radius < distance <= meltingRadius`，默认 `160`）**：
   仅作用于**地表层**尚未被破坏的方块。融化概率从 `probabilityRadius` 处的 **80%** 线性衰减至 `meltingRadius` 处的 **0%**。触发融化时，方块会根据 `AnvilLibExplosion.MELTING_CACHE` 替换为烧炼/高炉产物方块（例如：可燃原木 → 煤炭块、石头 → 平滑石头、沙子 → 玻璃、草方块/菌丝 → 灰化土、泥土/耕地/土径 → 砂土、泥巴 → 泥土）。
4. **易碎方块（`frangibleBlocks`）特例**：
   凡是命中 `frangibleBlocks` 谓词的方块（默认包含 `#c:glass_blocks`、`#c:glass_panes`、`#minecraft:leaves`、`#minecraft:replaceable`），只要位于最外层有效半径 `max(probabilityRadius, meltingRadius)` 以内，无论处于地表还是地下，均会 **100% 被直接震碎破坏**。

---

## 三、 完整代码示例

下面演示如何在自定义核弹方块或武器引爆时配置并启动一次自定义球形爆炸，并向全局融化表注册自定义烧炼映射：

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
     * 可选：在模组初始化或事件中向全局 MELTING_CACHE 追加自定义方块高温转化规则
     */
    public static void registerCustomMeltingRules() {
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.COBBLESTONE, Blocks.MAGMA_BLOCK);
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.OBSIDIAN, Blocks.CRYING_OBSIDIAN);
    }

    /**
     * 触发一次核心半径 45、概率破坏半径 65、高温融化半径 85 的大型冲击爆炸
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
            .maxBreakPreTick(256)          // 每 Tick 最多处理 256 个方块（受配置文件上限约束）
            .dropItems(false)              // 不掉落方块物品，防止大爆炸掉落物卡服
            .executor(sourceEntity)        // 爆炸归属实体
            // 追加不可破坏的方块、标签或自定义谓词
            .excludedBlocks(Blocks.REINFORCED_DEEPSLATE, ModBlocks.BLAST_PROOF_CASING.get())
            .excludedBlocks(BlockTags.WITHER_IMMUNE)
            .excludedBlocks(block -> block.defaultDestroyTime() > 50.0F)
            // 追加易碎方块（在整个 85 格半径内 100% 震碎）
            .frangibleBlocks(Blocks.GLOWSTONE, Blocks.SEA_LANTERN)
            .frangibleBlocks(BlockTags.CANDLES)
            // 自定义核心半径内的实体伤害与击退逻辑
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

## 四、 公开类与 API 详解

### 1. `ExplosionExecutor`（链式爆炸构建与执行器）

位于 `dev.anvilcraft.lib.v2.explosion.ExplosionExecutor`。类上标注了 Lombok `@Setter` 与 `@Accessors(fluent = true)`，所有配置字段均提供无 `set` 前缀的链式 Setter。

| 方法签名 | 默认值 | 参数说明与边界条件 |
| :--- | :--- | :--- |
| `public static ExplosionExecutor create()` | — | 创建新的 `ExplosionExecutor` 实例（私有构造器，必须通过 `create()` 实例化）。 |
| `public ExplosionExecutor radius(int radius)` | `100` | 设置核心 100% 破坏半径（单位：方块）。 |
| `public ExplosionExecutor maxBreakPreTick(int maxBreakPreTick)` | `CONFIG.defaultRemoveBlocksPerTick` (`128`) | 设置每个服务端 Tick 最多破坏/融化的方块数量。**注意**：方法名拼写为 `maxBreakPreTick`（`Pre` 而非 `Per`）；在 `execute` 时会被 `Math.min(this.maxBreakPreTick, AnvilLibExplosion.CONFIG.maxRemoveBlocksPerTick)` 钳制在全局配置上限（默认 `2048`）以内。 |
| `public ExplosionExecutor dropItems(boolean dropItems)` | `false` | 破坏方块时是否调用 `Block.dropResources` 掉落战利品。大半径爆炸强烈建议保持 `false`。 |
| `public ExplosionExecutor probabilityRadius(int probabilityRadius)` | `128` | 设置地表概率破坏外半径。若传入值 `< radius`，`execute` 时会自动取 `Math.max(probabilityRadius, radius)`。 |
| `public ExplosionExecutor meltingRadius(int meltingRadius)` | `160` | 设置地表高温融化外半径。若传入值 `< radius`，`execute` 时会自动取 `Math.max(meltingRadius, radius)`。 |
| `public ExplosionExecutor excludedBlocks(List<Predicate<Block>> list)` | `[block -> block.defaultDestroyTime() < 0]` | （Lombok 生成）直接替换整个排除谓词列表。默认列表包含基岩等 `defaultDestroyTime() < 0` 的不可破坏方块。 |
| `public final ExplosionExecutor excludedBlocks(Predicate<Block>... blocks)` | — | 向现有 `excludedBlocks` 列表**追加**一个或多个 `Block` 谓词（保留默认的不可破坏方块规则）。 |
| `public final ExplosionExecutor excludedBlocks(Block... blocks)` | — | 向现有 `excludedBlocks` 列表**追加**一个或多个具体 `Block` 实例。 |
| `public final ExplosionExecutor excludedBlocks(TagKey<Block>... blocks)` | — | 向现有 `excludedBlocks` 列表**追加**一个或多个方块标签 `TagKey<Block>`。 |
| `public ExplosionExecutor frangibleBlocks(List<Predicate<Block>> list)` | `[GLASS_BLOCKS, GLASS_PANES, LEAVES, REPLACEABLE]` | （Lombok 生成）直接替换整个易碎方块谓词列表。 |
| `public final ExplosionExecutor frangibleBlocks(Predicate<Block>... blocks)` | — | 向现有 `frangibleBlocks` 列表**追加**一个或多个 `Block` 谓词。 |
| `public final ExplosionExecutor frangibleBlocks(Block... blocks)` | — | 向现有 `frangibleBlocks` 列表**追加**一个或多个具体 `Block` 实例。 |
| `public final ExplosionExecutor frangibleBlocks(TagKey<Block>... blocks)` | — | 向现有 `frangibleBlocks` 列表**追加**一个或多个方块标签 `TagKey<Block>`。 |
| `public ExplosionExecutor executor(@Nullable Entity executor)` | `null` | 设置引发爆炸的源头实体（供默认 `entityProcessor` 构造 `damageSources().explosion(null, executor)` 使用）。 |
| `public ExplosionExecutor entityProcessor(@Nullable TriConsumer<ServerLevel, BlockPos, Entity> entityProcessor)` | 默认造成 `radius * 0.5f` 爆炸伤害 | 设置当处理到某个 `BlockPos` 时对该位置上实体的处理回调（类型 `org.apache.logging.log4j.util.TriConsumer<ServerLevel, BlockPos, Entity>`）。若设为 `null` 则跳过实体收集与伤害处理。 |
| `public void execute(ServerLevel level, BlockPos pos)` | — | 创建 `ExplosionSession` 并立即将其注册到 `NeoForge.EVENT_BUS`，从下一个 `ServerTickEvent.Post` 开始由内向外逐层执行爆炸。 |

### 2. `AnvilLibExplosion` 与 `AnvilLibExplosionConfig`

| 类 / 字段 / 方法签名 | 说明 |
| :--- | :--- |
| `AnvilLibExplosion.MAIN_ID` | `"anvillib"` |
| `AnvilLibExplosion.MOD_ID` | `"anvillib_explosion"` |
| `AnvilLibExplosion.CONFIG` | `AnvilLibExplosionConfig` 配置单例，生成于 `config/anvillib/anvillib_explosion-common.toml`，包含：<br>• `public int maxRemoveBlocksPerTick = 2048`：单次会话每 Tick 允许删除方块数的硬上限；<br>• `public int defaultRemoveBlocksPerTick = 128`：`ExplosionExecutor` 的默认每 Tick 删除方块数。 |
| `AnvilLibExplosion.MELTING_CACHE` | `public static final Map<Block, Block> MELTING_CACHE = new ConcurrentHashMap<>()`。<br>在 `ServerStartedEvent` 与服务端数据包重载（`OnDatapackSyncEvent` 且 `event.getPlayer() == null`）时自动重建：<br>1. 内置映射：`#minecraft:logs_that_burn` → `COAL_BLOCK`，`GRASS_BLOCK` / `MYCELIUM` → `PODZOL`，`DIRT_PATH` / `DIRT` / `ROOTED_DIRT` / `FARMLAND` → `COARSE_DIRT`，`MUD` → `DIRT`；<br>2. 自动扫描配方管理器中所有产物数量为 `1` 且输入输出均为 `BlockItem` 的 `SmeltingRecipe` 与 `BlastingRecipe`，将输入方块映射到输出方块。 |
| `public static Identifier of(String path)` | 返回 `Identifier.fromNamespaceAndPath("anvillib", path)`。 |

### 3. `ExplosionSession`（内部会话执行器，`@ApiStatus.Internal`）

`ExplosionSession` 为包级私有类，但理解其内部执行细节有助于合理配置 `ExplosionExecutor`：

- **球壳分层与并行切片预计算**：第 `layer` 层对应满足 `(layer - 1)^2 < x^2 + y^2 + z^2 <= layer^2` 的整数偏移点集，生成后通过 `Collections.shuffle` 打乱顺序，使每 Tick 破坏的视觉边缘呈现自然随机感。当 `nextLayer >= 32` 时启用后台预计算，当 `layer >= 96` 时按 CPU 核心数沿 X 轴切片并行生成。
- **单方块静态工具方法**：内部包含 `ExplosionSession.meltBlock(ServerLevel, BlockPos)` 与 `ExplosionSession.destroyBlock(ServerLevel, BlockPos, boolean)`，均会先检查 `level.isLoaded(pos)` 与 `!blockState.isAir()`，防止破坏未加载区块导致同步阻塞加载。
