# 实体、流体、菜单、状态效果与药水音效构建器

除了最常用的方块和物品，`module.registrum` 还针对**实体 (`EntityBuilder`)**、**流体 (`FluidBuilder`)**、**容器菜单 (`MenuBuilder`)** 以及各类**单注册表辅助类型 (`MobEffect`、`Potion`、`SoundEvent`、`GameEvent`、`Condition`)** 提供了开箱即用的连贯构建器。

## 实体：`EntityBuilder<T extends Entity, P>`

### 基础入口

- `AbstractRegistrum#entity(String name, EntityType.EntityFactory<T> factory, MobCategory classification)`（另有省略 `name` 或传自定义 `parent` 的重载）

### 常用 API 速览

| 方法签名 | 返回类型 | 说明 |
| --- | --- | --- |
| `properties(NonNullConsumer<EntityType.Builder<T>> cons)` | `EntityBuilder<T, P>` | 修改 `EntityType.Builder` 属性，如尺寸 `sized(w, h)`、追踪距离、更新频率等 |
| `renderer(NonNullSupplier<NonNullFunction<EntityRendererProvider.Context, EntityRenderer<? super T, ?>>> renderer)` | `EntityBuilder<T, P>` | 注册客户端实体渲染器（1.21.4 的 `EntityRenderer<T, S>` 使用双泛型，支持任意 `EntityRenderState`）；仅在 `FMLEnvironment.dist.isClient()` 下求值并监听 `EntityRenderersEvent.RegisterRenderers` |
| `attributes(Supplier<AttributeSupplier.Builder> attributes)` | `EntityBuilder<T, P>` | 为 `LivingEntity` 绑定基础属性（内部挂载 `EntityAttributeCreationEvent`，仅允许调用一次） |
| `spawnPlacement(SpawnPlacementType type, Heightmap.Types heightmap, SpawnPlacements.SpawnPredicate<T> predicate)` | `EntityBuilder<T, P>` | 使用 `RegisterSpawnPlacementsEvent.Operation.OR` 登记生物自然生成规则（仅允许调用一次） |
| `spawnPlacement(SpawnPlacementType type, Heightmap.Types heightmap, SpawnPlacements.SpawnPredicate<T> predicate, RegisterSpawnPlacementsEvent.Operation operation)` | `EntityBuilder<T, P>` | 自定义 `Operation` 登记生物自然生成规则 |
| `defaultLang()` / `lang(String name)` | `EntityBuilder<T, P>` | 自动生成或显式指定实体的 `en_us` 名称 |
| `loot(NonNullBiConsumer<RegistrumEntityLootTables, EntityType<T>> cons)` | `EntityBuilder<T, P>` | 为生物设置实体战利品掉落表 |
| `tag(TagKey<EntityType<?>>... tags)` | `EntityBuilder<T, P>` | 将实体加入 `ProviderType.ENTITY_TAGS` 实体标签 |
| `register()` | `EntityEntry<T>` | 构建 `EntityType<T>` 并写入注册队列 |

> [!NOTE]
> 在当前 1.21.4 分支中，`EntityBuilder#spawnEgg(...)` 与 `#defaultSpawnEgg(...)` 处于禁用状态（尚未迁移）。如需为自定义生物添加刷怪蛋，请直接通过 `REGISTRUM.item(name + "_spawn_egg", p -> new SpawnEggItem(...))` 独立注册。

```java
public static final EntityEntry<CopperGolemEntity> COPPER_GOLEM = MyMod.REGISTRUM
    .<CopperGolemEntity>entity("copper_golem", CopperGolemEntity::new, MobCategory.MISC)
    .properties(b -> b.sized(0.7F, 1.2F).clientTrackingRange(8))
    .attributes(CopperGolemEntity::createAttributes)
    .renderer(() -> CopperGolemRenderer::new)
    .lang("Copper Golem")
    .loot((tables, type) -> tables.add(type, LootTable.lootTable()))
    .register();
```

## 流体：`FluidBuilder<T extends BaseFlowingFluid, P>`

与方块/物品类似，单一流体在 Minecraft + NeoForge 架构下需要**4 个关联对象**：流动流体 (`flowing_*`)、源流体 (`<name>`)、`FluidType`、`LiquidBlock`（液体方块）以及 `BucketItem`（流体桶）。`FluidBuilder` 将它们全部整合在同一条声明链中，并在默认情况下自动为你补全源码源体、液体方块和铁桶。

在 1.21.4 中，`FluidTypeFactory` 签名简化为 `FluidType create(FluidType.Properties properties)`，纹理资源位置改由 `clientExtension(...)` 单独注册到 `RegisterClientExtensionsEvent`。

### 入口与纹理便捷构造

- `AbstractRegistrum#fluid()` / `fluid(String name)`：创建标准 `BaseFlowingFluid.Flowing` 与默认 `FluidType`；
- `AbstractRegistrum#fluid(String name, ResourceLocation stillTexture, ResourceLocation flowingTexture)`（及其带 `FluidTypeFactory` / `FluidType` / `FluidFactory` 的完整重载组合）：自动挂载 `.clientExtension(stillTexture, flowingTexture)` 绑定纹理扩展；
- `AbstractRegistrum#fluid(String name, FluidBuilder.FluidTypeFactory typeFactory)` / `fluid(String name, NonNullSupplier<FluidType> fluidType)`：使用自定义 `FluidType` 或外部复用的 `FluidType`。

两个核心函数接口：

```java
@FunctionalInterface
public interface FluidTypeFactory {
    FluidType create(FluidType.Properties properties);
}

@FunctionalInterface
public interface FluidFactory<T> {
    T create(BaseFlowingFluid.Properties properties);
}
```

### `FluidBuilder` 全量 API 参考

| 方法签名 | 返回类型 | 说明 |
| --- | --- | --- |
| `clientExtension(NonNullSupplier<Supplier<IClientFluidTypeExtensions>> clientExtension)` | `FluidBuilder<T, P>` | 在客户端触发 `RegisterClientExtensionsEvent` 时向 `FluidType` 注册外观渲染扩展（着色、覆盖层贴图、雾效等） |
| `clientExtension(ResourceLocation stillTexture, ResourceLocation flowingTexture)` | `FluidBuilder<T, P>` | 使用内置 `DefaultFluidTypeExtension(stillTexture, flowingTexture)` 快速注册静止与流动贴图 |
| `properties(NonNullConsumer<FluidType.Properties> cons)` | `FluidBuilder<T, P>` | 配置 `FluidType.Properties`（如密度、粘度、温度、亮度 `lightLevel`、声音与路径类型） |
| `fluidProperties(NonNullConsumer<BaseFlowingFluid.Properties> cons)` | `FluidBuilder<T, P>` | 配置 `BaseFlowingFluid.Properties`（如流扩散速度 `slopeFindDistance`、`levelDecreasePerBlock`、`tickRate`） |
| `renderType(Supplier<Supplier<RenderType>> layer)` | `FluidBuilder<T, P>` | 在 `FMLClientSetupEvent` 为流动流体和源流体同时设置半透明渲染层（如 `RenderType::translucent`） |
| `defaultLang()` / `lang(String name)` | `FluidBuilder<T, P>` | 以 `fluidType.getDescriptionId()` 写入本地化键（注意流体自身翻译与桶分开配置） |
| `defaultSource()` / `source(NonNullFunction<BaseFlowingFluid.Properties, ? extends BaseFlowingFluid> factory)` | `FluidBuilder<T, P>` | 启用默认源体或在自定义源体子类时替换为自定义工厂 |
| `noSource()` | `FluidBuilder<T, P>` | 禁用自动创建源体（极少使用） |
| `defaultBlock()` / `block()` / `block(NonNullBiFunction<T, BlockBehaviour.Properties, ? extends B> factory)` | `BlockBuilder` / `FluidBuilder` | 配置该流体对应的 `LiquidBlock`；默认会生成一个仅提供占位设置的 `createNonTemplateModelBlock` |
| `noBlock()` | `FluidBuilder<T, P>` | 禁用自动创建液体方块（例如只存在于管道/容器中的气体或虚拟流体） |
| `defaultBucket()` / `bucket()` / `bucket(NonNullBiFunction<BaseFlowingFluid, Item.Properties, ? extends I> factory)` | `ItemBuilder` / `FluidBuilder` | 配置流体桶物品；默认通过 `generateFlatItem(ctx.get(), ModelTemplates.FLAT_ITEM)` 生成平面物品模型 |
| `noBucket()` | `FluidBuilder<T, P>` | 禁用自动创建对应的铁桶物品 |
| `tag(TagKey<Fluid>... tags)` / `removeTag(TagKey<Fluid>... tags)` | `FluidBuilder<T, P>` | 同时为流动流体和源流体批量追加或移除流体标签 |
| `register()` | `FluidEntry<T>` | 注册流动流体、源流体以及通过内部构建逻辑产生的 `FluidType` |

> [!TIP]
> 若调用 `.block().build()` 或 `.bucket().build()` 手动定制派生方块/桶（如为桶改名 `"Molten Brass Bucket"` 或赋予堆叠逻辑），就不能再同一链上继续调用 `.defaultBlock()` / `.defaultBucket()`，二者互斥。

### 完整流体声明示例

```java
public static final FluidEntry<BaseFlowingFluid.Flowing> LIQUID_RESIN = MyMod.REGISTRUM
    .fluid(
        "liquid_resin",
        ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "block/resin_still"),
        ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "block/resin_flow")
    )
    .properties(p -> p.density(1400).viscosity(2500).temperature(350).lightLevel(3))
    .fluidProperties(p -> p.levelDecreasePerBlock(2).tickRate(15).slopeFindDistance(3))
    .renderType(() -> RenderType::translucent)
    .lang("Liquid Resin")
    .bucket()
    .lang("Liquid Resin Bucket")
    .build()
    .register();
```

## 容器菜单与屏幕：`MenuBuilder<T, S, P>`

`MenuBuilder` 自动通过 `IMenuTypeExtension.create(...)` 注册服务端/双端容器 `MenuType<T>`，并在客户端 `RegisterMenuScreensEvent` 中完成对应的 `Screen & MenuAccess<T>` 注册。

### 三大工厂函数式接口

- `MenuBuilder.MenuFactory<T>`：`T create(MenuType<T> type, int windowId, Inventory inv)`（无额外同步字节流）
- `MenuBuilder.ForgeMenuFactory<T>`：`T create(MenuType<T> type, int windowId, Inventory inv, @Nullable RegistryFriendlyByteBuf buffer)`（带开窗时的自定义坐标/上下文参数同步）
- `MenuBuilder.ScreenFactory<M, T>`：`T create(M menu, Inventory inv, Component displayName)`

### `AbstractRegistrum` 入口与开启菜单

```java
// 1. 注册支持携带 BlockPos 的容器与界面
public static final MenuEntry<MachineMenu> MACHINE_MENU = MyMod.REGISTRUM
    .menu(
        "machine_menu",
        (type, windowId, inv, buf) -> new MachineMenu(type, windowId, inv, buf != null ? buf.readBlockPos() : BlockPos.ZERO),
        () -> MachineScreen::new
    )
    .register();

// 2. 在服务端（例如 Block#useWithoutItem）中通过 MenuEntry 一键打开界面
if (player instanceof ServerPlayer serverPlayer) {
    MACHINE_MENU.open(
        serverPlayer,
        Component.translatable("container.mymod.machine"),
        (windowId, playerInv, p) -> new MachineMenu(MACHINE_MENU.get(), windowId, playerInv, pos),
        buf -> buf.writeBlockPos(pos)
    );
}
```

## 状态效果、药水、音效、游戏事件与条件构建器

对于结构相对扁平的单对象注册类型，AnvilLib 提供了一批继承自 `AbstractBuilder` 或 `SelfBuilder` 的特化构建器，在保留 `lang`、`tag`、`onRegister` 等全套能力的同时精简了调用模板。

| 模块 / Builder | `AbstractRegistrum` 入口 | 返回 Entry | 专有 / 关键配置 |
| --- | --- | --- | --- |
| `MobEffectBuilder<T, P>` | `mobEffect(String name, NonNullSupplier<T> sup)` | `MobEffectEntry<T>` | 挂载到 `Registries.MOB_EFFECT`，支持标准 `.lang(...)` 与自定义标签 |
| `PotionBuilder<P>` | `potion(String name, MobEffectInstance... effects)` | `PotionEntry` | 继承 `SelfBuilder<Potion>`，使用可变参数构造 `new Potion(effects)` |
| `SoundEventBuilder<P>` | `soundEvent(String name)` / `soundEvent(String name, float fixedRange)` | `SoundEventEntry` | 继承 `SelfBuilder<SoundEvent>`，支持可变距离 (`createVariableRangeEvent`) 与固定范围 (`createFixedRangeEvent`) |
| `GameEventBuilder<P>` | `gameEvent(String name, int radius)` | `GameEventEntry` | 注册幽匿感测体振动接收 `GameEvent`，可配置传播半径（默认常见 16） |
| `ConditionBuilder<T, P>` | `condition(String name, MapCodec<T> mapCodec)` | `ConditionEntry<T>` | 注册 NeoForge `NeoForgeRegistries.CONDITION_SERIALIZERS`（用于配方/数据包条件判断） |
| `RecipeTypeBuilder<T, P>` + `RecipeSerializerBuilder<T, P>` | `recipe(String name, MapCodec<T> codec, StreamCodec<RegistryFriendlyByteBuf, T> streamCodec)` | `RecipeEntry<T>` | 一体化同时注册 `RecipeType<T>` 与 `RecipeSerializer<T>`，并通过 `RecipeEntry#type()` / `#serializer()` 访问 |
| `NoConfigBuilder<R, T, P>` | `generic(...)` / `simple(...)` | `RegistryEntry<R, T>` | 为任何注册表快速注册无需复杂构造回调的对象 |

```java
public static final PotionEntry HASTE_ELIXIR = MyMod.REGISTRUM
    .potion("haste_elixir", new MobEffectInstance(MobEffects.DIG_SPEED, 3600, 1))
    .register();

public static final SoundEventEntry MACHINE_HUM = MyMod.REGISTRUM
    .soundEvent("machine_hum", 16.0F)
    .register();
```
