# Entity, Fluid, Menu, MobEffect, Potion & Sound Builders (`Entity` / `Fluid` / `Menu` etc.)

<BranchContextCard branch="26.3" />

This page covers `module.registrum`'s specialized builders and `RegistryEntry` subclasses for entities (`EntityBuilder`), fluids (`FluidBuilder`), container menus (`MenuBuilder`), mob effects (`MobEffectBuilder`), potions (`PotionBuilder`), sound events (`SoundEventBuilder`), game events (`GameEventBuilder`), and datapack load conditions (`ConditionBuilder`).

---

## 1. Entity Builder (`EntityBuilder` & `EntityEntry`)

### 1. Core Features

`EntityBuilder<T, P>` unifies `EntityType.Builder` configuration, mob base attributes (`EntityAttributeCreationEvent`), natural spawn placements (`RegisterSpawnPlacementsEvent`), client entity renderers (`EntityRenderersEvent.RegisterRenderers`), entity loot tables, and entity tags into a single fluent chain.

### 2. Code Example

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

### 3. `EntityBuilder<T, P>` & `EntityEntry<T>` API Table

| Class | Method Signatures | Description & Constraints |
| :--- | :--- | :--- |
| `EntityBuilder<T, P>` | • `properties(NonNullConsumer<EntityType.Builder<T>>)`<br>• `renderer(NonNullSupplier<NonNullFunction<EntityRendererProvider.Context, EntityRenderer<? super T, ?>>>)`<br>• `attributes(Supplier<AttributeSupplier.Builder>)`<br>• `spawnPlacement(SpawnPlacementType, Heightmap.Types, SpawnPredicate<T>, RegisterSpawnPlacementsEvent.Operation)`<br>• `defaultLang()` / `lang(String)`<br>• `loot(NonNullBiConsumer<RegistrumEntityLootTables, EntityType<T>>)`<br>• `tag(TagKey<EntityType<?>>...)`<br>• `EntityEntry<T> register()` | • `attributes` and `spawnPlacement` may **each be called at most once** per builder; calling twice throws `IllegalStateException`.<br>• `createEntry()` automatically calls `builder.build(getResourceKey())` to inject the 26.3 entity resource key. |
| `EntityEntry<T>` | • `public @Nullable T create(Level world, EntitySpawnReason reason)`<br>• `public boolean is(Entity t)`<br>• `public static <T extends Entity> EntityEntry<T> cast(RegistryEntry<EntityType<?>, EntityType<T>> entry)` | Entity registry entry wrapper. |

---

## 2. Fluid Builder (`FluidBuilder` & `FluidEntry`)

### 1. Five-in-One Registration Mechanism

Registering a complete fluid in Minecraft / NeoForge typically requires registering 5 objects together:
1. **Flowing Fluid**: registered as `flowing_<name>` (`FluidBuilder`'s own primary entry);
2. **Source Fluid**: registered as `<name>` (`defaultSource()` enabled by default);
3. **Fluid Type (`FluidType`)**: registered under `NeoForgeRegistries.Keys.FLUID_TYPES` as `<name>`;
4. **Fluid Block (`LiquidBlock`)**: registered as `<name>` (`defaultBlock()` enabled by default; call `.noBlock()` if not needed);
5. **Bucket Item (`BucketItem`)**: registered as `<name>_bucket` (`defaultBucket()` enabled by default; call `.noBucket()` if not needed).

Additionally, for Minecraft 26.3's new client fluid model system (`RegisterFluidModelsEvent`), `FluidBuilder` provides `.fluidModel(stillTexture, flowingTexture)` and `.fluidModel(Supplier<Supplier<DefaultFluidModel>>)` to register `FluidModel.Unbaked` on the client automatically!

### 2. Code Example

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
        // Enter child ItemBuilder to customize the bucket item, then .build() back to FluidBuilder
        .bucket()
            .burnTime(20000)
            .build()
        .lang("Molten Copper")
        .register();
}
```

### 3. `FluidBuilder<T, P>` & `FluidEntry<T>` API Table

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| `FluidBuilder<T, P>` | • `properties(NonNullConsumer<FluidType.Properties>)`<br>• `fluidProperties(NonNullConsumer<BaseFlowingFluid.Properties>)`<br>• `fluidModel(Identifier stillTexture, Identifier flowingTexture)` / `fluidModel(NonNullSupplier<Supplier<DefaultFluidModel>>)`<br>• `clientExtension(NonNullSupplier<Supplier<IClientFluidTypeExtensions>>)`<br>• `defaultSource()` / `source(NonNullFunction<BaseFlowingFluid.Properties, ? extends BaseFlowingFluid>)`<br>• `defaultBlock()` / `block()` / `block(NonNullBiFunction<T, BlockBehaviour.Properties, ? extends B>)` / `noBlock()`<br>• `defaultBucket()` / `bucket()` / `bucket(NonNullBiFunction<BaseFlowingFluid, Item.Properties, ? extends I>)` / `noBucket()`<br>• `tag(TagKey<Fluid>...)` / `removeTag(TagKey<Fluid>...)` (applied to both flowing and source fluids)<br>• `defaultLang()` / `lang(String)`<br>• `FluidEntry<T> register()` | • Internal record `DefaultFluidModel(Identifier stillTexture, boolean stillTranslucent, Identifier flowingTexture, boolean flowingTranslucent, @Nullable Identifier overlayTexture, boolean overlayTranslucent, @Nullable FluidTintSource fluidTintSource)`.<br>• Calling `aliasFrom(oldBaseId)` automatically registers aliases for `flowing_<old>`, `<old>`, `FluidType`, `LiquidBlock`, and `<old>_bucket`. |
| `FluidEntry<T>` | • `<S extends BaseFlowingFluid> S getSource()`<br>• `FluidType getType()`<br>• `<B extends Block> Optional<B> getBlock()`<br>• `<I extends Item> Optional<I> getBucket()`<br>• `<R> boolean is(R entry)` (calls `get().isSame((Fluid) entry)`) | Fluid registry entry wrapper. |

---

## 3. Menu Builder (`MenuBuilder` & `MenuEntry`)

### 1. Core Features & Code Example

`MenuBuilder<T, S, P>` uses `IMenuTypeExtension.create` to create a `MenuType<T>` supporting an optional network buffer (`RegistryFriendlyByteBuf`), and automatically listens to `RegisterMenuScreensEvent` on the physical client to bind the menu to its `Screen`.

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

### 2. `MenuBuilder` & `MenuEntry` API Table

| Class | Interface / Method Signatures | Description |
| :--- | :--- | :--- |
| `MenuBuilder<T, S, P>` | • `MenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv)`<br>• `ForgeMenuFactory<T>`: `T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer)`<br>• `ScreenFactory<M, T>`: `T create(M menu, Inventory inv, Component displayName)`<br>• `MenuEntry<T> register()` | Accepts `MenuFactory` or `ForgeMenuFactory` and a client-safe `NonNullSupplier<ScreenFactory<T, S>>`. |
| `MenuEntry<T>` | • `T create(int windowId, Inventory playerInv)`<br>• `MenuConstructor asProvider()`<br>• `void open(ServerPlayer player, Component displayName)`<br>• `void open(ServerPlayer player, Component displayName, Consumer<RegistryFriendlyByteBuf> extraData)`<br>• `void open(ServerPlayer player, Component displayName, MenuConstructor provider)`<br>• `void open(ServerPlayer player, Component displayName, MenuConstructor provider, Consumer<RegistryFriendlyByteBuf> extraData)` | Menu registry entry wrapper with convenience helpers to open the menu for a `ServerPlayer` on the server and write extra `RegistryFriendlyByteBuf` data. |

---

## 4. MobEffect, Potion, SoundEvent, GameEvent & Condition Builders

All 5 lightweight specialized builders below can be started directly via the matching method on `REGISTRUM`:

| Builder & Return Entry | `REGISTRUM` Entry Method Signature | Description & Entry-Specific Methods |
| :--- | :--- | :--- |
| **`MobEffectBuilder<T, P>`**<br>→ `MobEffectEntry<T>` | `REGISTRUM.mobEffect(String name, NonNullSupplier<T> supplier)` | Registers a status effect to `Registries.MOB_EFFECT`. `MobEffectEntry<T>` extends `RegistryEntry<MobEffect, T>`. |
| **`PotionBuilder<P>`**<br>→ `PotionEntry` | `REGISTRUM.potion(String name, MobEffectInstance... effects)` | Extends `SelfBuilder`; registers `new Potion(modid + ":" + name, effects)` to `Registries.POTION`. |
| **`SoundEventBuilder<P>`**<br>→ `SoundEventEntry` | • `REGISTRUM.soundEvent(String name)` (calls `SoundEvent.createVariableRangeEvent`)<br>• `REGISTRUM.soundEvent(String name, float fixedRange)` (calls `SoundEvent.createFixedRangeEvent`) | Extends `SelfBuilder`; registers a sound event to `Registries.SOUND_EVENT`. |
| **`GameEventBuilder<P>`**<br>→ `GameEventEntry` | `REGISTRUM.gameEvent(String name, int notificationRadius)` | Registers a sculk sensor game event `new GameEvent(radius)` with notification radius `notificationRadius` to `Registries.GAME_EVENT`. |
| **`ConditionBuilder<T, P>`**<br>→ `ConditionEntry<T>` | `REGISTRUM.condition(String name, MapCodec<T> codec)` | Registers a custom datapack load condition `ICondition` `MapCodec<T>` to `NeoForgeRegistries.Keys.CONDITION_CODECS`. |
