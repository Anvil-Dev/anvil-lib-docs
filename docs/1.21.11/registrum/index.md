# 核心架构：Registrum 与 RegistryEntry

`module.registrum` 是 AnvilLib 面向 NeoForge 的流式注册与数据生成框架（基于 Registrate 演进并针对 AnvilCraft 生态扩展）。它通过单一入口对象收集**注册项**、**注册回调**、**客户端扩展**、**创造模式标签页条目**与**数据生成回调**，并在正确的 Mod 生命周期事件中统一提交。

本分支的 `Registrum` 运行在 `net.neoforged.neoforge` 1.21.11 体系下：构建器在构造原版注册对象时会自动调用 `properties.setId(getResourceKey())`，客户端扩展通过 `RegisterClientExtensionsEvent` 挂载，数据生成通过统一的 `GatherDataEvent` 驱动，并提供 `PropertyDispatchWrap`、`DataComponentPredicateBuilder` 以及基于 NeoForge 原生同步接口的 `AttachmentBuilder`。

## 快速上手与完整示例

下面演示在一个独立 Mod 中创建静态 `Registrum` 实例，并在主类构造函数完成初始化。

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.Registrum;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

@Mod(MyMod.MOD_ID)
public class MyMod {
    public static final String MOD_ID = "mymod";

    // 创建即自动向当前 ModContainer 的 IEventBus 注册监听器
    public static final Registrum REGISTRUM = Registrum.create(MOD_ID);

    public MyMod(IEventBus modEventBus) {
        // 引用并加载各模块静态注册类，确保类加载在 RegisterEvent 之前完成
        ModBlocks.register();
        ModItems.register();
        ModAttachments.register();
    }
}
```

### 按组（`object`）注册关联对象

使用 `object(name)` 可以为同名对象切换上下文并连续创建方块、物品或其他派生条目：

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntry;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;

public class ModBlocks {
    public static final BlockEntry<Block> TITANIUM_BLOCK = MyMod.REGISTRUM
        .object("titanium_block")
        .block(Block::new)
        .properties(p -> p.strength(5.0F, 6.0F).sound(SoundType.METAL).requiresCorrectToolForDrops())
        .simpleItem()
        .register();

    public static void register() {
        // 触发静态字段初始化
    }
}
```

> [!IMPORTANT]
> 请务必在 Mod 主类构造函数或 `FMLCommonSetupEvent` 之前的类加载阶段触发所有静态 `RegistryEntry` 字段所在类的初始化。若在 `RegisterEvent` 触发之后才首次调用 `.register()`，对应条目将无法写入注册表并抛出异常。

## 入口类：`Registrum` 与 `AbstractRegistrum<S>`

`Registrum` 继承自 `AbstractRegistrum<Registrum>`，负责向当前 Mod 事件总线挂载内部监听器。若需要自定义事件注册流程，可直接继承 `AbstractRegistrum<MyRegistrum>` 并在构造后手动调用 `registerEventListeners(IEventBus)`。函数式接口均来自 `dev.anvilcraft.lib.v2.util.nullness.*`。

### 核心生命周期方法

| 方法 / 字段 | 说明 |
| --- | --- |
| `Registrum.create(String modid)` | 创建实例并自动从 `ModList` 获取对应 `IEventBus` 完成事件绑定 |
| `AbstractRegistrum#registerEventListeners(IEventBus bus)` | 注册 `RegisterEvent`（含 `EventPriority.LOWEST` 的延迟阶段）、`BuildCreativeModeTabContentsEvent`、`GatherDataEvent` 与 `FMLLoadCompleteEvent` 回调 |
| `AbstractRegistrum#getModid()` | 返回当前注册表所属的命名空间 |
| `AbstractRegistrum#object(String name)` | 设定当前链式调用的默认注册名，返回自身 `S` |
| `AbstractRegistrum#defaultCreativeTab(ResourceKey<CreativeModeTab> tab)` / `(RegistryEntry<CreativeModeTab, CreativeModeTab> tab)` | 将已注册标签页设为后续 `ItemBuilder` 的默认创造模式标签页 |
| `AbstractRegistrum#doDatagen()` | 返回 `NonNullSupplier<Boolean>`，指示当前是否处于数据生成环境（`DatagenModLoader.isRunningDataGen()`） |
| `AbstractRegistrum#isRegistered(ResourceKey<? extends Registry<R>> type)` | 判断指定注册表是否已完成 `RegisterEvent` 注册 |
| `AbstractRegistrum#getDataGenInitializer()` | 返回 `DataProviderInitializer`，用于登记动态数据包注册表或调整 Provider 依赖顺序 |
| `AbstractRegistrum#getDataProvider(GeneratorType<P> type)` | 在数据生成期间按 `GeneratorType` 获取已构建或已激活的 Provider / Generator 实例 |
| `AbstractRegistrum#get(ResourceKey<R>)` / `get(String name, ResourceKey<? extends Registry<R>>)` | 按注册名检索已构建的 `RegistryEntry<R, T>` |
| `AbstractRegistrum#getAll(ResourceKey<? extends Registry<R>>)` | 返回该注册表下已登记的全部 `RegistryEntry` 集合 |

### 回调、重命名别名与修饰配置

| 方法签名 | 作用与调用时机 |
| --- | --- |
| `addRegisterCallback(String name, ResourceKey<? extends Registry<R>> registryType, NonNullConsumer<? super T> callback)` | 为某个特定条目追加注册回调（在目标注册表 `RegisterEvent` 创建对象后执行） |
| `addRegisterCallback(ResourceKey<? extends Registry<R>> registryType, Runnable callback)` | 为整张注册表追加回调；当该注册表触发完毕且本实例完成了注册项提交后执行 |
| `addAlias(ResourceKey<? extends Registry<R>> registryType, Identifier oldName, Identifier newName)` | 为旧版本存档中的资源路径登记向新名称的映射别名，会在 `RegisterEvent` 中提交到 `Registry#addAlias` |
| `simple(P parent, String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<R> factory)` | 直接构建无配置 `NoConfigBuilder`，用于注册自定义注册表或通用对象 |
| `generic(P parent, String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<T> factory)` | 注册泛用条目（返回 `NoConfigBuilder<R, T, P>`），不要求实现特殊子类逻辑 |
| `modifyCreativeModeTab(ResourceKey<CreativeModeTab> tab, NonNullConsumer<CreativeModeTabModifier> modifier)` | 在指定原版或自定义创造模式标签页中添加展示物品 |
| `addRawLang(String key, String value)` | 直接向语言生成器添加任意键值翻译（例如物品提示或 GUI 文本） |
| `addLang(String type, Identifier id, String localizedName)` | 按 `<type>.<namespace>.<path>` 规则生成翻译键并写入语言表 |
| `setDataGenerator(Builder<?, ?, ?, ?> builder, GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | 覆盖绑定到某个 Builder 的指定类型数据生成回调 |
| `addDataGenerator(GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | 追加模块级通用数据生成回调，不覆盖已有同类回调 |
| `dataComponentPredicate(String name)` / `dataComponentPredicate(String name, Class<E> clazz)` | 注册自定义 `DataComponentPredicate.Type<E>`（挂载至 `Registries.DATA_COMPONENT_PREDICATE_TYPE`） |

### 自定义 `AbstractRegistrum` 子类与自定义注册表

当 Mod 定义了自定义 `Registry<T>` 并希望统一由 `Registrum` 管理注册周期时，可继承 `AbstractRegistrum` 并结合 `generic(...)` 或自定义 Builder 进行封装：

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.AbstractRegistrum;
import net.neoforged.bus.api.IEventBus;

public class MyRegistrum extends AbstractRegistrum<MyRegistrum> {
    protected MyRegistrum(String modid) {
        super(modid);
    }

    public static MyRegistrum create(String modid, IEventBus modBus) {
        MyRegistrum registrum = new MyRegistrum(modid);
        registrum.registerEventListeners(modBus);
        return registrum;
    }
}
```

## 构建器基类：`Builder<R, T, P, S>` 与 `AbstractBuilder<R, T, P, S>`

所有实体、方块、物品、流体及拓展组件构建器都实现 `Builder<R, T extends R, P, S extends Builder<R, T, P, S>>` 接口，通常直接继承 `AbstractBuilder`。

### `Builder` 核心链式 API

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `register()` | `RegistryEntry<R, T>` | 冻结并向父 `AbstractRegistrum` 登记构建器；返回代表未来条目的 `RegistryEntry` |
| `build()` | `P` | 等效于先调用 `register()` 再返回父对象 `getParent()`，用于多级链式回到外层构建器（如 `block().item().build()`） |
| `getOwner()` / `getParent()` / `getName()` | 对应对象 | 获取所属注册实例、外层父构建器、当前条目注册名（不含命名空间） |
| `getRegistryKey()` | `ResourceKey<? extends Registry<R>>` | 获取目标注册表键（例如 `Registries.BLOCK`） |
| `get()` / `getEntry()` | `RegistryEntry<R, T>` / `T` | 在注册登记完成后分别获取包装器或底层原版对象（未完成 `RegisterEvent` 时调用 `getEntry()` 会抛出异常） |
| `asSupplier()` | `NonNullSupplier<T>` | 返回不强引用 Builder 本身的惰性供应器，推荐在回调或配方构造中传值使用 |
| `aliasFrom(Identifier... oldNames)` | `S` | 声明该条目过去曾使用的旧名称（可多次调用）；派生条目（如 BlockItem、BlockEntityType、流体容器）也会同步继承相应旧名称别名 |
| `asOptional()` | `S` | 当构建条目所在注册表是可选/条件注册表时标记允许缺省 |
| `onRegister(NonNullConsumer<? super T> callback)` | `S` | 在条目实例化并注册完成后执行自定义初始化逻辑 |
| `onRegisterAfter(ResourceKey<? extends Registry<OR>> dependencyType, NonNullConsumer<? super T> callback)` | `S` | 在另一个注册表 `dependencyType` 注册全部完成之后执行回调（常用于需要跨注册表引用的逻辑） |
| `transform(NonNullFunction<S, S2> func)` | `S2` | 执行可复用的构建器模板封装函数，将常用配置抽取为静态工具方法 |
| `setData(GeneratorType<? extends D> type, NonNullBiConsumer<DataGenContext<R, T>, D> cons)` | `S` | 覆盖式绑定当前条目上下文（`DataGenContext`）的数据生成器动作 |
| `addMiscData(GeneratorType<? extends D> type, NonNullConsumer<? extends D> cons)` | `S` | 追加与条目无关的自由数据生成动作 |
| `dataMap(DataMapType<R, D> type, D val)` | `S` | 直接把常量值写入 NeoForge `DataMapProvider` |
| `dataMap(DataMapType<R, D> type, NonNullFunction<DataGenContext<R, T>, D> factory)` | `S` | 通过回调延迟计算 DataMap 条目值 |
| `dataMap(DataMapType<R, D> type, NonNullBiFunction<DataGenContext<R, T>, HolderLookup.Provider, D> factory)` | `S` | 在需要访问 `HolderLookup.Provider` 注册表查询时生成 DataMap 条目 |
| `lang(NonNullFunction<T, String> langKeyProvider)` | `S` | 使用内置自动命名规则将翻译键（`toEnglishName`）写入语言数据表 |
| `lang(NonNullFunction<T, String> langKeyProvider, String name)` | `S` | 显式设置该条目在 `en_us` 中的名称（同时自动镜像 `en_ud`） |
| `tag(ProviderType<? extends TP> type, TagKey<R>... tags)` | `S` | 将本条目添加到一组指定类型标签（如 `ProviderType.BLOCK_TAGS`） |
| `removeTag(ProviderType<TP> type, TagKey<R>... tags)` | `S` | 撤销先前（通常是默认行为）添加到本条目的标签 |

### 使用 `transform` 与 `aliasFrom` 的示例

```java
public static <T extends Block, P> BlockBuilder<T, P> commonMetalBlock(BlockBuilder<T, P> builder) {
    return builder
        .properties(p -> p.strength(5.0F, 6.0F).sound(SoundType.METAL).requiresCorrectToolForDrops())
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL);
}

public static final BlockEntry<Block> REFINED_ALLOY_BLOCK = MyMod.REGISTRUM
    .block("refined_alloy_block", Block::new)
    .transform(ModBlocks::commonMetalBlock)
    .aliasFrom(Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "old_alloy_block"))
    .simpleItem()
    .register();
```

## 注册包装器：`RegistryEntry<R, S>` 与特化 Entry

调用 `.register()` 后返回的对象并非裸实例，而是继承自 `RegistryEntry<R, S>` 的惰性代理（底层持有 `DeferredHolder<R, S>`），它实现了 `NonNullSupplier<S>`。

### 通用方法：`RegistryEntry<R, S>`

| 方法 | 说明 |
| --- | --- |
| `get()` | 解包返回注册表中的实际对象；若注册表尚未初始化则会抛出异常 |
| `getDelegate()` | 返回底层的 NeoForge `DeferredHolder<R, S>` |
| `getKey()` / `getId()` | 获取 `ResourceKey<R>` 或 `Identifier` 注册 ID |
| `isBound()` | 检查底层 `DeferredHolder` 是否已经绑定到有效实例 |
| `asOptional()` | 若已绑定则返回 `Optional.of(entry)`，否则返回 `Optional.empty()` |
| `getSibling(ResourceKey<? extends Registry<X>> registryType)` | 按相同注册名查找同一 Mod 下的同胞条目（例如通过 `BlockEntry` 查找同名的 `Item` 或 `BlockEntityType`） |
| `getSibling(Registry<X> registry)` | 同上，直接传入具体注册表实例 |
| `is(X entry)` | 将当前条目与传入实例做同一性比较 |
| `filter(Predicate<R> predicate)` | 对条目值应用谓词过滤，满足返回 `Optional.of(this)` |

### 派生特化 Entry 类型一览

| 类名 | 基类 / 扩展能力 | 特有便捷方法 |
| --- | --- | --- |
| `ItemProviderEntry<R extends ItemLike, T extends R>` | `RegistryEntry<R, T>`（同时实现 `ItemLike`） | `asStack()`、`asStack(int count)`、`asItem()`、`isIn(ItemStack)`、`is(Item)` |
| `BlockEntry<T extends Block>` | `ItemProviderEntry<Block, T>` | `getDefaultState()`、`has(BlockState)`、`cast(RegistryEntry<Block, T>)` |
| `ItemEntry<T extends Item>` | `ItemProviderEntry<Item, T>` | `cast(RegistryEntry<Item, T>)` |
| `BlockEntityEntry<T extends BlockEntity>` | `RegistryEntry<BlockEntityType<?>, BlockEntityType<T>>` | `create(BlockPos, BlockState)`、`is(BlockEntity)`、`get(BlockGetter, BlockPos)`（返回 `Optional<T>`）、`getNullable(BlockGetter, BlockPos)`、`cast(...)` |
| `EntityEntry<T extends Entity>` | `RegistryEntry<EntityType<?>, EntityType<T>>` | `create(Level)`、`is(Entity)`、`cast(...)` |
| `FluidEntry<T extends BaseFlowingFluid>` | `RegistryEntry<Fluid, T>` | `getSource()`、`getType()`、`getBucket()`、`is(Fluid)`、`isSource(FluidState)`、`cast(...)` |
| `MenuEntry<T extends AbstractContainerMenu>` | `RegistryEntry<MenuType<?>, MenuType<T>>` | `create(int, Inventory)`、`asProvider()`、`open(ServerPlayer, Component)` 及其携带 `Consumer<RegistryFriendlyByteBuf>` / `MenuConstructor` 重载 |
| `LazyRegistryEntry<R, T>` | `NonNullSupplier<T>` | 延迟包装另一条 `RegistryEntry` 供应器并在首次调用 `get()` 时缓存结果 |
| `SelfEntry<T>` / `MobEffectEntry<T>` / `PotionEntry` / `SoundEventEntry` / `GameEventEntry` / `ConditionEntry<T>` / `AttachmentEntry<E>` / `DataComponentEntry<E>` / `DataComponentPredicateEntry<E>` / `RecipeEntry<T>` / `RecipeTypeEntry<T>` / `RecipeSerializerEntry<T>` / `BiomeModifierEntry<T>` / `GlobalLootModifierEntry<T>` / `StructureModifierEntry<T>` | `RegistryEntry` 或组合包装 | 为对应注册项提供类型安全别名与 `cast(...)` 转换；`RecipeEntry<T>` 同时封装 `RecipeTypeEntry<T>` 与 `RecipeSerializerEntry<T>` |

## `OneTimeEventReceiver`、`Sequence` 与调试标记

在编写自定义构建器或跨事件生命周期调度逻辑时，`module.registrum` 还提供了一组轻量工具：

- **`OneTimeEventReceiver`**：静态工具类，用于向 Mod 事件总线（`addModListener`）或 NeoForge 游戏总线（`addForgeListener`）注册**触发一次后自动卸载**的监听器，保证诸如 `RegisterClientExtensionsEvent`、`RegisterCapabilitiesEvent` 或 `EntityRenderersEvent.RegisterRenderers` 等一次性事件不会重复触发。
- **`RegistrumDistExecutor`**：替代已弃用的 `DistExecutor`，提供 `unsafeRunWhenOn(Dist, NonNullSupplier<Runnable>)` 与 `unsafeCallWhenOn(Dist, NonNullSupplier<Callable<T>>)`，用于隔离仅在客户端存在的渲染器/扩展注册代码。
- **`Sequence<T>`**：线程安全的顺序容器辅助类（实现 `Iterable<T>`），提供 `Sequence.create()`、`add(T)` 等有序拼接辅助方法，在生成器链路与内部监听器整理中确保注册先后顺序稳定。
- **`DebugMarkers`**：包含 `Marker` 常量（如 `REGISTER`、`DATA`、`ALIAS` 等），用于控制 Log4j 日志在特定调试过滤下的追踪级别。
