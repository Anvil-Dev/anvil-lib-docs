# 实体、流体、菜单、状态效果与药水音效构建器 (`Entity` / `Fluid` / `Menu` 等)

<BranchContextCard branch="26.2" />

本篇介绍 `module.registrum` 中面向实体（`EntityBuilder`）、流体（`FluidBuilder`）、容器菜单（`MenuBuilder`）、状态效果（`MobEffectBuilder`）、药水（`PotionBuilder`）、音效（`SoundEventBuilder`）、游戏事件（`GameEventBuilder`）与数据包加载条件（`ConditionBuilder`）的专项构建器及其对应的 `RegistryEntry` 子类。

---

## 一、 实体构建器 (`EntityBuilder` & `EntityEntry`)

### 1. 核心特性

`EntityBuilder<T, P>` 将实体的 `EntityType.Builder` 属性配置、生物基础属性（`EntityAttributeCreationEvent`）、自然生成规则（`RegisterSpawnPlacementsEvent`）、客户端实体渲染器（`EntityRenderersEvent.RegisterRenderers`）、实体战利品表与实体标签整合在一条调用链中。

### 2. 代码示例

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.example.mymod.client.renderer.StoneGolemRenderer;
import com.example.mymod.entity.StoneGolemEntity;
import dev.anvilcraft.lib.v2.registrum.util.entry.EntityEntry;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.level.levelgen.Heightmap;
import net.neoforged.neoforge.event.entity.RegisterSpawnPlacementsEvent;

public final class ModEntities {
    public static final EntityEntry<StoneGolemEntity> STONE_GOLEM = MyMod.REGISTRUM
        .entity("stone_golem", StoneGolemEntity::new, MobCategory.MONSTER)
        .properties(b -> b.sized(1.4F, 2.7F).clientTrackingRange(10))
        .attributes(StoneGolemEntity::createAttributes)
        .spawnPlacement(
            SpawnPlacementTypes.ON_GROUND,
            Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
            StoneGolemEntity::checkSpawnRules,
            RegisterSpawnPlacementsEvent.Operation.REPLACE
        )
        .renderer(() -> StoneGolemRenderer::new)
        .tag(EntityTypeTags.FALL_DAMAGE_IMMUNE)
        .lang("Stone Golem")
        .register();
}
```

### 3. `EntityBuilder<T, P>` 与 `EntityEntry<T>` API 表

| 类名 | 方法签名 | 说明与边界约束 |
| :--- | :--- | :--- |
| `EntityBuilder<T, P>` | • `properties(NonNullConsumer<EntityType.Builder<T>>)`<br>• `renderer(NonNullSupplier<NonNullFunction<EntityRendererProvider.Context, EntityRenderer<? super T, ?>>>)`<br>• `attributes(Supplier<AttributeSupplier.Builder>)`<br>• `spawnPlacement(SpawnPlacementType, Heightmap.Types, SpawnPredicate<T>, RegisterSpawnPlacementsEvent.Operation)`<br>• `defaultLang()` / `lang(String)`<br>• `loot(NonNullBiConsumer<RegistrumEntityLootTables, EntityType<T>>)`<br>• `tag(TagKey<EntityType<?>>...)`<br>• `EntityEntry<T> register()` | • `attributes` 与 `spawnPlacement` 每个构建器**最多只能调用一次**，重复调用抛出 `IllegalStateException`。<br>• `createEntry()` 中自动调用 `builder.build(getResourceKey())` 注入 26.2 实体资源键。 |
| `EntityEntry<T>` | • `public @Nullable T create(Level world, EntitySpawnReason reason)`<br>• `public boolean is(Entity t)`<br>• `public static <T extends Entity> EntityEntry<T> cast(RegistryEntry<EntityType<?>, EntityType<T>> entry)` | 实体注册项包装类。 |

---

## 二、 流体构建器 (`FluidBuilder` & `FluidEntry`)

### 1. 一键五联注册机制

在 Minecraft / NeoForge 中注册一种完整流体通常需要同时注册 5 个对象：
1. **流动流体（Flowing Fluid）**：注册名为 `flowing_<name>`（`FluidBuilder` 自身的主条目）；
2. **源流体（Source Fluid）**：注册名为 `<name>`（默认开启 `defaultSource()`）；
3. **流体类型（`FluidType`）**：注册在 `NeoForgeRegistries.Keys.FLUID_TYPES` 下，名称为 `<name>`；
4. **流体方块（`LiquidBlock`）**：注册名为 `<name>`（默认开启 `defaultBlock()`，无需时可调 `.noBlock()`）；
5. **流体桶物品（`BucketItem`）**：注册名为 `<name>_bucket`（默认开启 `defaultBucket()`，无需时可调 `.noBucket()`）。

此外，针对 Minecraft 26.2 新增的客户端流体模型系统（`RegisterFluidModelsEvent`），`FluidBuilder` 提供了 `.fluidModel(stillTexture, flowingTexture)` 与 `.fluidModel(Supplier<Supplier<DefaultFluidModel>>)`，自动在客户端完成 `FluidModel.Unbaked` 注册！

### 2. 代码示例

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.registrum.util.entry.FluidEntry;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.FluidTags;
import net.neoforged.neoforge.fluids.BaseFlowingFluid;

public final class ModFluids {
    public static final FluidEntry<BaseFlowingFluid.Flowing> MOLTEN_COPPER = MyMod.REGISTRUM
        .fluid(
            "molten_copper",
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "block/molten_copper_still"),
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "block/molten_copper_flow")
        )
        .properties(typeProps -> typeProps.lightLevel(15).density(3000).viscosity(6000).temperature(1350))
        .fluidProperties(fluidProps -> fluidProps.levelDecreasePerBlock(2).tickRate(30))
        .tag(FluidTags.LAVA)
        // 进入子 ItemBuilder 定制流体桶，再 .build() 返回 FluidBuilder
        .bucket()
            .burnTime(20000)
            .build()
        .lang("Molten Copper")
        .register();
}
```

### 3. `FluidBuilder<T, P>` 与 `FluidEntry<T>` API 表

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `FluidBuilder<T, P>` | • `properties(NonNullConsumer<FluidType.Properties>)`<br>• `fluidProperties(NonNullConsumer<BaseFlowingFluid.Properties>)`<br>• `fluidModel(Identifier stillTexture, Identifier flowingTexture)` / `fluidModel(NonNullSupplier<Supplier<DefaultFluidModel>>)`<br>• `clientExtension(NonNullSupplier<Supplier<IClientFluidTypeExtensions>>)`<br>• `defaultSource()` / `source(NonNullFunction<BaseFlowingFluid.Properties, ? extends BaseFlowingFluid>)`<br>• `defaultBlock()` / `block()` / `block(NonNullBiFunction<T, BlockBehaviour.Properties, ? extends B>)` / `noBlock()`<br>• `defaultBucket()` / `bucket()` / `bucket(NonNullBiFunction<BaseFlowingFluid, Item.Properties, ? extends I>)` / `noBucket()`<br>• `tag(TagKey<Fluid>...)` / `removeTag(TagKey<Fluid>...)`（自动同时应用到流动流体和源流体）<br>• `defaultLang()` / `lang(String)`<br>• `FluidEntry<T> register()` | • 内部记录 `DefaultFluidModel(Identifier stillTexture, boolean stillTranslucent, Identifier flowingTexture, boolean flowingTranslucent, @Nullable Identifier overlayTexture, boolean overlayTranslucent, @Nullable FluidTintSource fluidTintSource)`。<br>• 调用 `aliasFrom(oldBaseId)` 时，会自动为 `flowing_<old>`、`<old>`、`FluidType`、`LiquidBlock` 和 `<old>_bucket` 全部注册别名。 |
| `FluidEntry<T>` | • `<S extends BaseFlowingFluid> S getSource()`<br>• `FluidType getType()`<br>• `<B extends Block> Optional<B> getBlock()`<br>• `<I extends Item> Optional<I> getBucket()`<br>• `<R> boolean is(R entry)`（调用 `get().isSame((Fluid) entry)`） | 流体注册项包装类。 |

---

## 三、 菜单构建器 (`MenuBuilder` & `MenuEntry`)

### 1. 核心特性与代码示例

`MenuBuilder<T, S, P>` 使用 `IMenuTypeExtension.create` 创建支持可选网络缓冲区（`RegistryFriendlyByteBuf`）的 `MenuType<T>`，并在物理客户端自动监听 `RegisterMenuScreensEvent` 将菜单与对应的 `Screen` 绑定。

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.example.mymod.client.screen.CrusherScreen;
import com.example.mymod.menu.CrusherMenu;
import dev.anvilcraft.lib.v2.registrum.util.entry.MenuEntry;

public final class ModMenus {
    public static final MenuEntry<CrusherMenu> CRUSHER_MENU = MyMod.REGISTRUM
        .menu(
            "crusher",
            // ForgeMenuFactory: (type, windowId, inv, buf) -> ...
            CrusherMenu::new,
            () -> CrusherScreen::new
        )
        .register();
}
```

### 2. `MenuBuilder` 与 `MenuEntry` API 表

| 类名 | 接口 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `MenuBuilder<T, S, P>` | • `MenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv)`<br>• `ForgeMenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer)`<br>• `ScreenFactory<M, T>`: `T create(M menu, Inventory inv, Component displayName)`<br>• `MenuEntry<T> register()` | 构造时接收 `MenuFactory` 或 `ForgeMenuFactory`，以及客户端安全的 `NonNullSupplier<ScreenFactory<T, S>>`。 |
| `MenuEntry<T>` | • `T create(int windowId, Inventory playerInv)`<br>• `MenuConstructor asProvider()`<br>• `void open(ServerPlayer player, Component displayName)`<br>• `void open(ServerPlayer player, Component displayName, Consumer<RegistryFriendlyByteBuf> extraData)`<br>• `void open(ServerPlayer player, Component displayName, MenuConstructor provider)`<br>• `void open(ServerPlayer player, Component displayName, MenuConstructor provider, Consumer<RegistryFriendlyByteBuf> extraData)` | 菜单注册项包装类，提供直接在服务端为 `ServerPlayer` 打开菜单并写入附加 `RegistryFriendlyByteBuf` 数据的便捷方法。 |

---

## 四、 状态效果、药水、音效、游戏事件与条件构建器

以下 5 个轻量级专项构建器均可直接通过 `REGISTRUM` 的同名入口方法启动：

| 构建器与返回 Entry | `REGISTRUM` 入口方法签名 | 说明与 Entry 特有方法 |
| :--- | :--- | :--- |
| **`MobEffectBuilder<T, P>`**<br>→ `MobEffectEntry<T>` | `REGISTRUM.mobEffect(String name, NonNullSupplier<T> supplier)` | 向 `Registries.MOB_EFFECT` 注册状态效果。`MobEffectEntry<T>` 继承自 `RegistryEntry<MobEffect, T>`。 |
| **`PotionBuilder<P>`**<br>→ `PotionEntry` | `REGISTRUM.potion(String name, MobEffectInstance... effects)` | 继承自 `SelfBuilder`，向 `Registries.POTION` 注册包含指定效果数组的 `new Potion(modid + ":" + name, effects)`。 |
| **`SoundEventBuilder<P>`**<br>→ `SoundEventEntry` | • `REGISTRUM.soundEvent(String name)`（调用 `SoundEvent.createVariableRangeEvent`）<br>• `REGISTRUM.soundEvent(String name, float fixedRange)`（调用 `SoundEvent.createFixedRangeEvent`） | 继承自 `SelfBuilder`，向 `Registries.SOUND_EVENT` 注册音效事件。 |
| **`GameEventBuilder<P>`**<br>→ `GameEventEntry` | `REGISTRUM.gameEvent(String name, int notificationRadius)` | 向 `Registries.GAME_EVENT` 注册通知半径为 `notificationRadius` 的幽匿感测器游戏事件 `new GameEvent(radius)`。 |
| **`ConditionBuilder<T, P>`**<br>→ `ConditionEntry<T>` | `REGISTRUM.condition(String name, MapCodec<T> codec)` | 向 `NeoForgeRegistries.Keys.CONDITION_CODECS` 注册自定义数据包加载条件 `ICondition` 的 `MapCodec<T>`。 |
