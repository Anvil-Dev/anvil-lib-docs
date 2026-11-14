# Registrum 核心架构与基础注册

`module.registrum` 是 AnvilLib 面向 NeoForge 1.21.1 提供的链式声明式注册与数据生成框架（衍生自 Registrate）。它以 `Registrum` / `AbstractRegistrum` 为中心，将原版 `DeferredRegister` 的离散注册、客户端渲染器绑定、事件回调以及 `GatherDataEvent` 数据生成收拢到同一条类型安全的流式构建链中。

## 为什么需要 Registrum

原版 / NeoForge 的标准注册流程往往需要将一个方块的声明分散在多个位置：方块本体注册、物品形式注册、方块实体类型、客户端渲染器绑定、创造模式物品栏插入、标签/战利品表/方块状态/模型/语言数据生成。`Registrum` 通过 Builder 模式和惰性求值把这些步骤全部内聚在同一个声明表达式里：

1. **延迟但有序的注册调度**：调用 `.register()` 时并不立即构造游戏对象，而是记录到内部按注册表分组的表中；当 NeoForge 按序触发 `RegisterEvent` 时，按先方块、物品，再其余注册表的顺序实例化并注册条目，同时兼容 `addAlias` 重命名迁移。
2. **数据生成内置绑定**：调用 `block`、`item`、`entity`、`fluid` 等构建器会自动挂接合理的默认模型、方块状态、英文/倒置英文语言文件与战利品表；调用 `setData` / `addDataGenerator` 可随时覆写或追加。
3. **客户端安全隔离**：通过 `RegistrumDistExecutor` 与 `OneTimeEventReceiver` 在 `Dist.CLIENT` 下安全挂接客户端监听器，避免专用服务端崩溃。

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，以避免 NeoForge Maven 未完全同步 Maven Central 导致接口注入或传递元数据异常：

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### 创建 Registrum 实例

在 Mod 主类的静态字段中通过 `Registrum.create(modid)` 创建实例（确保该类在 Mod 构造或之前加载，且 `ModList` 已能查找到对应 `ModContainer` 及其 `IEventBus`）：

```java
package com.example.examplemod;

import dev.anvilcraft.lib.v2.registrum.Registrum;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

@Mod(ExampleMod.MODID)
public class ExampleMod {
    public static final String MODID = "examplemod";
    public static final Registrum REGISTRUM = Registrum.create(MODID);

    public ExampleMod(IEventBus modEventBus) {
        // 只需保证包含 REGISTRUM 的类触发初始化，例如调用静态注册类的 init()
        ModBlocks.register();
        ModItems.register();
    }
}
```

::: warning 注册时机铁律
`Registrum.create(modid)` 会在内部立即通过 `ModList.get().getModContainerById(modid)` 获取 Mod 事件总线并调用 `registerEventListeners(bus)`。**所有通过 `REGISTRUM` 构建条目（`.register()`）的代码必须在 `RegisterEvent`（即 Mod 构造函数执行阶段，最晚不迟于各注册类的静态加载）之前完成**，否则 `AbstractRegistrum` 将在注册触发后拒绝新增注册或出现遗漏。
:::

## 核心类：`Registrum` 与 `AbstractRegistrum`

`Registrum` 继承自 `AbstractRegistrum<Registrum>`，提供了开箱即用的工厂方法。如果你正在开发扩展库，也可以继承 `AbstractRegistrum<S>` 来暴露领域专用的 DSL 方法。

### 通用链式构建入口

在调用具体类型构建器之前，可以通过状态方法预设下一个条目的名称与默认创造标签：

- `object(String name)`：设定当前上下文名称，之后调用的 `.block(...)`、`.item(...)` 等无参命名重载都会沿用这个名称。
- `defaultCreativeTab(ResourceKey<CreativeModeTab> creativeModeTab)`：设置后续所有物品与方块物品默认加入的创造标签页。传入 `null` 可取消默认标签；已有全局默认标签页时再次修改会为此前所有未指定标签的构建链生效吗？注意：在原版语义下 `defaultCreativeTab` 在 `item(...)` 构建时刻读取当时存储的 `ResourceKey` 并调用 `.tab(...)`。
- `defaultCreativeTab(ResourceKey<CreativeModeTab> tab, NonNullBiConsumer<DataGenContext<Item, I>, CreativeModeTabModifier> modifier)`：设置全局默认创造标签页及其添加物品时的自定义修饰逻辑。

```java
public class ModItems {
    static {
        ExampleMod.REGISTRUM.defaultCreativeTab(ModCreativeTabs.MAIN_TAB.getKey());
    }

    public static final ItemEntry<Item> EXAMPLE_INGOT = ExampleMod.REGISTRUM
        .item("example_ingot", Item::new)
        .lang("Example Ingot")
        .register();

    public static final BlockEntry<Block> EXAMPLE_BLOCK = ExampleMod.REGISTRUM
        .object("example_block")
        .block(Block::new)
        .simpleItem()
        .register();

    public static void register() {}
}
```

### 通用注册表扩展与查找

对于没有专用 Builder 的注册表，可以使用以下基础构建器工厂：

- `simple(String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<T> factory)`：注册无额外配置逻辑的自定义注册表条目（内部返回 `NoConfigBuilder`）。
- `selfEntry(String name, ResourceKey<? extends Registry<T>> registryType, NonNullSupplier<T> factory)`：当注册表类型与条目类型相同（即 `Registry<T>` 存 `T`）时返回 `SelfBuilder<T, S, ...>`，最终 `.register()` 产出的包装类型为 `SelfEntry<T>`。
- `generic(P parent, String name, ResourceKey<Registry<R>> registryType, NonNullSupplier<T> factory)`：返回可自定义父对象类型的 `NoConfigBuilder`。
- `entry(String name, NonNullFunction<BuilderCallback, T> builderFactory)`：在流式链中直接接入一个自定义 `Builder` 实例（常用于外部扩展或自定义 Builder）。

若需要自建全新原版/数据包注册表：

- `makeRegistry(ResourceKey<Registry<T>> registryKey, Consumer<RegistryBuilder<T>> builder)`：在 `NewRegistryEvent` 中注册常规同步/非同步静态注册表，返回 `Registry<T>` 引用。
- `makeDatapackRegistry(ResourceKey<Registry<T>> registryKey, Codec<T> codec)` / `makeDatapackRegistry(ResourceKey<Registry<T>> registryKey, Codec<T> codec, @Nullable Codec<T> networkCodec)`：通过 `DataPackRegistryEvent.NewRegistry` 注册数据驱动的动态注册表（当 `networkCodec` 为 `null` 时客户端不同步该数据包注册表）。

查找与查询注册结果：

| 方法签名 | 说明 | 边界条件与注意事项 |
| :--- | :--- | :--- |
| `get(String name, ResourceKey<? extends Registry<R>> type)` | 按当前 `modid` 下的名称与注册表获取 `RegistryEntry<R, T>` | 条目尚未声明时抛出 `IllegalArgumentException` |
| `getOptional(String name, ResourceKey<? extends Registry<R>> type)` | 安全查找已声明条目，返回 `Optional<RegistryEntry<R, T>>` | 未声明返回 `Optional.empty()` |
| `get(ResourceKey<R> key)` | 通过完整 `ResourceKey` 获取已声明条目 | 必须由当前 `Registrum` 实例注册或同归属注册表 |
| `getAll(ResourceKey<? extends Registry<R>> type)` | 获取当前 `Registrum` 在指定注册表注册的全部 `RegistryEntry` 集合 | 返回只读视图，不含外挂模块注册的条目 |
| `isRegistered(ResourceKey<? extends Registry<R>> type)` | 检查指定注册表是否已完成 `RegisterEvent` 回调执行 | 用于判断交叉注册顺序依赖 |

### 生命周期回调、别名与容错

- `addRegisterCallback(String name, ResourceKey<? extends Registry<R>> registryType, NonNullConsumer<? super T> callback)`：当名为 `name` 的条目完成实例化并注册入 `RegisterEvent` 后触发。注意：`Builder.onRegister(...)` 的底层即调用此方法。如果注册触发结束时仍有未绑定的悬空回调（即调用了 `onRegister` 却忘记 `.register()`），将抛出异常提示遗漏。
- `addRegisterCallback(ResourceKey<? extends Registry<R>> registryType, Runnable callback)`：当整个注册表完成注册后触发。
- `addAlias(ResourceKey<? extends Registry<T>> registry, ResourceLocation oldName, ResourceLocation newName)`：在注册表中为旧 ID 注册 NeoForge Alias 映射，保证旧存档方块/物品无缝迁移到新名称；常规用法直接在 Builder 上调用 `.aliasFrom(oldNames)`。
- `skipErrors(boolean skipErrors)`：测试/兼容环境下用于控制在条目创建或注册抛出异常时仅记录日志而不是立即中断加载（生产环境应保持 `false`）。
- `modifyCreativeModeTab(ResourceKey<CreativeModeTab> creativeModeTab, Consumer<CreativeModeTabModifier> modifier)`：在 `BuildCreativeModeTabContentsEvent` 中按 FIFO 顺序执行自定义创造栏修饰器。

### 语言辅助方法

在任何时机（常见于初始化或数据生成设置）向默认语言生成器注入非特定条目的翻译键：

- `addLang(String type, ResourceLocation id, String key)` -> 返回可传递组件 `MutableComponent`（Key 为 `type.namespace.path`）。
- `addLang(String type, ResourceLocation id, String suffix, String key)` -> 返回 Key 为 `type.namespace.path.suffix` 的 `MutableComponent`。
- `addRawLang(String key, String value)` -> 直接向默认英文（同时自动生成倒置英文 `en_ud`）语言表添加任意键值对。

## 通用构建器体系 (`Builder` 与 `AbstractBuilder`)

所有注册构建器都实现 `Builder<R, T extends R, P, S extends Builder<R, T, P, S>>`，大多数直接继承 `AbstractBuilder`。`R` 为注册表基类（如 `Block`），`T` 为实际类型（如 `MyBlock`），`P` 为父对象（顶层构建时为 `Registrum`，嵌套子构建时为外层 `BlockBuilder` 等），`S` 为用于链式返回的自身类型。

### 通用 Builder 方法一览

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `register()` | `RegistryEntry<R, T>`（各子类覆写为更具体的 Entry） | 完成配置并将条目提交给所属 `Registrum` 等待注册，返回条目包装句柄 |
| `build()` | `P` | 等价于调用 `register()` 后返回父对象 `getParent()`，专用于从子 Builder（如 `block.item()`、`block.blockEntity()`）退回父 Builder |
| `get()` / `getEntry()` | `RegistryEntry<R, T>` / `T` | 在注册完成后获取句柄或底层实例；注册前调用 `getEntry()` 会抛出空指针或非法状态 |
| `asSupplier()` | `NonNullSupplier<T>` | 返回一个不持有 Builder 引用的安全懒加载提供器 `LazyRegistryEntry`，可在工厂回调中安全捕获 |
| `transform(NonNullFunction<S, S2> func)` | `S2` | 在流式链中嵌入可复用的辅助配置函数（例如统一赋予方块属性、标签和模型） |
| `onRegister(NonNullConsumer<? super T> callback)` | `S` | 条目在 `RegisterEvent` 中注册完成瞬间触发回调（此时可读取 `T` 实例，但部分跨注册表对象可能尚未就绪） |
| `onRegisterAfter(ResourceKey<? extends Registry<OR>> dependencyType, NonNullConsumer<? super T> callback)` | `S` | 等待 `dependencyType` 所属注册表也完成注册后再触发回调 |
| `aliasFrom(ResourceLocation... oldNames)` | `S` | 声明此条目的历史注册名；衍生子条目（BlockItem、SpawnEgg、Bucket、FluidType、Flowing/Source）在各自实际存在时会自动跟随追加兼容别名 |
| `tag(ProviderType<? extends TP> type, TagKey<R>... tags)` | `S` | 为该条目添加数据生成标签（需与该 `ProviderType` 对应标签生成器类型匹配） |
| `asOptional()` | `S` | 将后续标签生成出的引用改为可选元素 `TagEntry.optionalElement(id)`，防止目标缺失引起标签加载失败 |
| `removeTag(ProviderType<TP> type, TagKey<R>... tags)` | `S` | 从此前通过 Builder 记录的标签列表中移除指定标签 |
| `lang(NonNullFunction<T, String> langKeyProvider)` | `S` | 使用与 `RegistrumLangProvider#getAutomaticName` 自动转写的英文名称绑定自定义 Key 提取函数 |
| `lang(NonNullFunction<T, String> langKeyProvider, String name)` | `S` | 显式绑定翻译 Key 提取函数与指定文本 |
| `setData(ProviderType<? extends D> type, NonNullBiConsumer<DataGenContext<R, T>, D> cons)` | `S` | 设置（并覆盖之前同类型）该条目专属的数据生成回调 |
| `addMiscData(ProviderType<? extends D> type, NonNullConsumer<? extends D> cons)` | `S` | 向当前 `Registrum` 追加不局限于单一上下文的通用数据生成任务 |
| `dataMap(DataMapType<R, D> type, D val)` | `S` | 为此条目生成 NeoForge DataMap 固定值条目 |
| `dataMap(DataMapType<R, D> type, NonNullFunction<DataGenContext<R, T>, D> factory)` | `S` | 使用 `DataGenContext` 动态构建 DataMap 值 |
| `dataMap(DataMapType<R, D> type, NonNullBiFunction<DataGenContext<R, T>, HolderLookup.Provider, D> factory)` | `S` | 结合当前 `HolderLookup.Provider` 动态构建 DataMap 值 |

## 条目包装与工具类

### `RegistryEntry` 与子类型

`RegistryEntry<R, S extends R>` 继承自 NeoForge 的 `DeferredHolder<R, S>` 并实现了 `NonNullSupplier<S>`，因此可直接作为原版 `Holder<R>` / `DeferredHolder<R, S>` 或 `Supplier<S>` 传递给任意 API。

- `getSibling(ResourceKey<? extends Registry<X>> registryType)` / `getSibling(Registry<X> registry)`：按同一 `modid` 和路径名称跨注册表检索关联条目（如由方块条目 `BlockEntry` 获取同名 `ItemEntry` 或 `BlockEntityEntry`）。
- `filter(Predicate<R> predicate)`：若实例存在且通过谓词测试返回 `Optional.of(this)`。
- `is(X entry)`：使用引用相等 `get() == entry` 判断是否为同一注册对象（`FluidEntry` 重写为 `get().isSame((Fluid) entry)`）。
- `RegistryEntry.cast(Class, RegistryEntry)`：安全类型强转并在不匹配时抛出明确 `IllegalArgumentException`。

针对常见游戏对象的专有扩展（各自持有快捷方法）：

- `ItemProviderEntry<R extends ItemLike, T extends R>`：实现 `ItemLike`，提供 `asStack()`、`asStack(int count)`、`isIn(ItemStack)`、`is(Item)`、`asItem()`。`BlockEntry` 和 `ItemEntry` 均继承于此。
- `LazyRegistryEntry<R, T>`：`Builder.asSupplier()` 返回的包装器，在第一次调用 `get()` 时向 `Registrum` 检索 `RegistryEntry` 并清空对 `Builder` 的强引用以利 GC。
- `SelfEntry<T>`：`SelfBuilder` 返回的类型 `RegistryEntry<T, T>` 的等价子类型，包含 `SoundEventEntry`、`PotionEntry`。

### 并发与事件工具

- `OneTimeEventReceiver`：为仅需响应一次的生命周期 Mod 总线或 NeoForge 事件提供一次性注册，并在 `FMLLoadCompleteEvent` 队列工作阶段自动注销释放引用。支持尚未获取 ModBus 时先缓存等待监听器的机制（`addModListener` / `addForgeListener`）。
- `RegistrumDistExecutor`：轻量侧端执行封装 `unsafeRunWhenOn(Dist, Supplier<Runnable>)`，通过双层 Lambda 延迟加载仅客户端类（如渲染器、Screen）防止服务端 `ClassNotFoundException`。
- `Sequence<T>`：按声明顺序执行步骤与求值的轻量流式辅助工具（`create()`、`run(Runnable)`、`next(Supplier<T>)`、`next(T)`）。
- `DebugMarkers`：提供 Log4j2 标记常量 `DebugMarkers.REGISTER`（`"REGISTRATE.REGISTER"`）与 `DebugMarkers.DATA`（`"REGISTRATE.DATA"`）用于精细控制注册与 datagen 日志过滤。
