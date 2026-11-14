# Registrum 注册与数据生成系统：核心架构 (`module.registrum`)

<BranchContextCard branch="26.3" />

`module.registrum`（构件名 `anvillib-registrum-neoforge-26.3`，包名 `dev.anvilcraft.lib.v2.registrum`）是基于 [Registrate](https://github.com/IThundxr/Registrate) 深度改造并适配 Minecraft 26.3 / NeoForge 26.3 的一站式链式注册与数据生成框架。

在传统 NeoForge 开发中，新增一个方块往往要分散在多个文件中分别编写：`DeferredRegister<Block>`、`DeferredRegister<Item>`、`BlockEntityType`、方块状态模型 Provider、物品模型 Provider、战利品表 Provider、标签 Provider 以及英文语言文件 Provider。`Registrum` 将这些步骤收敛在同一条链式 Builder 调用中，并在 `RegisterEvent` 与 `GatherDataEvent.Client` 阶段自动触发对应的注册与数据生成任务。

此外，AnvilLib 的 `Registrum` 在原版 Registrate 基础上扩展了大量专属构建器与客户端功能：
- **创造模式标签页分节横幅（`CreativeTabSections` / `CreativeTabSection`）与 4×4 变体选择器叠加层（`CreativeVariantPickerRegistry` / `CreativeVariantPickerOverlay`）**；
- **全套 NeoForge 26.3 专项构建器**：`DataComponentBuilder`、`DataComponentPredicateBuilder`、`AttachmentBuilder`、`RecipeTypeBuilder` / `RecipeSerializerBuilder`、`ConditionBuilder`、`BiomeModifierBuilder`、`GlobalLootModifierBuilder`、`StructureModifierBuilder`、`SoundEventBuilder`、`PotionBuilder`、`MobEffectBuilder`、`GameEventBuilder`、`PoiTypeBuilder` / `VillagerProfessionBuilder` / `VillagerTypeBuilder` 与 `BiomeBuilder`；
- **注册项重命名别名自动映射（`aliasFrom` / `addAlias`）**：在方块重命名时自动同步别名化其派生的 `BlockItem`、`BlockEntityType`、刷怪蛋或流体桶。

本模块按功能域拆分为 6 篇子文档：
- **本篇（核心架构：Registrum 与 RegistryEntry）**：详解 `Registrum`、`AbstractRegistrum`、`Builder`、`AbstractBuilder`、`NoConfigBuilder`、`SelfBuilder`、`BuilderCallback`、`RegistryEntry`、`LazyRegistryEntry`、`OneTimeEventReceiver`、`RegistrumDistExecutor` 与 `Sequence`。
- **[方块与方块实体构建器](./block-and-be)**：详解 `BlockBuilder`、`BlockEntry`、`BlockEntityBuilder`、`BlockEntityEntry`。
- **[物品、创造模式标签页与分组变体选择器](./item-and-creativetab)**：详解 `ItemBuilder`、`ItemEntry`、`ItemProviderEntry`、`CreativeTabBuilder`、`CreativeModeTabModifier`、`CreativeTabSection` / `CreativeTabSections` 与 `CreativeVariantPicker*`。
- **[实体、流体、菜单、状态效果与药水音效构建器](./entity-fluid-menu)**：详解 `EntityBuilder`、`FluidBuilder`、`MenuBuilder`、`MobEffectBuilder`、`PotionBuilder`、`SoundEventBuilder`、`GameEventBuilder` 与 `ConditionBuilder`。
- **[村民、生物群系、数据组件、附件与修改器构建器](./data-villager-modifier)**：详解 `DataComponentBuilder`、`DataComponentPredicateBuilder`、`AttachmentBuilder`、`RecipeTypeBuilder` / `RecipeSerializerBuilder`、村民系列构建器、`BiomeBuilder` 与三大 Modifier 构建器。
- **[数据生成連携：模型、配方、战利品表、标签与语言](./datagen-providers)**：详解 `ProviderType`、`GeneratorType`、`DataGenContext`、`DataProviderInitializer`、`DataIngredient` 及全套 `Registrum*Provider`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.3`，则已自动包含本模块；若仅需单独引入 `registrum` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-registrum-neoforge-26.3:2.0.0")
}
```

---

## 二、 快速上手与完整代码示例

```java
package com.example.mymod;

import com.example.mymod.init.ModBlocks;
import com.example.mymod.init.ModCreativeTabs;
import com.example.mymod.init.ModItems;
import dev.anvilcraft.lib.v2.registrum.Registrum;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "my_mod";

    // 1. 创建绑定当前 modId 的 Registrum 单例（自动向 ModContainer.getEventBus() 注册事件监听器）
    public static final Registrum REGISTRUM = Registrum.create(MOD_ID);

    public MyMod() {
        // 2. 按顺序触发各个注册类的静态初始化
        ModCreativeTabs.register();
        ModItems.register();
        ModBlocks.register();
    }
}
```

---

## 三、 核心类与接口 API 详解

### 1. `Registrum` 与 `AbstractRegistrum<S>`（注册与数据生成总控中心）

`Registrum` 继承自 `AbstractRegistrum<Registrum>`。

| 方法分类 | 方法签名 | 说明与边界行为 |
| :--- | :--- | :--- |
| **创建与总线绑定** | `public static Registrum create(String modid)`<br>`public S registerEventListeners(IEventBus bus)` | 创建 `Registrum` 实例，自动通过 `ModList.get().getModContainerById(modid)` 获取 Mod 事件总线并注册 `RegisterEvent`、`BuildCreativeModeTabContentsEvent`、`FMLCommonSetupEvent` 及（DataGen 环境下）`GatherDataEvent.Client`。 |
| **当前名称状态** | `public S object(String name)`<br>`protected String currentName()` | 设置后续无名构建器（如 `.block(factory)`、`.item(factory)`）默认使用的注册名 `currentName`。注意：`AbstractRegistrum` 不是线程安全的，请在主线程按顺序初始化注册类。 |
| **默认创造标签页** | `public S defaultCreativeTab(ResourceKey<CreativeModeTab> tab)`<br>`public S defaultCreativeTab(RegistryEntry<CreativeModeTab, CreativeModeTab> tab)`<br>`public S modifyCreativeModeTab(ResourceKey<CreativeModeTab>, Consumer<CreativeModeTabModifier>)` | 设置后续创建的 `ItemBuilder` 默认加入的 `CreativeModeTab`（初始默认为 `CreativeModeTabs.SEARCH`），或向指定标签页追加自定义修改器回调。 |
| **自定义注册表** | `public <R> ResourceKey<Registry<R>> makeRegistry(String name, Function<ResourceKey<Registry<R>>, RegistryBuilder<R>> builder)`<br>`public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec)`<br>`public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec, @Nullable Codec<R> networkCodec)` | 自动监听 `NewRegistryEvent` 创建普通注册表，或监听 `NewDatapackRegistryEvent`（调用 `event.worldRegistry(...)`）创建数据包注册表（支持可选的客户端同步 `networkCodec`）。 |
| **旧 ID 别名映射** | `public <R> S addAlias(ResourceKey<? extends Registry<R>> registryType, Identifier oldName, Identifier newName)` | 当方块或物品重命名时，在 `onRegisterLate` 阶段向原版 `Registry#addAlias` 注册旧名到新名的映射，防止旧存档中的方块状态或物品丢失（更推荐在具体 Builder 上调用 `.aliasFrom(oldId)`）。 |
| **已注册条目查询** | `public <R, T extends R> RegistryEntry<R, T> get(ResourceKey<? extends Registry<R>> type)`<br>`public <R, T extends R> RegistryEntry<R, T> get(String name, ResourceKey<? extends Registry<R>> type)`<br>`public <R, T extends R> Optional<RegistryEntry<R, T>> getOptional(String name, ResourceKey<? extends Registry<R>> type)`<br>`public <R, T extends R> Collection<RegistryEntry<R, T>> getAll(ResourceKey<? extends Registry<R>> type)` | 查询当前 `Registrum` 实例中已声明的 `RegistryEntry`（例如获取由 `BlockBuilder#simpleItem()` 派生注册的同名 `BlockItem`）。 |
| **注册完成回调** | `public <R, T extends R> S addRegisterCallback(String name, ResourceKey<? extends Registry<R>> registryType, NonNullConsumer<? super T> callback)`<br>`public <R> S addRegisterCallback(ResourceKey<? extends Registry<R>> registryType, Runnable callback)`<br>`public <R> boolean isRegistered(ResourceKey<? extends Registry<R>> registryType)` | 注册单个条目注册完成时的回调，或整个注册表完成注册后的回调（在 `EventPriority.LOWEST` 的 `onRegisterLate` 中触发）。注意：开发环境下若存在未兑现的悬空回调（声明了回调但从未调用 `.register()`），会在 `onRegister` 时直接抛出 `IllegalStateException`。 |
| **语言与数据生成** | `public MutableComponent addLang(String type, Identifier id, String localizedName)`<br>`public MutableComponent addLang(String type, Identifier id, String suffix, String localizedName)`<br>`public MutableComponent addRawLang(String key, String value)`<br>`public <T> S addDataGenerator(GeneratorType<? extends T> type, NonNullConsumer<? extends T> cons)`<br>`public <P, R> S setDataGenerator(...)`<br>`public <P> Optional<P> getDataProvider(GeneratorType<P> type)`<br>`public DataProviderInitializer getDataGenInitializer()` | 直接向 `ProviderType.LANG` 注入自定义翻译键并返回对应的 `MutableComponent`；或注册与特定条目无关的全局 DataGen 回调（如全局合成表、全局语言条目）。 |
| **各领域构建器入口** | `simple(...)` / `generic(...)`<br>`item(...)` / `block(...)` / `blockEntity(...)`<br>`entity(...)` / `fluid(...)` / `menu(...)`<br>`creativeTab(...)` / `defaultCreativeTab(...)`<br>`attachment(...)` / `dataComponent(...)` / `dataComponentPredicate(...)`<br>`biomeModifier(...)` / `glm(...)` / `structureModifier(...)`<br>`condition(...)` / `soundEvent(...)` / `recipe(...)`<br>`gameEvent(...)` / `potion(...)` / `mobEffect(...)`<br>`poiType(...)` / `villagerProfession(...)` / `villagerType(...)` / `biome(...)` | 开启对应类型的链式 Builder（每个专项 Builder 的详细用法见后续子章节）。 |

### 2. `Builder<R, T, P, S>` 与 `AbstractBuilder<R, T, P, S>`（构建器基类）

所有具体构建器（如 `BlockBuilder`、`ItemBuilder`）均实现 `Builder` 并继承自 `AbstractBuilder`。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `RegistryEntry<R, T> register()` | `RegistryEntry<R, T>` | 完成构建并将条目交由 `AbstractRegistrum` 排队延迟注册，返回 `RegistryEntry` 包装句柄。 |
| `default P build()` | `P`（父对象） | 调用 `register()` 并返回父对象 `getParent()`（例如在 `BlockBuilder.item()...build()` 中返回外层的 `BlockBuilder` 继续配置方块）。 |
| `default <D> S setData(GeneratorType<? extends D> type, NonNullBiConsumer<DataGenContext<R, T>, D> cons)` | `S` | 为当前条目设置指定 `GeneratorType` 的数据生成回调（**多次调用同一 `type` 会覆盖之前的回调**，可用于覆盖默认的模型或掉落表生成）。 |
| `default <D> S addMiscData(GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | `S` | 为当前条目追加数据生成回调（多次调用不会覆盖）。 |
| `default <D> S dataMap(DataMapType<R, D> type, D val)`（及接收 `NonNullFunction` / `NonNullBiFunction` 的重载） | `S` | 为当前条目生成 NeoForge DataMap 数据（如炉燃料燃烧时间、堆肥概率、氧化/涂蜡表等）。 |
| `public final <TP extends TagsProvider<R> & RegistrumTagsProvider<R>> S tag(ProviderType<? extends TP> type, TagKey<R>... tags)`<br>`public final <TP extends ...> S removeTag(ProviderType<TP> type, TagKey<R>... tags)`<br>`public S asOptional()` | `S` | 为当前条目绑定或移除标签。若调用了 `asOptional()`，生成的 JSON 标签中该条目将写为可选条目（`"required": false`）。 |
| `public S lang(NonNullFunction<T, String> langKeyProvider)`<br>`public S lang(NonNullFunction<T, String> langKeyProvider, String name)` | `S` | 设置当前条目的语言翻译生成规则（单参重载自动将注册名转为首字母大写的英文短语）。 |
| `public S aliasFrom(Identifier... oldNames)` | `S` | 声明该条目曾使用过的旧注册名。在 `register()` 时会自动为自身及已创建的派生条目（如 `BlockItem`、`BlockEntityType`、刷怪蛋、流体桶）注册 `Registry#addAlias`。 |
| `default S onRegister(NonNullConsumer<? super T> callback)`<br>`default <OR> S onRegisterAfter(ResourceKey<? extends Registry<OR>> dependencyType, NonNullConsumer<? super T> callback)` | `S` | 注册当前条目在 `RegisterEvent` 中实例化完成后的回调（`onRegisterAfter` 会确保在依赖注册表 `dependencyType` 完成注册后再执行）。 |
| `default <R2, T2 extends R2, P2, S2 extends Builder<R2, T2, P2, S2>> S2 transform(NonNullFunction<S, S2> func)` | `S2` | 在链式调用中套用外部复用的构建器转换函数（如公共属性模板）。 |
| `getOwner()` / `getParent()` / `getName()` / `getRegistryKey()` / `getResourceKey()` / `asSupplier()` / `get()` / `getEntry()` | 对应类型 | 获取所属 `Registrum`、父对象、名称、注册表键、条目 `ResourceKey<R>`、不持有 Builder 强引用的 `LazyRegistryEntry` 以及已注册实例。 |

### 3. `NoConfigBuilder`、`SelfBuilder` 与 `RegistryEntry` 体系

| 类名 | 签名与核心方法 | 说明 |
| :--- | :--- | :--- |
| `NoConfigBuilder<R, T, P>` | `extends AbstractBuilder<R, T, P, NoConfigBuilder<R, T, P>>` | 适用于无需额外专用配置方法的简单注册项（由 `registrum.generic(...)` 或 `registrum.simple(...)` 创建）。 |
| `SelfBuilder<T, P, S>` | `extends AbstractBuilder<T, T, P, S>` | 注册表基类型 `R` 与具体条目类型 `T` 相同的构建器基类（如 `PotionBuilder`、`SoundEventBuilder`），`register()` 返回 `SelfEntry<T>`。 |
| `RegistryEntry<R, S extends R>` | `extends DeferredHolder<R, S> implements NonNullSupplier<S>` | 包装 NeoForge 的 `DeferredHolder<R, S>`，额外提供：<br>• `<X, Y extends X> RegistryEntry<X, Y> getSibling(ResourceKey<? extends Registry<X>> registryType)` / `getSibling(Registry<X>)`：获取同名派生条目（如从 `BlockEntry` 获取同名的 `Item` 或 `BlockEntityType`）；<br>• `Optional<RegistryEntry<R, S>> filter(Predicate<R> predicate)`；<br>• `<X> boolean is(X entry)`：判断 `get() == entry`。 |
| `LazyRegistryEntry<R, T>` | `implements NonNullSupplier<T>` | 在首次调用 `get()` 解析出 `RegistryEntry` 后立即将内部的 `supplier` 置为 `null`，释放对构建期 `Builder` 对象的引用以便 GC 回收。 |
| `OneTimeEventReceiver<T>` | `addModListener(...)` / `addForgeListener(...)` / `unregister(...)` | （`@ApiStatus.Internal`）单次触发事件接收器：通过 `AtomicBoolean` 保证监听回调只执行一次，并在 `FMLLoadCompleteEvent` 时统一从事件总线卸载，避免启动期监听器常驻内存。 |
| `Sequence<T>` | `Sequence.create()` / `run(Runnable)` / `next(Supplier<T>)` / `next(T)` | 顺序执行一系列初始化动作或表达式的链式辅助类。 |
