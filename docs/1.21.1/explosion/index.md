# Explosion 分层球形爆炸系统 (`module.explosion`)

<BranchContextCard branch="1.21.1" />

`module.explosion`（构件名 `anvillib-explosion-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.explosion`）提供了一套**支持超大半径（百格级）、按球面距离层分摊到每 Tick 渐进破坏、后台工作窃取线程池预计算下一层坐标、且同时支持核心完全破坏区 + 地表概率破坏区 + 地表高温融化区**的球形爆炸执行框架。

原版 `Level#explode` 在同一 Tick 内同步执行射线采样与方块移除，当爆炸半径超过 20~30 格时就会导致服务端主线程严重卡顿甚至看门狗（Watchdog）崩溃。`ExplosionExecutor` 通过创建自注册到 `NeoForge.EVENT_BUS` 的 `ExplosionSession`，在每个 `ServerTickEvent.Post` 中最多只破坏 `maxBreakPerTick` 个方块，并用 `Executors.newWorkStealingPool()` 异步预计算下一球壳层（Layer）的方块列表，从而在保持服务器流畅运行的同时展现出震撼的冲击波向外逐层推进效果。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.1`，则已自动包含本模块；若仅需单独引入 `explosion` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-explosion-neoforge-1.21.1:2.0.0")
}
```

---

## 二、 三重作用半径与融化缓存机制

`ExplosionExecutor` 从爆炸中心 `center` 由内向外按欧几里得距离划分为三个同心球区域：

1. **核心完全破坏半径（`radius`，默认 `100`）**：
   距离 $\le \text{radius}$ 的所有非排除方块（含地下与地表）100% 被破坏（若方块含水/流体则保留流体对应方块 `fluidState.createLegacyBlock()`）。
2. **地表概率破坏半径（`probabilityRadius`，默认 `128`，实际生效值 $\ge \text{radius}$）**：
   在 $(\text{radius}, \text{probabilityRadius}]$ 区间内：
   - **脆弱方块（`frangibleBlocks`）**：无论处于地下还是地表，100% 被破坏；
   - **地表方块（`target.getY() >= WORLD_SURFACE - ceil(radius * 0.1) - 1`）**：按距离从内边界的 **80% 概率**线性衰减至外边界的 **0% 概率**随机破坏。
3. **地表高温融化半径（`meltingRadius`，默认 `160`，实际生效值 $\ge \text{radius}$）**：
   在 $(\text{probabilityRadius}, \text{meltingRadius}]$（及核心外未被概率破坏的地表区间）内，地表方块按从 `probabilityRadius` 处的 **80% 概率**线性衰减至 `meltingRadius` 处的 **0% 概率**触发**方块融化（`ExplosionSession.meltBlock`）**——根据全局映射表 **`AnvilLibExplosion.MELTING_CACHE`** 将原方块替换为融化后的目标方块！

### 默认融化映射表 (`AnvilLibExplosion.MELTING_CACHE`)

`AnvilLibExplosion.MELTING_CACHE` 是一个公开的 `IdentityHashMap<Block, Block>`，默认预置了以下 4 条映射（模组可在初始化时直接向 `AnvilLibExplosion.MELTING_CACHE.put(fromBlock, toBlock)` 追加自定义融化规则）：
- `Blocks.SAND` → `Blocks.GLASS`（沙子烧结为玻璃）
- `Blocks.RED_SAND` → `Blocks.RED_STAINED_GLASS`（红沙烧结为红色染色玻璃）
- `Blocks.SNOW` → `Blocks.WATER`（顶层雪融化为水）
- `Blocks.SNOW_BLOCK` → `Blocks.WATER`（雪块融化为水）

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
import org.jetbrains.annotations.Nullable;

public final class SupernovaExplosionHelper {
    static {
        // 注册自定义融化规则：冲击波外围高温将圆石与石头融化为岩浆块
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.COBBLESTONE, Blocks.MAGMA_BLOCK);
        AnvilLibExplosion.MELTING_CACHE.put(Blocks.STONE, Blocks.MAGMA_BLOCK);
    }

    private SupernovaExplosionHelper() {
    }

    public static void triggerSupernova(ServerLevel level, BlockPos center, @Nullable Entity sourceEntity) {
        ExplosionExecutor.create()
            // 1. 核心完全破坏半径 48 格，概率破坏半径 72 格，高温融化半径 96 格
            .radius(48)
            .probabilityRadius(72)
            .meltingRadius(96)
            // 2. 每 Tick 最多破坏 1024 个方块（受全局配置 maxRemoveBlocksPerTick 上限约束）
            .maxBreakPreTick(1024)
            // 3. 大规模爆炸建议关闭掉落物以防数万个 ItemEntity 卡死服务器
            .dropItems(false)
            // 4. 设置爆炸发起实体
            .executor(sourceEntity)
            // 5. 追加保护方块（黑曜石、哭泣的黑曜石及防爆标签方块不被破坏）
            .excludedBlocks(Blocks.OBSIDIAN, Blocks.CRYING_OBSIDIAN)
            .excludedBlocks(BlockTags.DRAGON_IMMUNE)
            // 6. 追加脆弱方块（花卉与火把在波及范围内必定被震碎）
            .frangibleBlocks(BlockTags.FLOWERS, BlockTags.CANDLES)
            // 7. 自定义波及方块位置上的实体伤害与点燃逻辑
            .entityProcessor((serverLevel, blockPos, entity) -> {
                entity.hurt(entity.damageSources().explosion(null, sourceEntity), 35.0F);
                if (entity instanceof LivingEntity) {
                    entity.igniteForSeconds(8.0F);
                }
            })
            // 8. 启动分层爆炸会话（自动挂载到 ServerTickEvent.Post 并在完成后自注销）
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
| `public ExplosionExecutor maxBreakPreTick(int maxBreakPreTick)` | `CONFIG.defaultRemoveBlocksPerTick` (`512`) | 设置每服务端 Tick 最多移除/融化的方块数（实际生效值为 `Math.min(maxBreakPreTick, CONFIG.maxRemoveBlocksPerTick)`）。 |
| `public ExplosionExecutor dropItems(boolean dropItems)` | `false` | 方块被破坏时是否调用 `Block.dropResources` 产生掉落物。 |
| `public ExplosionExecutor probabilityRadius(int probabilityRadius)` | `128` | 设置地表概率破坏外半径（执行时自动取 `Math.max(probabilityRadius, radius)`）。 |
| `public ExplosionExecutor meltingRadius(int meltingRadius)` | `160` | 设置地表高温融化外半径（执行时自动取 `Math.max(meltingRadius, radius)`）。 |
| `public ExplosionExecutor excludedBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor excludedBlocks(Block... blocks)`<br>`public ExplosionExecutor excludedBlocks(TagKey<Block>... blocks)` | 默认已包含 `block -> block.defaultDestroyTime() < 0`（基岩、末地传送门框架等不可破坏方块） | 向排除列表**追加**不允许被破坏或融化的方块条件（注意是追加而非覆盖默认不可破坏判断）。 |
| `public ExplosionExecutor frangibleBlocks(Predicate<Block>... blocks)`<br>`public ExplosionExecutor frangibleBlocks(Block... blocks)`<br>`public ExplosionExecutor frangibleBlocks(TagKey<Block>... blocks)` | 默认已包含 `Tags.Blocks.GLASS_BLOCKS`、`GLASS_PANES`、`BlockTags.LEAVES`、`BlockTags.REPLACEABLE` | 向脆弱方块列表**追加**在波及范围内 100% 被震碎的方块条件。 |
| `public ExplosionExecutor executor(@Nullable Entity executor)` | `null` | 设置爆炸归属实体（用于默认 `entityProcessor` 的爆炸伤害源追踪）。 |
| `public ExplosionExecutor entityProcessor(@Nullable TriConsumer<ServerLevel, BlockPos, Entity> entityProcessor)` | 默认对实体造成 `radius * 0.5f` 点爆炸伤害 | 设置当某个方块坐标被爆炸扫描到时，对该坐标格内实体的处理回调（传入 `null` 可完全禁用实体处理）。 |
| `public void execute(ServerLevel level, BlockPos pos)` | — | 创建并启动 `ExplosionSession`。 |

### 2. `AnvilLibExplosion` 与 `AnvilLibExplosionConfig`

| 类 / 字段名 | 类型与默认值 | 说明 |
| :--- | :--- | :--- |
| `AnvilLibExplosion.CONFIG` | `AnvilLibExplosionConfig` | 全局服务端配置实例（配置文件 `anvillib_explosion-server.toml`）。 |
| `AnvilLibExplosion.MELTING_CACHE` | `Map<Block, Block>` | 全局融化方块映射表（`IdentityHashMap`）。 |
| `CONFIG.maxRemoveBlocksPerTick` | `int`（默认 `16384`，范围 `[64, 65536]`） | 单个爆炸会话每 Tick 允许移除方块数的全局硬上限。 |
| `CONFIG.defaultRemoveBlocksPerTick` | `int`（默认 `512`，范围 `[64, 65536]`） | 未显式调用 `.maxBreakPreTick(...)` 时的默认每 Tick 移除方块数。 |
