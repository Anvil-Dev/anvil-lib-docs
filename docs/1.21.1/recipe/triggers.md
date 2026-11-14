# 触发器系统 (`dev.anvilcraft.lib.v2.recipe.trigger`)

<BranchContextCard branch="1.21.1" />

在 `module.recipe` 中，**触发器（`IRecipeTrigger`）**决定了“什么时候去检索并执行一类世界内配方”。

`InWorldRecipeManager` 在内部按 `IRecipeTrigger` 对所有 `InWorldRecipe` 进行分组索引，并为每个触发器独立构建方块剪枝图（`PrunePlan`）。当世界中发生某个动作（例如物品掉入炼药锅、铁砧砸落、多方块控制器脉冲或玩家手持法杖右键）时，只需构造 `InWorldRecipeContext` 并调用 `inWorldRecipeManager.trigger(myTrigger, ctx)`，就只会检索绑定在该触发器下的候选配方。

---

## 一、 内置触发器与工作原理

### 1. `LibRecipeTriggers.ITEM_INTO_BLOCK` (`anvillib_recipe:item_into_block`)

`module.recipe` 默认内置了一个通用触发器 **`LibRecipeTriggers.ITEM_INTO_BLOCK`**：
- **触发机制**：`ItemEntityMixin` 在 `ItemEntity#tick` 每 Tick 结束（`@At("RETURN")`）时检查 `BlockPos.containing(this.position())` 是否与上一 Tick 记录的 `anvillib$blockPos` 不同；若物品实体跨入了新的方块格，则向 `NeoForge.EVENT_BUS` 发布 `ItemEntityEvent.InToBlock(level, entity, blockPos, pos, motion)`；
- **内置监听**：`ItemEntityEventListener#onItemEntityInToBlock` 监听该事件，在服务端（`ServerLevel`）上以 `event.getPos()`（即 `ItemEntity` 的精确浮点坐标）和 `event.getEntity()` 创建 `InWorldRecipeContext`，自动触发 `LibRecipeTriggers.ITEM_INTO_BLOCK` 并调用 `context.accept()` 提交变更。

### 2. 配置项 (`AnvilLibRecipeConfig`)

`AnvilLibRecipe.CONFIG`（配置文件名 `anvillib_recipe`）提供了一个全局配置项：

| 字段名 | 类型 | 默认值 | 取值范围 | 说明 |
| :--- | :--- | :---: | :---: | :--- |
| `AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency` | `int` | `64` | `[1, 128]` | 单次触发中，单个配方最多允许连续执行的最大批次数上限（实际取 `Math.min(recipe.maxEfficiency(), CONFIG.inWorldRecipeMaxEfficiency)`）。 |

---

## 二、 完整代码示例：注册自定义触发器并在方块/事件中主动触发配方

当你需要实现诸如“铁砧落地砸击”、“雷击避雷针”或“锤击锻造”等专属配方时，只需向 **`LibRegistries.TRIGGER_KEY`（`anvillib:trigger`）** 注册你自己的 `IRecipeTrigger`：

```java
package com.example.mymod.recipe;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.init.LibRegistries;
import dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeContext;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeManager;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;
import org.jetbrains.annotations.Nullable;

public final class ModRecipeTriggers {
    // 1. 创建指向 LibRegistries.TRIGGER_KEY (anvillib:trigger) 的 DeferredRegister
    public static final DeferredRegister<IRecipeTrigger> TRIGGERS =
        DeferredRegister.create(LibRegistries.TRIGGER_KEY, MyMod.MOD_ID);

    // 2. 注册一个自定义触发器（也可使用 IRecipeTrigger.Impl::new 直接按注册表 ID 构造默认优先级触发器）
    public static final DeferredHolder<IRecipeTrigger, IRecipeTrigger> ON_HAMMER_SMASH =
        TRIGGERS.register("on_hammer_smash", id -> new IRecipeTrigger() {
            @Override
            public int priority() {
                return 10;
            }
        });

    private ModRecipeTriggers() {
    }

    public static void register(IEventBus modEventBus) {
        TRIGGERS.register(modEventBus);
    }

    /**
     * 3. 在你的方块交互、实体落地或事件处理器中触发该世界内配方：
     */
    public static void triggerHammerSmash(ServerLevel level, BlockPos targetPos, @Nullable Entity sourceEntity) {
        // 创建配方上下文（以目标方块中心 Vec3.atCenterOf(targetPos) 为基准坐标 (0, 0, 0)）
        InWorldRecipeContext ctx = new InWorldRecipeContext(level, Vec3.atCenterOf(targetPos), sourceEntity);

        // 从 ServerLevel.getRecipeManager() 获取注入的 InWorldRecipeManager 并触发
        InWorldRecipeManager manager = level.getRecipeManager().anvillib$getInWorldRecipeManager();
        manager.trigger(ON_HAMMER_SMASH.get(), ctx);

        // 4. 关键步骤：调用 ctx.accept() 统一提交所有缓存中的物品扣除/生成、方块变更与实体变更！
        ctx.accept();
    }
}
```

> **重要提示：别忘了调用 `ctx.accept()`！**
> `manager.trigger(trigger, ctx)` 执行期间，所有谓词的消耗和结果的产出都只是记录在 `InWorldRecipeContext` 的缓存（`ItemCache`、`BlockCache`、`EntityCache`）和提交队列（`acceptors` / `afterCommit`）中。**必须在 `trigger(...)` 返回后调用 `ctx.accept()`**，所有对世界的实际修改才会真正按序提交生效！

---

## 三、 触发器相关公开 API 详解

### 1. `IRecipeTrigger` 与 `IRecipeTrigger.Impl`

位于 `dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger`，继承自 `IPrioritized`。

| 方法 / 类签名 | 默认返回值 | 说明 |
| :--- | :--- | :--- |
| `Codec<IRecipeTrigger> CODEC` | `LibRegistries.TRIGGER_REGISTRY.byNameCodec()` | 基于自定义触发器注册表 `anvillib:trigger` 的序列化编解码器。 |
| `default @Nullable ResourceLocation getId()` | `LibRegistries.TRIGGER_REGISTRY.getKey(this)` | 获取当前触发器在 `LibRegistries.TRIGGER_REGISTRY` 中的注册表 ID。 |
| `default int priority()` | `1` | 触发器提供的基础优先级（计入 `InWorldRecipe.calcPriority`）。 |
| `record IRecipeTrigger.Impl(ResourceLocation id) implements IRecipeTrigger` | `getId()` 返回 `id` | 默认空状态触发器实现；配合 `DeferredRegister#register(String, Function<ResourceLocation, ...>)` 可直接写 `IRecipeTrigger.Impl::new`。 |

### 2. `LibRecipeTriggers` 与自定义触发器注册表

| 符号名 | 注册表 / ID | 说明 |
| :--- | :--- | :--- |
| `LibRegistries.TRIGGER_KEY` | `anvillib:trigger` | 触发器注册表 `ResourceKey<Registry<IRecipeTrigger>>`，已开启 `.sync(true)` 与 `maxId(512)`。 |
| `LibRegistries.TRIGGER_REGISTRY` | `Registry<IRecipeTrigger>` | 触发器静态注册表实例。 |
| `LibRecipeTriggers.ITEM_INTO_BLOCK` | `anvillib_recipe:item_into_block` | 当物品实体进入新方块格时由 `ItemEntityEventListener` 自动触发。 |
