# 实体、流体与菜单构建 (`EntityBuilder`、`FluidBuilder`、`MenuBuilder`)

本节覆盖游戏中除常规方块和物品外的三大复合载体对象：具有渲染器、属性和自然生成条件的实体（`EntityType`）；自带静止/流动双形态、`FluidType`、液体方块和铁桶物品的流体（`Fluid`）；以及同时注册容器菜单类型和客户端 GUI 界面的 `MenuType`。

## 实体构建器 (`EntityBuilder`)

通过 `REGISTRUM.entity(name, factory, classification)`（或 `.object(name).entity(factory, classification)`）获取 `EntityBuilder<T, P>`。默认配置了 `defaultLang()`（依据 `EntityType::getDescriptionId` 生成本地化文本）。

### 核心方法一览

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `properties(NonNullConsumer<EntityType.Builder<T>> cons)` | `EntityBuilder<T, P>` | 修改原版 `EntityType.Builder<T>` 属性（如 `.sized(0.8f, 1.8f)`、`.clientTrackingRange(8)`、`.fireImmune()`），可叠加调用 |
| `renderer(NonNullSupplier<NonNullFunction<EntityRendererProvider.Context, EntityRenderer<? super T>>> renderer)` | `EntityBuilder<T, P>` | 仅客户端注册实体渲染器；内部校验 `FMLEnvironment.dist.isClient()` 并监听 `EntityRenderersEvent.RegisterRenderers` |
| `attributes(Supplier<AttributeSupplier.Builder> attributes)` | `EntityBuilder<T, P>` | 监听 `EntityAttributeCreationEvent` 注册生物属性（目标实体必须继承 `LivingEntity`）。同一 Builder 重复调用会抛出 `IllegalStateException` |
| `spawnPlacement(SpawnPlacementType type, Heightmap.Types heightmap, SpawnPredicate<T> predicate, RegisterSpawnPlacementsEvent.Operation operation)` | `EntityBuilder<T, P>` | 注册自然刷新放置规则（如 `SpawnPlacementTypes.ON_GROUND`、`Heightmap.Types.MOTION_BLOCKING_NO_LEAVES`、`RegisterSpawnPlacementsEvent.Operation.REPLACE`）。重复调用会抛出 `IllegalStateException` |
| `spawnEgg(int primaryColor, int secondaryColor)` | `ItemBuilder<? extends SpawnEggItem, EntityBuilder<T, P>>` | 注册 `<name>_spawn_egg` 对应的 `DeferredSpawnEggItem`，默认加入原版 `CreativeModeTabs.SPAWN_EGGS` 并使用 `item/template_spawn_egg` 模型（标记 `@Deprecated`，遵循上游对刷怪蛋构建的兼容说明） |
| `defaultSpawnEgg(int primaryColor, int secondaryColor)` | `EntityBuilder<T, P>` | 以默认配置直接完成刷怪蛋注册并退回 `EntityBuilder`（同标记 `@Deprecated`） |
| `defaultLang()` / `lang(String name)` | `EntityBuilder<T, P>` | 配置或覆盖实体的本地化翻译文本 |
| `loot(NonNullBiConsumer<RegistrumEntityLootTables, EntityType<T>> cons)` | `EntityBuilder<T, P>` | 配置实体掉落物表数据生成 |
| `tag(TagKey<EntityType<?>>... tags)` | `EntityBuilder<T, P>` | 添加 `EntityType` 标签（委托给 `ProviderType.ENTITY_TAGS`） |
| `aliasFrom(ResourceLocation... oldNames)` | `EntityBuilder<T, P>` | 设置重命名别名；若调用了 `.spawnEgg(...)` / `.defaultSpawnEgg(...)`，也会自动在物品注册表中添加 `<oldName>_spawn_egg` -> `<newName>_spawn_egg` 别名 |
| `register()` | `EntityEntry<T>` | 完成声明并返回 `EntityEntry<T>` |

### `EntityEntry<T>` 包装 API

- `create(Level world)` -> `@Nullable T`：直接调用 `get().create(world)` 在世界中创建实体实例。
- `is(Entity t)` -> `boolean`：安全判断实体非空且类型与当前条目匹配。
- `EntityEntry.cast(RegistryEntry<EntityType<?>, EntityType<T>> entry)`：静态强转辅助方法。

## 流体构建器 (`FluidBuilder`)

一个完整可用的 Minecraft/NeoForge 流体至少涉及 4 个独立注册项：**流动流体（`flowing_<name>`）**、**源流体（`<name>`）**、**`FluidType`（`<name>`）**，以及可选的**液体方块 `LiquidBlock`（`<name>`）**和**铁桶物品 `BucketItem`（`<name>_bucket`）**。

`FluidBuilder<T extends BaseFlowingFluid, P>` 将这些对象全部聚拢在一个流式链中，并且需要注意：**`FluidBuilder` 本身的底层条目代表“流动流体 `flowing_<name>`”**，而源流体、流体类型、方块和桶均围绕基础名 `sourceName = name` 生成。

### 创建入口（`AbstractRegistrum.fluid` / `FluidBuilder.create`）

`AbstractRegistrum` 提供两组共 6 种重载来构建流体，涵盖默认实现或自定义流体类/已有 `FluidType`：

1. 使用默认 `FluidType` 与 `BaseFlowingFluid.Flowing`：
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture)`
   - 以及前置 `.object(name)` 的无参重载 `fluid(ResourceLocation stillTexture, ResourceLocation flowingTexture)`
2. 自定义 `FluidTypeFactory`（`FluidType.Properties, ResourceLocation still, ResourceLocation flowing -> FluidType`）：
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, FluidTypeFactory typeFactory)`
3. 复用已注册或外部提供的 `NonNullSupplier<FluidType>`：
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, NonNullSupplier<FluidType> fluidType)`
4. 自定义流动流体子类（`NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory`）：
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory)`
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, FluidTypeFactory typeFactory, NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory)`
   - `fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture, NonNullSupplier<FluidType> fluidType, NonNullFunction<BaseFlowingFluid.Properties, T> fluidFactory)`

通过 `FluidBuilder.create(...)` 构建时默认附带：`defaultLang()`、`defaultSource()`、`defaultBlock()`、`defaultBucket()`。

### 核心方法与状态约束

- `properties(NonNullConsumer<FluidType.Properties> cons)`：修改 `FluidType.Properties`（如密度、粘度、温度、亮度 `lightLevel`、是否允许游泳）。
  - 注意：如果在同命名空间下已经声明了同名方块的自定义翻译，Registrum 会自动将 `FluidType` 的 `descriptionId` 同步为方块描述键并取消重复 `LANG` 生成；否则使用 `fluid.<modid>.<name>`。
- `fluidProperties(NonNullConsumer<BaseFlowingFluid.Properties> cons)`：修改 `BaseFlowingFluid.Properties`（如 `slopeFindDistance`、`levelDecreasePerBlock`、`explosionResistance`、`tickRate`）。系统已预先挂接好 `.bucket(...)` 与 `.block(...)` 查找，通常无需手动指定。
- `renderType(Supplier<Supplier<RenderType>> layer)`：客户端安全设置流动与源流体的半透明/裁剪渲染层（如 `RenderType::translucent`）。
- `defaultSource()` / `source(NonNullFunction<BaseFlowingFluid.Properties, ? extends BaseFlowingFluid> factory)`：选择默认 `BaseFlowingFluid.Source` 或自定义源流体类。**注意先后顺序**：如果计划自定义 `bucket(...)` 且修改了源流体工厂，必须先调用 `source(...)` 或在默认状态下注册；直接先叫 `.source(...)` 后又叫 `.defaultSource()` 会抛出 `IllegalStateException`。
- `defaultBlock()` / `block()` / `block(NonNullBiFunction<T, BlockBehaviour.Properties, ? extends B> factory)` / `noBlock()`：配置液体方块。其中 `.block(...)` 返回 `BlockBuilder`，并自动继承 `FluidType.getLightLevel()` 作为亮度及附带 `particle` 贴图的方块模型。若调用 `noBlock()` 则不创建方块（不可同时与 `block()` 调用，否则抛出 `IllegalStateException`）。
- `defaultBucket()` / `bucket()` / `bucket(NonNullBiFunction<BaseFlowingFluid, Item.Properties, ? extends I> factory)` / `noBucket()`：配置桶装物品（堆叠数 `1`、合成返还 `Items.BUCKET`、生成 `item/<name>_bucket` 模型）。注意：调用 `.bucket(...)` 前 `this.source` 必须已经初始化（如果还没有自定义源，请先调用 `.source(BaseFlowingFluid.Source::new)`，或者干脆在默认配置链下保留 `defaultSource()`；若未配置 source 即调用 `.bucket()` 会抛出 `IllegalStateException("Cannot create a bucket before creating a source block")`）。
- `tag(TagKey<Fluid>... tags)` / `removeTag(TagKey<Fluid>... tags)`：**同时**向“流动流体”与“源流体”写入或移除流体标签，因此只需在链上写一次 `FluidTags.WATER`，两条流体条目都会正确进标签！
- `aliasFrom(ResourceLocation... oldNames)`：传入旧的基础名称 `oldName`，Registrum 会按真实创建情况自动分别注册：`flowing_<oldName>`（流动流体）、`<oldName>`（源流体）、`<oldName>`（FluidType，仅自建时）、`<oldName>`（液体方块，仅创建时）与 `<oldName>_bucket`（铁桶，仅创建时）的 NeoForge 别名。

### `FluidEntry<T>` 包装 API

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `getSource()` | `S extends BaseFlowingFluid` | 获取对应的源流体实例 |
| `getType()` | `FluidType` | 获取绑定的 NeoForge `FluidType` |
| `getBlock()` | `Optional<B extends Block>` | 若构建时创建了液体方块则返回对应 `LiquidBlock` |
| `getBucket()` | `Optional<I extends Item>` | 若存在非空的桶装物品则返回（否则为空） |
| `is(R entry)` | `boolean` | 覆写以基于 `get().isSame((Fluid) entry)` 同时匹配流动流体与源流体 |

## 菜单构建器 (`MenuBuilder`)

`MenuBuilder<T extends AbstractContainerMenu, S extends Screen & MenuAccess<T>, P>` 同时解决服务端 `MenuType` 注册和客户端 `RegisterMenuScreensEvent` 界面绑定的分离问题，并天然接入 NeoForge 的 `IMenuTypeExtension` 支持从服务端同步额外初始化数据 (`RegistryFriendlyByteBuf`) 到客户端屏幕。

通过 `REGISTRUM.menu(name, factory, screenFactory)` 创建，提供两种菜单工厂函数式接口：

- `MenuBuilder.MenuFactory<T>`：`T create(MenuType<T> type, int windowId, Inventory inv)`（无额外网络数据包，适用于纯物品栏菜单）。
- `MenuBuilder.ForgeMenuFactory<T>`：`T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer)`（带额外同步字节缓冲，注意客户端创建菜单时 `buffer` 由网络包传入；若通过 `MenuEntry.create(id, inv)` 无网络包直调时 `buffer` 可能为 `null`）。
- `MenuBuilder.ScreenFactory<M, T>`：`T create(M menu, Inventory inv, Component displayName)`（通常传 `MyScreen::new`）。同样建议通过 `() -> MyScreen::new` 延迟提供 `NonNullSupplier<ScreenFactory<T, S>>`，确保服务端永远不会加载原版客户端 `Screen` 类。

### `MenuEntry<T>` 包装 API

`MenuBuilder.register()` 返回 `MenuEntry<T>`：

- `create(int windowId, Inventory playerInv)` -> `T`
- `asProvider()` -> `MenuConstructor`
- `open(ServerPlayer player, Component displayName)`
- `open(ServerPlayer player, Component displayName, Consumer<RegistryFriendlyByteBuf> extraData)`
- `open(ServerPlayer player, Component displayName, MenuConstructor provider)`
- `open(ServerPlayer player, Component displayName, MenuConstructor provider, Consumer<RegistryFriendlyByteBuf> extraData)`

## 完整实用示例：实体、流体与自定义容器菜单

```java
package com.example.examplemod.registry;

import com.example.examplemod.ExampleMod;
import com.example.examplemod.client.render.SparkProjectileRenderer;
import com.example.examplemod.client.screen.CrusherScreen;
import com.example.examplemod.entity.SparkProjectile;
import com.example.examplemod.menu.CrusherMenu;
import dev.anvilcraft.lib.v2.registrum.util.entry.EntityEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.FluidEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.MenuEntry;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.MobCategory;
import net.neoforged.neoforge.fluids.BaseFlowingFluid;

public class ModWorldAndMenus {
    // 1. 投射物实体注册（含客户端渲染器）
    public static final EntityEntry<SparkProjectile> SPARK = ExampleMod.REGISTRUM
        .entity("spark_projectile", SparkProjectile::new, MobCategory.MISC)
        .properties(b -> b.sized(0.4f, 0.4f).clientTrackingRange(4).updateInterval(10))
        .renderer(() -> SparkProjectileRenderer::new)
        .lang("Spark Projectile")
        .register();

    // 2. 熔融金属流体（流动 + 源 + FluidType + 方块 + 铁桶）
    public static final FluidEntry<BaseFlowingFluid.Flowing> MOLTEN_IRON = ExampleMod.REGISTRUM
        .fluid(
            "molten_iron",
            ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "block/molten_iron_still"),
            ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "block/molten_iron_flow")
        )
        .lang("Molten Iron")
        .properties(p -> p.temperature(1800).lightLevel(12).density(4000).viscosity(6000))
        .fluidProperties(p -> p.tickRate(30).levelDecreasePerBlock(2).explosionResistance(100.0f))
        .renderType(() -> RenderType::solid)
        .tag(FluidTags.LAVA)
        .source(BaseFlowingFluid.Source::new) // 若后续紧接定制 bucket()，务必先声明 source
        .bucket()
            .tab(ModCreativeTabs.MAIN_TAB.getKey())
            .lang("Bucket of Molten Iron")
            .build()
        .block()
            .build()
        .register();

    // 3. 带 BlockPos 额外网络同步的机器菜单与 GUI 屏幕绑定
    public static final MenuEntry<CrusherMenu> CRUSHER_MENU = ExampleMod.REGISTRUM
        .menu(
            "crusher",
            CrusherMenu::fromNetwork,
            () -> CrusherScreen::new
        )
        .register();

    public static void register() {}
}
```
