# 配方触发器 (`IRecipeTrigger` / `LibRecipeTriggers`)

<BranchContextCard branch="26.2" />

在 `module.recipe` 中，**触发器（`IRecipeTrigger`）** 是将世界事件（如物品掉入方块、铁砧砸落、红石脉冲、多方块激活）与对应的一组 `InWorldRecipe` 关联起来的索引键。`InWorldRecipeManager` 在加载数据包配方时，会先按 `IRecipeTrigger` 对所有 `InWorldRecipe` 进行分组并按优先级排序；当某个世界事件发生时，只需检索绑定在该触发器下的候选配方列表，无需遍历全服所有配方。

---

## 一、 要解决什么问题 / 怎么用

1. **使用内置触发器 (`LibRecipeTriggers.ITEM_INTO_BLOCK`)**：
   `module.recipe` 内置了 `anvillib_recipe:item_into_block` 触发器，并在 `ItemEntityEventListener` 中自动监听物品实体（`ItemEntity`）移动或落入方块的事件。如果你的配方是“将物品丢进某个方块（如炼药锅、火、特定机器方块）触发合成”，直接使用 `LibRecipeTriggers.ITEM_INTO_BLOCK.get()` 即可，连事件监听代码都不用写。
2. **注册并触发自定义 `IRecipeTrigger`**：
   如果你的模组有独特的物理交互（例如：玩家用锤子敲击方块、闪电劈中避雷针、多方块结构每 Tick 工作），你可以向 `LibRegistries.TRIGGER_REGISTRY` 注册自己的 `IRecipeTrigger`，并在交互发生时创建 `InWorldRecipeContext` 调用 `InWorldRecipeManager#trigger(myTrigger, ctx)`。

---

## 二、 完整代码示例：注册并触发自定义触发器

### 1. 注册自定义 `IRecipeTrigger`

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.recipe.init.LibRegistries;
import dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

public final class ModRecipeTriggers {
    public static final DeferredRegister<IRecipeTrigger> TRIGGERS =
        DeferredRegister.create(LibRegistries.TRIGGER_REGISTRY, MyMod.MOD_ID);

    // 方式 A：直接使用 IRecipeTrigger.Impl::new（默认优先级为 0）
    public static final DeferredHolder<IRecipeTrigger, IRecipeTrigger> HAMMER_SMASH =
        TRIGGERS.register("hammer_smash", IRecipeTrigger.Impl::new);

    // 方式 B：自定义实现类以指定更高的基础优先级
    public static final DeferredHolder<IRecipeTrigger, IRecipeTrigger> LIGHTNING_STRIKE =
        TRIGGERS.register("lightning_strike", () -> new IRecipeTrigger() {
            @Override
            public int priority() {
                return 100;
            }
        });

    public static void register(IEventBus modEventBus) {
        TRIGGERS.register(modEventBus);
    }
}
```

### 2. 在世界交互发生时执行触发器

```java
package com.example.mymod.event;

import com.example.mymod.init.ModRecipeTriggers;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeContext;
import dev.anvilcraft.lib.v2.recipe.util.InWorldRecipeManager;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

public final class HammerSmashHandler {
    private HammerSmashHandler() {
    }

    public static void onPlayerSmashBlock(ServerLevel level, BlockPos hitPos, Player player) {
        // 1. 获取挂载在 ServerLevel RecipeManager 上的 InWorldRecipeManager
        InWorldRecipeManager manager = level.recipeAccess().anvillib$getInWorldRecipeManager();

        // 2. 以被敲击方块的底部中心或中心点构造 InWorldRecipeContext
        Vec3 origin = Vec3.atCenterOf(hitPos);
        InWorldRecipeContext context = new InWorldRecipeContext(level, origin, player);

        // 3. 触发自定义触发器，并将缓存中的方块/物品/实体变更提交回真实世界
        manager.trigger(ModRecipeTriggers.HAMMER_SMASH.get(), context);
        context.accept();
    }
}
```

---

## 三、 公开接口与内置触发器 API 详解

### 1. `IRecipeTrigger`（`dev.anvilcraft.lib.v2.recipe.trigger.IRecipeTrigger`）

继承自 `dev.anvilcraft.lib.v2.recipe.util.IPrioritized`（默认 `priority() == 1`）。

| 常量 / 方法 / 内部记录签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `Codec<IRecipeTrigger> CODEC` | `Codec<IRecipeTrigger>` | `LibRegistries.TRIGGER_REGISTRY.byNameCodec()`，按注册名序列化触发器。 |
| `default @Nullable Identifier getId()` | `@Nullable Identifier` | 查询当前触发器在 `LibRegistries.TRIGGER_REGISTRY` 中的注册 ID。 |
| `default int priority()` | `int` | 继承自 `IPrioritized`，默认返回 `1`。参与 `InWorldRecipe.calcPriority` 自动优先级求和。 |
| `record Impl(Identifier id) implements IRecipeTrigger` | `record` | 默认不可变实现记录，可直接将 `IRecipeTrigger.Impl::new` 作为 `DeferredRegister#register(String, Function<Identifier, ? extends I>)` 的工厂方法引用传入。 |

### 2. `LibRecipeTriggers`（内置触发器注册类）

位于 `dev.anvilcraft.lib.v2.recipe.init.recipe.LibRecipeTriggers`。

| 常量名 | 注册表 ID | 自动触发机制说明 |
| :--- | :--- | :--- |
| `LibRecipeTriggers.TRIGGER` | — | 模组 `anvillib_recipe` 的 `DeferredRegister<IRecipeTrigger>`。 |
| `LibRecipeTriggers.ITEM_INTO_BLOCK` | `anvillib_recipe:item_into_block` | 当世界中的 `ItemEntity` 位置发生变更或落入方块时，由 `ItemEntityEventListener` 自动以该物品实体的坐标构造 `InWorldRecipeContext(level, pos, itemEntity)` 并调用 `manager.trigger(ITEM_INTO_BLOCK.get(), ctx)` 与 `ctx.accept()`。 |
