---
title: Registrum 核心 API 参考
prev: false
next: false
---

# Registrum 核心 API 参考 <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="26.1" />

`AbstractRegistrum<S>` 是注册引擎的基类。它为单个模组管理所有注册项、数据生成器、语言条目、创造模式选项卡以及事件监听器。
泛型参数 `S` 是自类型（例如 `Registrum` 继承自 `AbstractRegistrum<Registrum>`）。

本文档按功能分组，涵盖每一个公开方法。

::: tip 有状态命名
`object("name")` 设置一个**持久化**名称，所有后续的构建器方法都会继承该名称，直到下一次调用 `object()` 为止。
或者，接受显式 `String name` 参数的方法则完全绕过当前名称状态。
:::

---

## 静态方法与初始化

### `isDevEnvironment()`

```java
public static boolean isDevEnvironment()
```

当在非生产环境下运行时返回 `true`（即 `FMLLoader#isProduction() == false`）。
用于控制调试日志的详细程度以及跳过错误的资格。

```java
if (AbstractRegistrum.isDevEnvironment()) {
    LOGGER.info("Running in development mode");
}
```

### `registerEventListeners(IEventBus)`

```java
public S registerEventListeners(IEventBus bus)
```

在构造期间调用，用于在模组事件总线上注册所有事件监听器。
订阅 `RegisterEvent`（常规 + `LOWEST`）、`BuildCreativeModeTabContentsEvent`、
`FMLCommonSetupEvent`（清理）以及 `GatherDataEvent.Client`（仅数据生成）。

- 如果尚未设置则设置 `modEventBus`
- 使用 `OneTimeEventReceiver` 实现自动清理的监听器
- 可重写以添加自定义监听器；**务必调用 `super`**

```java
// 通常由 Registrum.create() 自动调用
Registrum reg = new Registrum("mymod");
reg.registerEventListeners(modEventBus);
```

### `object(String)`

```java
public S object(String name)
```

设置当前条目名称。之后所有省略显式 `name` 参数的构建器调用都将使用此值。
再次调用将覆盖之前的名称。

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)       // 使用 "my_block"
    .register()
    .object("another_block")   // 切换名称
    .block(AnotherBlock::new); // 使用 "another_block"
```

### `skipErrors(boolean)`

```java
public S skipErrors(boolean skipErrors)
```

仅开发环境可用的开关。当设为 `true` 时，注册和数据生成期间的异常将被记录日志而非直接抛出，以便继续调试。

::: warning
`skipErrors(true)` 在非开发环境下会被静默忽略。
:::

```java
REGISTRUM.skipErrors(true).object("experimental")
    .block(ExperimentalBlock::new).register();
```

---

## 条目检索

用于获取之前已注册条目引用的方法。

| 方法                                 | 签名                                                                                                     | 描述                          |
|------------------------------------|--------------------------------------------------------------------------------------------------------|-----------------------------|
| `get(ResourceKey)`                 | `<R,T> RegistryEntry<R,T> get(ResourceKey<? extends Registry<R>> type)`                                | 按当前名称获取条目（需要先调用 `object()`） |
| `get(String, ResourceKey)`         | `<R,T> RegistryEntry<R,T> get(String name, ResourceKey<? extends Registry<R>> type)`                   | 按显式名称获取条目                   |
| `getOptional(String, ResourceKey)` | `<R,T> Optional<RegistryEntry<R,T>> getOptional(String name, ResourceKey<? extends Registry<R>> type)` | 获取可能不存在的条目                  |
| `getAll(ResourceKey)`              | `<R,T> Collection<RegistryEntry<R,T>> getAll(ResourceKey<? extends Registry<R>> type)`                 | 获取某个注册表的所有已知条目              |

**参数：**

| 参数     | 类型                                   | 描述                             |
|--------|--------------------------------------|--------------------------------|
| `name` | `String`                             | 条目名称（属于模组命名空间）                 |
| `type` | `ResourceKey<? extends Registry<R>>` | 要查询的注册表（例如 `Registries.BLOCK`） |

**返回类型：**

| 方法            | 返回值                               | 抛出异常                                          |
|---------------|-----------------------------------|-----------------------------------------------|
| `get`（当前名称）   | `RegistryEntry<R, T>`             | 若未设置 `currentName` 则抛出 `NullPointerException` |
| `get`（显式名称）   | `RegistryEntry<R, T>`             | 若未找到注册项则抛出 `IllegalArgumentException`         |
| `getOptional` | `Optional<RegistryEntry<R, T>>`   | 无（若未找到则返回 `Optional.empty()`）                 |
| `getAll`      | `Collection<RegistryEntry<R, T>>` | 无                                             |

```java
// 通过当前名称检索
RegistryEntry<Block, MyBlock> myBlock = REGISTRUM
    .object("my_block")
    .get(Registries.BLOCK);

// 通过显式名称检索（无需 object()）
RegistryEntry<Item, BlockItem> item = REGISTRUM
    .get("my_block", Registries.ITEM);

// 安全的可选检索
Optional<RegistryEntry<Block, MyBlock>> opt = REGISTRUM
    .getOptional("missing_block", Registries.BLOCK);

// 获取所有已注册物品
Collection<RegistryEntry<Item, Item>> allItems = REGISTRUM
    .getAll(Registries.ITEM);
```

::: tip 运行时可用性
`get()` / `getOptional()` / `getAll()` 返回的条目在 `RegisterEvent` 触发之前为空。
`RegistryEntry` 持有者本身即时有效，但其包裹的值在注册完成之前为 `null`。
:::

---

## 注册回调

在注册阶段期间和之后调用的回调。

### `addRegisterCallback(name, registryType, callback)`

```java
public <R, T extends R> S addRegisterCallback(
    String name,
    ResourceKey<? extends Registry<R>> registryType,
    NonNullConsumer<? super T> callback
)
```

添加一个在指定条目注册**之后立即**调用的回调。该回调会接收到已创建的条目对象。
如果条目已经注册，则回调会立即触发。

| 参数             | 类型                                   | 描述         |
|----------------|--------------------------------------|------------|
| `name`         | `String`                             | 条目名称       |
| `registryType` | `ResourceKey<? extends Registry<R>>` | 包含该条目的注册表  |
| `callback`     | `NonNullConsumer<? super T>`         | 接收已注册对象的回调 |

```java
REGISTRUM.addRegisterCallback("my_crop", Registries.BLOCK, block -> {
    ComposterBlock.COMPOSTABLES.put(block.asItem(), 0.65f);
});
```

### `addRegisterCallback(registryType, callback)`

```java
public <R> S addRegisterCallback(
    ResourceKey<? extends Registry<R>> registryType,
    Runnable callback
)
```

添加一个在**整个注册表类型**完成注册之后（在 `LOWEST` 优先级的 `RegisterEvent` 中）调用的回调。
在所有模组完成该类型的注册后触发。

| 参数             | 类型                                   | 描述      |
|----------------|--------------------------------------|---------|
| `registryType` | `ResourceKey<? extends Registry<R>>` | 要监听的注册表 |
| `callback`     | `Runnable`                           | 要调用的回调  |

```java
REGISTRUM.addRegisterCallback(Registries.BLOCK, () -> {
    LOGGER.info("所有方块已注册完毕！");
});
```

### `isRegistered(ResourceKey)`

```java
public <R> boolean isRegistered(
    ResourceKey<? extends Registry<R>> registryType
)
```

检查某个注册表类型是否已完成注册。

```java
if (REGISTRUM.isRegistered(Registries.BLOCK)) {
    // 可以安全地遍历所有方块
}
```

---

## 数据生成

数据生成器管理，仅在 `GatherDataEvent` 期间激活。

### `getDataProvider(GeneratorType)`

```java
public <P> Optional<P> getDataProvider(GeneratorType<P> type)
```

获取指定生成器类型的数据提供器实例。仅在数据生成阶段有效。

| 参数     | 类型                 | 描述        |
|--------|--------------------|-----------|
| `type` | `GeneratorType<P>` | 要获取的生成器类型 |

- 返回：`Optional<P>` —— 对应的提供器，若本次数据生成运行中未注册则为空
- 抛出：若在数据生成开始之前调用则抛出 `IllegalStateException`

```java
// 在数据生成器回调内部
Optional<RegistrumBlockModelGenerator> modelGen = REGISTRUM
    .getDataProvider(ProviderType.BLOCK_MODEL);
```

### `setDataGenerator(Builder, GeneratorType, NonNullConsumer)`

```java
public <P, R> S setDataGenerator(
    Builder<R, ?, ?, ?> builder,
    GeneratorType<? extends P> type,
    NonNullConsumer<? extends P> cons
)
```

将数据生成器回调关联到特定的构建器条目。**替换**同一条目/类型组合上的任何现有回调。

```java
// 通常通过 .setData() 在构建器链中调用
builder.setData(ProviderType.LOOT, (ctx, prov) -> {
    prov.addBlockLoot(ctx.getName());
});
```

### `setDataGenerator(String, ResourceKey, GeneratorType, NonNullConsumer)`

```java
public <P, R> S setDataGenerator(
    String entry,
    ResourceKey<? extends Registry<R>> registryType,
    GeneratorType<? extends P> type,
    NonNullConsumer<? extends P> cons
)
```

与上面相同，但通过名称和注册表类型而非构建器实例来标识条目。
这是构建器变体内部委托的实现。

### `addDataGenerator(GeneratorType, NonNullConsumer)`

```java
public <T> S addDataGenerator(
    GeneratorType<? extends T> type,
    NonNullConsumer<? extends T> cons
)
```

添加一个**不与任何特定条目关联**的数据生成器回调。用于杂项数据生成（全局配置、自定义 JSON 文件等）。
与 `setDataGenerator` 不同，此方法**追加**到现有回调之后。

| 参数     | 类型                             | 描述        |
|--------|--------------------------------|-----------|
| `type` | `GeneratorType<? extends T>`   | 生成器类型     |
| `cons` | `NonNullConsumer<? extends T>` | 消费该提供器的回调 |

```java
REGISTRUM.addDataGenerator(ProviderType.LANG, lang -> {
    lang.add("mymod.greeting", "Hello World");
});
```

### `getDataGenInitializer()`

```java
public DataProviderInitializer getDataGenInitializer()
```

访问 `DataProviderInitializer`，用于配置提供器依赖关系和 datapack 注册表条目。
首次调用时延迟创建该初始化器。

```java
REGISTRUM.getDataGenInitializer()
    .addDependency(ProviderType.BLOCK_TAGS, ProviderType.BLOCK_MODEL);
```

### `genData(GeneratorType, T)`

```java
public <T> void genData(GeneratorType<? extends T> type, T gen)
```

由 `RegistrumDataProvider` 调用的内部方法，用于执行给定提供器类型的所有已注册数据生成回调。
会同时调用与条目关联的回调和未关联的回调。

- 错误会单独记录日志；若 `skipErrors` 为 `true`，错误不会向上传播
- 若数据生成未运行则为空操作

---

## 语言 / 翻译

所有三个方法都返回一个 `MutableComponent`（通过 `Component.translatable(key)`），适用于在 UI、提示框和创造模式选项卡标题中显示。
翻译值在数据生成期间通过 `RegistrumLangProvider` 写入。

### `addLang(type, id, localizedName)`

```java
public MutableComponent addLang(
    String type,
    Identifier id,
    String localizedName
)
```

使用原版风格的键生成方式（`Util.makeDescriptionId`）添加翻译。例如，
`("block", "mymod:my_block", "My Block")` 会生成键 `"block.mymod.my_block"`。

| 参数              | 类型           | 描述                                    |
|-----------------|--------------|---------------------------------------|
| `type`          | `String`     | 键前缀（例如 `"block"`、`"item"`、`"entity"`） |
| `id`            | `Identifier` | 条目标识符                                 |
| `localizedName` | `String`     | （英文）翻译值                               |

### `addLang(type, id, suffix, localizedName)`

```java
public MutableComponent addLang(
    String type,
    Identifier id,
    String suffix,
    String localizedName
)
```

与上面相同，但追加一个以点号分隔的后缀。例如，
`("block", id, "tooltip", "Hold shift for info")` 会生成键 `"block.mymod.my_block.tooltip"`。

### `addRawLang(key, value)`

```java
public MutableComponent addRawLang(String key, String value)
```

直接添加原始键值翻译对，绕过键生成逻辑。

```java
// 原版风格（自动生成键）
MutableComponent name = REGISTRUM.addLang("block",
    Identifier.fromNamespaceAndPath("mymod", "my_block"),
    "My Special Block");

// 带后缀（用于提示框）
MutableComponent tooltip = REGISTRUM.addLang("block",
    Identifier.fromNamespaceAndPath("mymod", "my_block"),
    "tooltip", "A very special block");

// 原始键（自定义键）
MutableComponent custom = REGISTRUM.addRawLang(
    "mymod.custom.message", "Hello World");
```

---

## 创造模式选项卡（Resource Key）

这些方法控制默认的创造模式选项卡分配以及选项卡内容修改。

### `defaultCreativeTab(ResourceKey)`

```java
public S defaultCreativeTab(ResourceKey<CreativeModeTab> tab)
```

设置默认的创造模式选项卡。除非被覆盖，所有后续物品构建器将使用此选项卡。
初始默认为 `CreativeModeTabs.SEARCH`。

```java
REGISTRUM.defaultCreativeTab(CreativeModeTabs.BUILDING_BLOCKS);
```

### `defaultCreativeTab(RegistryEntry)`

```java
public S defaultCreativeTab(
    RegistryEntry<CreativeModeTab, CreativeModeTab> tab
)
```

便捷重载，从 `RegistryEntry` 中提取 `ResourceKey`。适用于由外部（非 Registrum）注册的创造模式选项卡。

### `modifyCreativeModeTab(ResourceKey, Consumer)`

```java
public S modifyCreativeModeTab(
    ResourceKey<CreativeModeTab> creativeModeTab,
    Consumer<CreativeModeTabModifier> modifier
)
```

注册一个在 `BuildCreativeModeTabContentsEvent` 期间调用的回调，用于修改特定创造模式选项卡的内容。
同一选项卡上的多个回调是叠加的。

| 参数                | 类型                                  | 描述                |
|-------------------|-------------------------------------|-------------------|
| `creativeModeTab` | `ResourceKey<CreativeModeTab>`      | 目标选项卡             |
| `modifier`        | `Consumer<CreativeModeTabModifier>` | 接收一个用于添加物品的修改器的回调 |

```java
REGISTRUM.modifyCreativeModeTab(CreativeModeTabs.BUILDING_BLOCKS, modifier -> {
    modifier.add(MY_BLOCK.get());
    modifier.addAfter(Items.STONE, MY_SPECIAL_BLOCK.get());
});
```

---

## Transform

对 registrum 实例应用变换，或将流式链重定向到构建器辅助方法。

### `transform(NonNullUnaryOperator)`

```java
public S transform(NonNullUnaryOperator<S> func)
```

对 `this` 应用一个函数并返回结果。适用于配置 registrum 本身（而非转换到构建器）的辅助方法。

```java
public static Registrum configureDefaults(Registrum r) {
    return r.defaultCreativeTab(CreativeModeTabs.BUILDING_BLOCKS);
}

REGISTRUM.transform(MyMod::configureDefaults)
    .object("my_block").block(MyBlock::new).register();
```

### `transform(NonNullFunction)`

```java
public <R, T extends R, P, S2 extends Builder<R, T, P, S2>> S2 transform(
    NonNullFunction<S, S2> func
)
```

应用一个返回 `Builder` 的函数，然后在该函数返回的对象上继续链式调用。
这是将构建器构造提取到辅助方法中的关键机制。

```java
public static BlockBuilder<MyBlock, Registrum> createMyBlock(Registrum r) {
    return r.object("my_block").block(MyBlock::new);
}

REGISTRUM.transform(MyMod::createMyBlock)
    .lang("My Block")   // 链式调用在 BlockBuilder 上继续
    .simpleItem()
    .register();
```

---

## 自定义条目与注册表

### `entry(NonNullBiFunction)`

```java
public <R, T extends R, P, S2 extends Builder<R, T, P, S2>> S2 entry(
    NonNullBiFunction<String, BuilderCallback, S2> factory
)
```

使用工厂创建构建器，传入**当前名称**（来自 `object()`）和一个 `BuilderCallback`。
这是自定义构建器类型的通用入口点。

### `entry(String, NonNullFunction)`

```java
public <R, T extends R, P, S2 extends Builder<R, T, P, S2>> S2 entry(
    String name,
    NonNullFunction<BuilderCallback, S2> factory
)
```

与上面相同，但使用**显式名称**，绕过当前名称状态。

```java
// 使用当前名称
REGISTRUM.object("my_thing")
    .entry((name, callback) -> new MyCustomBuilder<>(
        REGISTRUM, REGISTRUM, name, callback));

// 使用显式名称
REGISTRUM.entry("my_thing", callback -> new MyCustomBuilder<>(
    REGISTRUM, REGISTRUM, "my_thing", callback));
```

### `makeRegistry(name, builder)`

```java
public <R> ResourceKey<Registry<R>> makeRegistry(
    String name,
    Function<ResourceKey<Registry<R>>, RegistryBuilder<R>> builder
)
```

通过 `NewRegistryEvent` 创建一个新的**同步**注册表。立即返回 `ResourceKey`；
实际的注册表稍后在事件触发时创建。

| 参数        | 类型                                          | 描述                      |
|-----------|---------------------------------------------|-------------------------|
| `name`    | `String`                                    | 注册表 ID（属于模组命名空间）        |
| `builder` | `Function<ResourceKey, RegistryBuilder<R>>` | 配置 `RegistryBuilder` 属性 |

```java
ResourceKey<Registry<MyType>> MY_REGISTRY = REGISTRUM.makeRegistry(
    "my_custom",
    key -> new RegistryBuilder<MyType>(key)
        .sync(true)
        .maxId(256)
);

REGISTRUM.object("my_entry")
    .simple(MY_REGISTRY, MyType::new);
```

### `makeDatapackRegistry(name, codec)`

```java
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(
    String name,
    Codec<R> codec
)
```

注册一个**非同步**的 datapack 注册表。数据 JSON 从
`data/<datapack_namespace>/<modid>/<name>/` 加载。客户端不需要拥有此注册表即可连接到服务器。

### `makeDatapackRegistry(name, codec, networkCodec)`

```java
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(
    String name,
    Codec<R> codec,
    @Nullable Codec<R> networkCodec
)
```

注册一个带有可选网络编解码器的 datapack 注册表。如果 `networkCodec` 非空，
数据将同步到客户端，且两侧都需要该注册表。

| 参数             | 类型                   | 描述                          |
|----------------|----------------------|-----------------------------|
| `name`         | `String`             | 注册表 ID                      |
| `codec`        | `Codec<R>`           | 用于从 datapack 加载数据的编解码器（服务端） |
| `networkCodec` | `@Nullable Codec<R>` | 用于同步到客户端的编解码器；`null` = 非同步  |

```java
// 非同步（仅服务端）
ResourceKey<Registry<MyData>> UNSYNCED = REGISTRUM.makeDatapackRegistry(
    "my_server_data", MyData.CODEC);

// 同步（客户端和服务端都需要）
ResourceKey<Registry<MyData>> SYNCED = REGISTRUM.makeDatapackRegistry(
    "my_synced_data", MyData.CODEC, MyData.NETWORK_CODEC);
```

---

## 通用注册（simple / generic）

`simple()` 立即返回一个 `RegistryEntry`（无构建器链）。`generic()` 返回一个
`NoConfigBuilder`，允许在最终完成之前调用 `.lang()`、`.tag()`、`.register()`。

### `simple()` 重载（4 个）

| 签名                                                                | 描述                  |
|-------------------------------------------------------------------|---------------------|
| `simple(ResourceKey<Registry<R>>, NonNullSupplier<T>)`            | 当前名称，无父对象（`self()`） |
| `simple(String, ResourceKey<Registry<R>>, NonNullSupplier<T>)`    | 显式名称，无父对象           |
| `simple(P, ResourceKey<Registry<R>>, NonNullSupplier<T>)`         | 当前名称，指定父对象          |
| `simple(P, String, ResourceKey<Registry<R>>, NonNullSupplier<T>)` | 显式名称，指定父对象          |

| 参数             | 类型                         | 描述       |
|----------------|----------------------------|----------|
| `registryType` | `ResourceKey<Registry<R>>` | 目标注册表    |
| `factory`      | `NonNullSupplier<T>`       | 条目构造器    |
| `name`         | `String`                   | 条目名称（可选） |
| `parent`       | `P`                        | 父对象（可选）  |

```java
// 快速注册，无需构建器链
RegistryEntry<Item, MyItem> entry = REGISTRUM
    .object("my_item")
    .simple(Registries.ITEM, MyItem::new);
```

### `generic()` 重载（4 个）

| 签名                                                                 | 返回                       | 描述         |
|--------------------------------------------------------------------|--------------------------|------------|
| `generic(ResourceKey<Registry<R>>, NonNullSupplier<T>)`            | `NoConfigBuilder<R,T,S>` | 当前名称，无父对象  |
| `generic(String, ResourceKey<Registry<R>>, NonNullSupplier<T>)`    | `NoConfigBuilder<R,T,S>` | 显式名称，无父对象  |
| `generic(P, ResourceKey<Registry<R>>, NonNullSupplier<T>)`         | `NoConfigBuilder<R,T,P>` | 当前名称，指定父对象 |
| `generic(P, String, ResourceKey<Registry<R>>, NonNullSupplier<T>)` | `NoConfigBuilder<R,T,P>` | 显式名称，指定父对象 |

```java
// 适用于任意注册表类型的构建器链
REGISTRUM.object("my_entry")
    .generic(Registries.ITEM, MyItem::new)
        .lang("My Custom Item")
        .tag(ItemTags.SWORDS)
        .register();
```

---

## Item 构建器（4 个重载）

创建一个 `ItemBuilder`。工厂函数接收 `Item.Properties` 并返回 `Item` 子类型。

| 签名                                                     | 名称来源            | 父对象            |
|--------------------------------------------------------|-----------------|----------------|
| `item(NonNullFunction<Item.Properties, T>)`            | `currentName()` | `S`（registrum） |
| `item(String, NonNullFunction<Item.Properties, T>)`    | 显式              | `S`（registrum） |
| `item(P, NonNullFunction<Item.Properties, T>)`         | `currentName()` | `P`            |
| `item(P, String, NonNullFunction<Item.Properties, T>)` | 显式              | `P`            |

| 参数        | 类型                                    | 描述            |
|-----------|---------------------------------------|---------------|
| `name`    | `String`                              | 条目名称（可选）      |
| `parent`  | `P`                                   | 构建器链中的父对象（可选） |
| `factory` | `NonNullFunction<Item.Properties, T>` | 从属性构造物品的工厂函数  |

```java
REGISTRUM.object("my_item")
    .item(MyItem::new)              // 使用 currentName，父对象=self
    .tab(CreativeModeTabs.TOOLS)
    .lang("My Item")
    .register();

// 显式名称，无需 object()
REGISTRUM.item("another_item", MyItem::new)
    .tab(CreativeModeTabs.BUILDING_BLOCKS)
    .register();
```

::: info 默认创造模式选项卡
以 `S` 为父对象的 `item()` 重载会自动将 `defaultCreativeTab`（如果已设置）应用到构建器上。
以 `P` 为父对象的重载不会应用默认选项卡。
:::

---

## Block 构建器（4 个重载）

创建一个 `BlockBuilder`。工厂函数接收 `BlockBehaviour.Properties` 并返回 `Block` 子类型。

| 签名                                                                | 名称来源            | 父对象 |
|-------------------------------------------------------------------|-----------------|-----|
| `block(NonNullFunction<BlockBehaviour.Properties, T>)`            | `currentName()` | `S` |
| `block(String, NonNullFunction<BlockBehaviour.Properties, T>)`    | 显式              | `S` |
| `block(P, NonNullFunction<BlockBehaviour.Properties, T>)`         | `currentName()` | `P` |
| `block(P, String, NonNullFunction<BlockBehaviour.Properties, T>)` | 显式              | `P` |

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)
    .properties(p -> p.strength(3.0f).requiresCorrectToolForDrops())
    .simpleItem()                     // 自动创建 BlockItem
    .lang("My Block")
    .register();
```

---

## Entity 构建器（4 个重载）

创建一个 `EntityBuilder`。接收 `EntityFactory<T>` 和 `MobCategory` 分类。

| 签名                                                 | 名称来源            | 父对象 |
|----------------------------------------------------|-----------------|-----|
| `entity(EntityFactory<T>, MobCategory)`            | `currentName()` | `S` |
| `entity(String, EntityFactory<T>, MobCategory)`    | 显式              | `S` |
| `entity(P, EntityFactory<T>, MobCategory)`         | `currentName()` | `P` |
| `entity(P, String, EntityFactory<T>, MobCategory)` | 显式              | `P` |

| 参数               | 类型                 | 描述                              |
|------------------|--------------------|---------------------------------|
| `name`           | `String`           | 条目名称（可选）                        |
| `parent`         | `P`                | 父对象（可选）                         |
| `factory`        | `EntityFactory<T>` | `(EntityType<T>, Level) -> T`   |
| `classification` | `MobCategory`      | 生成分类（例如 `MobCategory.CREATURE`） |

```java
REGISTRUM.object("my_entity")
    .entity(MyEntity::new, MobCategory.CREATURE)
    .renderer(() -> ctx -> new MyEntityRenderer(ctx))
    .attributes(MyEntity::createAttributes)
    .lang("My Entity")
    .register();
```

---

## BlockEntity 构建器（4 个重载）

创建一个 `BlockEntityBuilder`。接收 `BlockEntityFactory<T>`。

| 签名                                              | 名称来源            | 父对象 |
|-------------------------------------------------|-----------------|-----|
| `blockEntity(BlockEntityFactory<T>)`            | `currentName()` | `S` |
| `blockEntity(String, BlockEntityFactory<T>)`    | 显式              | `S` |
| `blockEntity(P, BlockEntityFactory<T>)`         | `currentName()` | `P` |
| `blockEntity(P, String, BlockEntityFactory<T>)` | 显式              | `P` |

| 参数        | 类型                      | 描述                                                |
|-----------|-------------------------|---------------------------------------------------|
| `name`    | `String`                | 条目名称（可选）                                          |
| `parent`  | `P`                     | 构建器链中的父对象（可选）                                     |
| `factory` | `BlockEntityFactory<T>` | `(BlockEntityType<T>, BlockPos, BlockState) -> T` |

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new)
    .blockEntity(MyBlockEntity::new) // 使用 currentName "my_block"
        .renderer(() -> ctx -> new MyBlockEntityRenderer(ctx))
        .build()
    .register();
```

---

## Fluid 构建器（36 个重载）

Fluid 重载按参数模式组织。每种模式最多有 4 种变体：
**当前名称**（无名称参数）、**显式名称**（String 参数）、**父对象**（父对象参数，
当前名称）以及**父对象 + 名称**（同时有父对象和显式名称）。

::: tip 默认纹理
当省略静止/流动纹理时，Registrum 会自动生成
`"block/<currentName>_still"` 和 `"block/<currentName>_flow"`。传入显式的 `Identifier`
可进行覆盖。
:::

### 基础 Fluid（无工厂，无自定义 FluidType）

| 签名                             | 返回                                          | 说明                         |
|--------------------------------|---------------------------------------------|----------------------------|
| `fluid()`                      | `FluidBuilder<BaseFlowingFluid.Flowing, S>` | 当前名称，默认使用 `FluidType::new` |
| `fluid(String name)`           | `FluidBuilder<BaseFlowingFluid.Flowing, S>` | 显式名称                       |
| `fluid(P parent)`              | `FluidBuilder<BaseFlowingFluid.Flowing, P>` | 父对象，`currentName()`，自动纹理   |
| `fluid(P parent, String name)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` | 父对象 + 名称，自动纹理              |

```java
REGISTRUM.object("my_fluid")
    .fluid()                         // 默认 FluidType，自动纹理
    .lang("My Fluid")
    .register();
```

### 带 FluidTypeFactory

| 签名                                                | 返回                                          |
|---------------------------------------------------|---------------------------------------------|
| `fluid(FluidBuilder.FluidTypeFactory)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, FluidBuilder.FluidTypeFactory)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, FluidBuilder.FluidTypeFactory)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, FluidBuilder.FluidTypeFactory)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

```java
REGISTRUM.object("my_fluid")
    .fluid(props -> props.temperature(300).viscosity(1000))
    .register();
```

### 带 NonNullSupplier\<FluidType\>

| 签名                                             | 返回                                          |
|------------------------------------------------|---------------------------------------------|
| `fluid(NonNullSupplier<FluidType>)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, NonNullSupplier<FluidType>)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, NonNullSupplier<FluidType>)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, NonNullSupplier<FluidType>)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### 带静止/流动纹理

| 签名                                            | 返回                                          |
|-----------------------------------------------|---------------------------------------------|
| `fluid(Identifier still, Identifier flowing)` | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, Identifier, Identifier)`       | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, Identifier, Identifier)`            | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, Identifier, Identifier)`    | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### 带纹理 + FluidTypeFactory

| 签名                                                                        | 返回                                          |
|---------------------------------------------------------------------------|---------------------------------------------|
| `fluid(Identifier, Identifier, FluidBuilder.FluidTypeFactory)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, Identifier, Identifier, FluidBuilder.FluidTypeFactory)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, Identifier, Identifier, FluidBuilder.FluidTypeFactory)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, Identifier, Identifier, FluidBuilder.FluidTypeFactory)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### 带纹理 + NonNullSupplier\<FluidType\>

| 签名                                                                     | 返回                                          |
|------------------------------------------------------------------------|---------------------------------------------|
| `fluid(Identifier, Identifier, NonNullSupplier<FluidType>)`            | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(String, Identifier, Identifier, NonNullSupplier<FluidType>)`    | `FluidBuilder<BaseFlowingFluid.Flowing, S>` |
| `fluid(P, Identifier, Identifier, NonNullSupplier<FluidType>)`         | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |
| `fluid(P, String, Identifier, Identifier, NonNullSupplier<FluidType>)` | `FluidBuilder<BaseFlowingFluid.Flowing, P>` |

### 带自定义 FluidFactory（泛型流体类型）

| 签名                                                                       | 返回                   |
|--------------------------------------------------------------------------|----------------------|
| `fluid(Identifier, Identifier, FluidBuilder.FluidFactory<T>)`            | `FluidBuilder<T, S>` |
| `fluid(String, Identifier, Identifier, FluidBuilder.FluidFactory<T>)`    | `FluidBuilder<T, S>` |
| `fluid(P, Identifier, Identifier, FluidBuilder.FluidFactory<T>)`         | `FluidBuilder<T, P>` |
| `fluid(P, String, Identifier, Identifier, FluidBuilder.FluidFactory<T>)` | `FluidBuilder<T, P>` |

### 带自定义 FluidFactory + FluidTypeFactory

| 签名                                                                                                      | 返回                   |
|---------------------------------------------------------------------------------------------------------|----------------------|
| `fluid(Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)`            | `FluidBuilder<T, S>` |
| `fluid(String, Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)`    | `FluidBuilder<T, S>` |
| `fluid(P, Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)`         | `FluidBuilder<T, P>` |
| `fluid(P, String, Identifier, Identifier, FluidBuilder.FluidTypeFactory, FluidBuilder.FluidFactory<T>)` | `FluidBuilder<T, P>` |

### 带自定义 FluidFactory + NonNullSupplier\<FluidType\>

| 签名                                                                                                   | 返回                   |
|------------------------------------------------------------------------------------------------------|----------------------|
| `fluid(Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)`            | `FluidBuilder<T, S>` |
| `fluid(String, Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)`    | `FluidBuilder<T, S>` |
| `fluid(P, Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)`         | `FluidBuilder<T, P>` |
| `fluid(P, String, Identifier, Identifier, NonNullSupplier<FluidType>, FluidBuilder.FluidFactory<T>)` | `FluidBuilder<T, P>` |

```java
Identifier still = Identifier.fromNamespaceAndPath("mymod", "block/my_fluid_still");
Identifier flow  = Identifier.fromNamespaceAndPath("mymod", "block/my_fluid_flow");

// 自定义 FluidType + 自定义 FluidFactory
REGISTRUM.object("my_fluid")
    .fluid(still, flow,
        props -> new MyFluidType(props),
        MyFlowingFluid::new)
    .lang("My Fluid")
    .bucket()
    .register();
```

---

## Menu 构建器（8 个重载）

创建一个 `MenuBuilder`。同时支持标准 `MenuFactory` 和 Forge 扩展的 `ForgeMenuFactory`。

### 带 `MenuFactory`（4 个重载）

| 签名                                                                      | 名称来源            | 父对象 |
|-------------------------------------------------------------------------|-----------------|-----|
| `menu(MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`            | `currentName()` | `S` |
| `menu(String, MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`    | 显式              | `S` |
| `menu(P, MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`         | `currentName()` | `P` |
| `menu(P, String, MenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)` | 显式              | `P` |

### 带 `ForgeMenuFactory`（4 个重载）

| 签名                                                                           | 名称来源            | 父对象 |
|------------------------------------------------------------------------------|-----------------|-----|
| `menu(ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`            | `currentName()` | `S` |
| `menu(String, ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`    | 显式              | `S` |
| `menu(P, ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)`         | `currentName()` | `P` |
| `menu(P, String, ForgeMenuFactory<T>, NonNullSupplier<ScreenFactory<T,SC>>)` | 显式              | `P` |

| 参数              | 类型                                       | 描述                  |
|-----------------|------------------------------------------|---------------------|
| `name`          | `String`                                 | 条目名称（可选）            |
| `parent`        | `P`                                      | 父对象（可选）             |
| `factory`       | `MenuFactory<T>` 或 `ForgeMenuFactory<T>` | 容器菜单构造器             |
| `screenFactory` | `NonNullSupplier<ScreenFactory<T, SC>>`  | Screen 工厂的 Supplier |

- `MenuFactory<T>`：`(int containerId, Inventory playerInv) -> T`
- `ForgeMenuFactory<T>`：`(int containerId, Inventory playerInv, FriendlyByteBuf extraData) -> T`

```java
// 标准 MenuFactory
REGISTRUM.object("my_menu")
    .menu(MyMenu::new, () -> MyScreen::new)
    .lang("My Menu")
    .register();

// ForgeMenuFactory（带额外数据同步）
REGISTRUM.object("my_forge_menu")
    .menu(MyMenu::new, () -> MyScreen::new)
    .register();
```

---

## Creative Tab 构建器（defaultCreativeTab）

在 `Registries.CREATIVE_MODE_TAB` 注册表中注册一个 `CreativeModeTab`。返回一个
`NoConfigBuilder<CreativeModeTab, CreativeModeTab, ...>` 以供进一步配置。

### 不带 config Consumer（4 个重载）

| 签名                              | 名称来源            | 父对象 |
|---------------------------------|-----------------|-----|
| `defaultCreativeTab()`          | `currentName()` | `S` |
| `defaultCreativeTab(String)`    | 显式              | `S` |
| `defaultCreativeTab(P)`         | `currentName()` | `P` |
| `defaultCreativeTab(P, String)` | 显式              | `P` |

### 带 config Consumer（4 个重载）

| 签名                                                                 | 名称来源            | 父对象 |
|--------------------------------------------------------------------|-----------------|-----|
| `defaultCreativeTab(Consumer<CreativeModeTab.Builder>)`            | `currentName()` | `S` |
| `defaultCreativeTab(String, Consumer<CreativeModeTab.Builder>)`    | 显式              | `S` |
| `defaultCreativeTab(P, Consumer<CreativeModeTab.Builder>)`         | `currentName()` | `P` |
| `defaultCreativeTab(P, String, Consumer<CreativeModeTab.Builder>)` | 显式              | `P` |

| 参数       | 类型                                  | 描述                                                     |
|----------|-------------------------------------|--------------------------------------------------------|
| `name`   | `String`                            | 选项卡名称。同时将 `defaultCreativeModeTab` 设置为匹配的 resource key |
| `parent` | `P`                                 | 父对象（可选）                                                |
| `config` | `Consumer<CreativeModeTab.Builder>` | 额外的选项卡配置                                               |

```java
// 简单选项卡
REGISTRUM.object("my_tab")
    .defaultCreativeTab()
    .lang("My Tab")
    .register();

// 带配置的选项卡
REGISTRUM.object("my_tab")
    .defaultCreativeTab(tab -> tab
        .withSearchBar()
        .withTabsBefore(CreativeModeTabs.BUILDING_BLOCKS))
    .lang("My Tab")
    .register();

// 显式名称 + 父对象 + 配置
REGISTRUM.defaultCreativeTab(myBlockBuilder, "my_tab",
    tab -> tab.icon(() -> new ItemStack(MY_BLOCK.get())))
    .register();
```

::: info 自动生成图标
当未配置图标时，`defaultCreativeTab` 会使用第一个已注册物品作为后备图标。
如果没有注册任何物品，则使用 `Items.AIR` 作为占位符。
:::

---

## CreativeTabBuilder（2 个重载）

一个专用的构建器，具有专门的展示物品配置能力。

### `creativeTab(String, ItemLike)`

```java
public CreativeTabBuilder<S> creativeTab(String name, ItemLike icon)
```

使用给定的名称和图标创建一个 `CreativeTabBuilder`。`ItemLike` 会立即包装在一个延迟 Supplier 中。
注册到 `Registries.CREATIVE_MODE_TAB`。

### `creativeTab(String, Supplier\<ItemLike\>)`

```java
public CreativeTabBuilder<S> creativeTab(String name, Supplier<ItemLike> icon)
```

与上面相同，但接受一个 `Supplier` 以实现延迟的图标解析。

```java
REGISTRUM.creativeTab("my_tab", MY_ITEM)
    .displayItems(MY_ITEM, MY_BLOCK, MY_TOOL)
    .lang("My Custom Tab")
    .register();

// 延迟图标
REGISTRUM.creativeTab("my_tab", () -> new ItemStack(MY_DYNAMIC_ITEM))
    .displayItems(MY_ITEM)
    .register();
```

---

## 专用构建器（26.1） <Badge type="info" text="26.1" />

AnvilLib 26.1 新增，这些构建器涵盖了 NeoForge 特有和高级注册表类型。

### Attachment 构建器（2 个重载）

注册一个 attachment 类型（`NeoForgeRegistries.Keys.ATTACHMENT_TYPES`）。

| 签名                                                   | 描述                           |
|------------------------------------------------------|------------------------------|
| `attachment(String, Function<IAttachmentHolder, E>)` | 使用初始化函数创建 attachment         |
| `attachment(String, Supplier<E>)`                    | 使用默认值 Supplier 创建 attachment |

| 参数       | 类型                                               | 描述               |
|----------|--------------------------------------------------|------------------|
| `name`   | `String`                                         | 条目名称             |
| `const_` | `Function<IAttachmentHolder, E>` 或 `Supplier<E>` | attachment 值的构造器 |

```java
// 带初始化函数
REGISTRUM.attachment("my_data", holder -> new MyData())
    .serialize(MyData.CODEC)
    .sync(MyData.STREAM_CODEC)
    .register();

// 带默认值 Supplier
REGISTRUM.attachment("my_data2", MyData::new)
    .serialize(MyData.CODEC)
    .register();
```

### Data Component 构建器（1 个重载）

注册一个 data component 类型（`Registries.DATA_COMPONENT_TYPE`）。

```java
public <E> DataComponentBuilder<E, S> dataComponent(String name)
```

| 参数     | 类型       | 描述   |
|--------|----------|------|
| `name` | `String` | 条目名称 |

```java
REGISTRUM.dataComponent("my_component")
    .persistent(MyComponent.CODEC)
    .networkSynchronized(MyComponent.STREAM_CODEC)
    .register();
```

### Biome Modifier 构建器（1 个重载）

注册一个 biome modifier 序列化器（`NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS`）。

```java
public <T extends BiomeModifier> BiomeModifierBuilder<T, S> biomeModifier(
    String name,
    MapCodec<T> codec
)
```

| 参数      | 类型            | 描述              |
|---------|---------------|-----------------|
| `name`  | `String`      | 条目名称            |
| `codec` | `MapCodec<T>` | 用于序列化的 MapCodec |

```java
REGISTRUM.biomeModifier("my_modifier", MyModifier.CODEC).register();
```

### Global Loot Modifier 构建器（1 个重载）

注册一个 global loot modifier 序列化器（`NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS`）。

```java
public <T extends IGlobalLootModifier> GlobalLootModifierBuilder<T, S> glm(
    String name,
    MapCodec<T> codec
)
```

```java
REGISTRUM.glm("my_loot_modifier", MyLootModifier.CODEC).register();
```

### Structure Modifier 构建器（1 个重载）

注册一个 structure modifier 序列化器（`NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS`）。

```java
public <T extends StructureModifier> StructureModifierBuilder<T, S> structureModifier(
    String name,
    MapCodec<T> codec
)
```

```java
REGISTRUM.structureModifier("my_struct_modifier", MyStructModifier.CODEC).register();
```

### SoundEvent 构建器（1 个重载）

注册一个 SoundEvent（`Registries.SOUND_EVENT`）。

```java
public SoundEventBuilder<S> soundEvent()
```

使用当前名称（来自 `object()`）。返回一个 `SoundEventBuilder`，用于配置固定范围和注册。

```java
REGISTRUM.object("my_sound")
    .soundEvent()
        .fix(16.0f)  // 可选：固定范围
        .register();
```

不调用 `fix()` 时，使用 `SoundEvent.createVariableRangeEvent(id)`。

### Condition 构建器（1 个重载）

注册一个 condition 编解码器（`NeoForgeRegistries.Keys.CONDITION_CODECS`）。

```java
public <T extends ICondition> ConditionBuilder<T, S> condition(
    String name,
    MapCodec<T> codec
)
```

```java
REGISTRUM.condition("my_condition", MyCondition.CODEC).register();
```

::: tip 受保护的重载
每个 26.1 构建器还有一个 `protected` 重载，接受 `(P parent, String name, ...)`
签名，供自定义子类扩展使用。这些不属于公开 API。
:::

---

## 注册生命周期

```
1. object("name")              — 设置当前条目名称
2. block() / item() / 等       — 创建 Builder，存入 registrations Table
3. .lang() .tag() .setData()   — Builder 链配置（在 register() 之前）
4. register()                   — 创建 Registration 对象，返回 RegistryEntry
5. RegisterEvent 触发           — onRegister() 按注册表迭代条目
6. RegisterEvent (LOWEST)       — onRegisterLate() 调用 afterRegisterCallbacks
7. FMLCommonSetupEvent          — OneTimeEventReceiver 清理 RegisterEvent 监听器
8. GatherDataEvent.Client       — （仅数据生成）onData() 启动数据生成
```

### 内部 `Registration<R, T>` 类

```java
// package-private
// 字段：Identifier name, ResourceKey<Registry<R>> type,
//         NonNullSupplier<T> creator, RegistryEntry<R,T> delegate,
//         List<NonNullConsumer<? super T>> callbacks

// register(RegisterEvent):
//   T entry = creator.get();
//   event.register(type, rh -> rh.register(name, entry));
//   callbacks.forEach(c -> c.accept(entry));
//   callbacks.clear();
```

### `registerEventListeners()` 注册的事件监听器

| 事件                                  | 优先级      | 处理器                                               |
|-------------------------------------|----------|---------------------------------------------------|
| `RegisterEvent`                     | 常规       | `onRegister()` —— 按类型注册收集的条目                      |
| `RegisterEvent`                     | `LOWEST` | `onRegisterLate()` —— 执行注册后回调                     |
| `BuildCreativeModeTabContentsEvent` | 常规       | `onBuildCreativeModeTabContents()` —— 填充创造模式选项卡内容 |
| `FMLCommonSetupEvent`               | 常规       | 通过 `OneTimeEventReceiver` 清理 `RegisterEvent` 监听器  |
| `GatherDataEvent.Client`            | 常规       | （仅数据生成）通过 `OneTimeEventReceiver` 调用 `onData()`    |

---

## 线程安全性

`AbstractRegistrum` **不是线程安全**的。它使用非并发集合（`HashBasedTable`、`HashMultimap`），并管理有状态的 `currentName`。

- 所有注册必须在**模组构造**（`@Mod` 构造函数）期间同步完成
- 数据生成回调通过 `genData()` 串行执行
- `doDatagen` 使用 `NonNullSupplier.lazy()` 实现安全的一次性延迟求值

---

## 错误参考

| 错误                                                                 | 原因                               | 解决方案                                  |
|--------------------------------------------------------------------|----------------------------------|---------------------------------------|
| `"Current name not set"`                                           | 在依赖名称的方法之前未调用 `object()`         | 调用 `object("name")` 或使用显式名称重载         |
| `"Unknown registration <name> for type <registry>"`                | `get(name, type)` 引用了不存在的注册项     | 确保在检索之前已创建注册项                         |
| `"Cannot get data provider before datagen is started"`             | 在数据生成之外调用 `getDataProvider()`    | 仅在 `GatherDataEvent` 期间调用             |
| `"Cannot add data generator after construction of root generator"` | 在根生成器构造之后调用 `addDataGenerator()` | 在数据生成开始之前注册数据生成器                      |
| `"Found unused register callbacks"`（开发环境）                          | 回调引用了从未注册的条目                     | 检查每个 `addRegisterCallback()` 是否有对应的条目 |

---

## BuilderCallback

连接构建器与注册系统的函数式接口。由 `AbstractRegistrum.accept()` 实现。

```java
@FunctionalInterface
public interface BuilderCallback {
    <R, T extends R> RegistryEntry<R, T> accept(
        String name,
        ResourceKey<? extends Registry<R>> type,
        Builder<R, T, ?, ?> builder,
        NonNullSupplier<? extends T> factory,
        NonNullFunction<DeferredHolder<R, T>, ? extends RegistryEntry<R, T>> entryFactory
    );

    // 简化重载（使用默认 RegistryEntry 包装器）
    default <R, T extends R> RegistryEntry<R, T> accept(
        String name,
        ResourceKey<? extends Registry<R>> type,
        Builder<R, T, ?, ?> builder,
        NonNullSupplier<? extends T> factory
    );
}
```

---

## 完整示例

```java
@Mod("mymod")
public class MyMod {
    public static final Registrum REGISTRUM = Registrum.create("mymod");

    // Block + BlockItem + BlockEntity
    public static final BlockEntry<MyBlock> MY_BLOCK = REGISTRUM
        .object("my_block")
        .block(MyBlock::new)
            .properties(p -> p.strength(3.0f).requiresCorrectToolForDrops())
            .simpleItem()
            .blockEntity(MyBlockEntity::new)
                .renderer(() -> ctx -> new MyBlockEntityRenderer(ctx))
                .build()
            .lang("My Block")
            .tag(BlockTags.MINEABLE_WITH_PICKAXE)
            .register();

    // Item
    public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
        .object("my_item")
        .item(MyItem::new)
            .tab(CreativeModeTabs.TOOLS)
            .lang("My Item")
            .register();

    // Entity
    public static final EntityEntry<MyEntity> MY_ENTITY = REGISTRUM
        .object("my_entity")
        .entity(MyEntity::new, MobCategory.CREATURE)
            .renderer(() -> ctx -> new MyEntityRenderer(ctx))
            .properties(b -> b.sized(0.6f, 1.8f))
            .attributes(MyEntity::createAttributes)
            .lang("My Entity")
            .register();

    // 26.1：Data component
    public static final DataComponentEntry<MyData> MY_COMPONENT = REGISTRUM
        .dataComponent("my_component")
            .persistent(MyData.CODEC)
            .networkSynchronized(MyData.STREAM_CODEC)
            .register();

    public MyMod(IEventBus modBus) {
        REGISTRUM.addRegisterCallback(Registries.BLOCK, () ->
            LOGGER.info("All blocks registered!"));
    }
}
```
