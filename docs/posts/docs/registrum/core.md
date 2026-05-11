---
title: Registrum 核心 API
prev: false
next: false
---

# 核心 API <Badge type="tip" text=">=1.21.1" />

## Registrum

入口类，继承 `AbstractRegistrum<Registrum>`。

```java
// 创建实例
public static Registrum create(String modid);
```

`create()` 内部：

1. 构造 `new Registrum(modid)`
2. 通过 `ModList.get().getModContainerById(modid)` 查找模组容器
3. 获取 `modEventBus` 并调用 `registerEventListeners(bus)`
4. 若找不到 ModContainer，输出 fatal 日志（以 `#` 号包围的错误信息）

## AbstractRegistrum

注册引擎基类，包含所有核心逻辑。泛型参数 `S` 为自类型。

### 环境检测

```java
// 开发环境判断（FMLLoader.isProduction() == false）
public static boolean isDevEnvironment();
```

### 对象命名

```java
// 设置后续 builder 使用的条目名称，直到下次调用 object()
public S object(String name);

// 获取当前设置的名字（未设置则抛 NullPointerException）
protected String currentName();
```

**重要**: `object("name")` 设置的是持续状态。以下代码注册了同名方块和方块实体：

```java
REGISTRUM.object("my_block")
    .block(MyBlock::new).register()   // 注册方块 "my_block"
    .blockEntity(MyBE::new).register(); // 注册方块实体 "my_block"（名称继承）
```

### 条目检索

| 方法                                                                    | 说明                       |
|-----------------------------------------------------------------------|--------------------------|
| `<R,T> RegistryEntry<R,T> get(ResourceKey<Registry<R>>)`              | 按当前名字获取（需先调用 `object()`） |
| `<R,T> RegistryEntry<R,T> get(String, ResourceKey)`                   | 按指定名字获取                  |
| `<R,T> Optional<RegistryEntry<R,T>> getOptional(String, ResourceKey)` | 可选获取                     |
| `<R,T> Collection<RegistryEntry<R,T>> getAll(ResourceKey)`            | 获取某注册表全部已知条目             |

```java
// 获取之前注册的方块（用于在别处引用）
RegistryEntry<Block, MyBlock> entry = REGISTRUM.get("my_block", Registries.BLOCK);

// 获取同名 Item（BlockItem）
ItemEntry<BlockItem> itemEntry = entry.getSibling(Registries.ITEM);
```

### 注册回调

```java
// 条目注册后立即调用（回调接收已创建的对象）
public <R,T> S addRegisterCallback(String name, ResourceKey<Registry<R>> type,
    NonNullConsumer<? super T> callback);

// 注册表全部完成后调用（无参数）
public <R> S addRegisterCallback(ResourceKey<Registry<R>> type, Runnable callback);

// 检查注册表是否已完成
public <R> boolean isRegistered(ResourceKey<Registry<R>> type);
```

```java
// 使用示例：方块注册完成后自动设置堆肥概率
REGISTRUM.object("my_crop").block(MyCropBlock::new).register();
REGISTRUM.addRegisterCallback("my_crop", Registries.BLOCK, block -> {
    // block 是已注册的 MyCropBlock 实例
});

// 注册表整体完成后
REGISTRUM.addRegisterCallback(Registries.BLOCK, () -> {
    LOGGER.info("All blocks have been registered!");
});
```

### 数据生成

```java
// 获取数据生成器实例（仅 datagen 阶段可用）
public <P> Optional<P> getDataProvider(GeneratorType<P> type);

// 为指定条目设置数据生成回调（替换已有）
public <P,R> S setDataGenerator(Builder<R,?,?,?> builder,
    GeneratorType<? extends P> type, NonNullConsumer<? extends P> cons);

// 添加非关联的数据生成回调（追加，不替换）
public <T> S addDataGenerator(GeneratorType<? extends T> type,
    NonNullConsumer<? extends T> cons);

// 获取 DataGen 初始化器（配置 Provider 依赖和数据包注册表）
public DataProviderInitializer getDataGenInitializer();
```

### 语言/翻译

```java
// 使用 vanilla 风格键名 → "block.mymod.myblock"
public MutableComponent addLang(String type, Identifier id, String localizedName);

// 带后缀 → "block.mymod.myblock.tooltip"
public MutableComponent addLang(String type, Identifier id, String suffix, String localizedName);

// 原始键值对
public MutableComponent addRawLang(String key, String value);
```

这些方法返回 `MutableComponent`（使用 `Component.translatable(key)`），可进一步用于界面显示。翻译值通过
`RegistrumLangProvider` 在数据生成阶段输出。

```java
// 在注册过程中添加翻译
REGISTRUM.addLang("block", Identifier.fromNamespaceAndPath("mymod", "my_block"), "My Special Block");
// → 生成翻译键 "block.mymod.my_block": "My Special Block"
```

### 创造模式标签页

```java
// 设置默认标签页（影响后续所有 item builder）
public S defaultCreativeTab(ResourceKey<CreativeModeTab> tab);

// 注册标签页修改回调
public S modifyCreativeModeTab(ResourceKey<CreativeModeTab> tab,
    Consumer<CreativeModeTabModifier> modifier);
```

`modifyCreativeModeTab` 注册的回调在 `BuildCreativeModeTabContentsEvent` 时触发。支持多个回调注册到同一标签页。

### 错误跳过

```java
// 启用错误跳过（仅开发环境有效，生产环境自动忽略）
public S skipErrors(boolean skipErrors);
```

开发环境中，`skipErrors(true)` 可在注册/数据生成出错时仅记录日志而不抛异常，方便调试。错误跳过作用于：

- 注册项创建时的异常
- 数据生成回调中的异常

### Transform

```java
// 对 AbstractRegistrum 自身应用变换
public S transform(NonNullUnaryOperator<S> func);

// 应用变换并返回 Builder（变换后的 builder 可继续链式配置）
public <R,T,P,S2> S2 transform(NonNullFunction<S, S2> func);
```

```java
// 使用 transform 将注册逻辑提取为辅助方法
public static BlockBuilder<MyBlock, Registrum> createMyBlock(Registrum r) {
    return r.object("my_block").block(MyBlock::new).defaultItem();
}

// 在链中使用
REGISTRUM.transform(MyMod::createMyBlock)
    .lang("My Block")       // 可在 transform 后继续配置
    .register();
```

### Builder 入口

```java
// 通用 Builder 创建（使用当前名）
public <R,T,P,S2> S2 entry(NonNullBiFunction<String, BuilderCallback, S2> factory);

// 简化注册（无配置链，直接返回 RegistryEntry）
public <R,T> RegistryEntry<R,T> simple(ResourceKey<Registry<R>> type,
    NonNullSupplier<T> factory);

// 通用 Builder（NoConfigBuilder，可用于任意注册表）
public <R,T> NoConfigBuilder<R,T,S> generic(ResourceKey<Registry<R>> type,
    NonNullSupplier<T> factory);
```

### 专用 Builder 入口

以下方法提供特定类型的 Builder 快捷入口：

| 方法 | 返回类型 | 注册表 |
|------|---------|--------|
| `attachment(String, Function<IAttachmentHolder, E>)` | `AttachmentBuilder<E, S>` | `NeoForgeRegistries.Keys.ATTACHMENT_TYPES` |
| `attachment(String, Supplier<E>)` | `AttachmentBuilder<E, S>` | `NeoForgeRegistries.Keys.ATTACHMENT_TYPES` |
| `dataComponent(String)` | `DataComponentBuilder<E, S>` | `Registries.DATA_COMPONENT_TYPE` |
| `creativeTab(String, ItemLike)` | `CreativeTabBuilder<S>` | `Registries.CREATIVE_MODE_TAB` |
| `creativeTab(String, Supplier<ItemLike>)` | `CreativeTabBuilder<S>` | `Registries.CREATIVE_MODE_TAB` |
| `condition(String, MapCodec<T>)` | `ConditionBuilder<T, S>` | `NeoForgeRegistries.Keys.CONDITION_CODECS` |
| `biomeModifier(String, MapCodec<T>)` | `BiomeModifierBuilder<T, S>` | `NeoForgeRegistries.Keys.BIOME_MODIFIER_SERIALIZERS` |
| `glm(String, MapCodec<T>)` | `GlobalLootModifierBuilder<T, S>` | `NeoForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS` |
| `structureModifier(String, MapCodec<T>)` | `StructureModifierBuilder<T, S>` | `NeoForgeRegistries.Keys.STRUCTURE_MODIFIER_SERIALIZERS` |

```java
// 示例
REGISTRUM.attachment("my_data", MyAttachment::new)
    .serialize(MyAttachment.CODEC)
    .sync(MyAttachment.STREAM_CODEC)
    .register();

REGISTRUM.dataComponent("my_component")
    .persistent(MyComponent.CODEC)
    .networkSynchronized(MyComponent.STREAM_CODEC)
    .register();

REGISTRUM.creativeTab("my_tab", MY_ITEM)
    .displayItems(MY_ITEM, MY_BLOCK)
    .register();

REGISTRUM.condition("my_condition", MyCondition.CODEC).register();
REGISTRUM.biomeModifier("my_modifier", MyModifier.CODEC).register();
REGISTRUM.glm("my_loot", MyLootModifier.CODEC).register();
REGISTRUM.structureModifier("my_struct", MyStructModifier.CODEC).register();
```

### 创建自定义注册表

```java
// 同步注册表（通过 NewRegistryEvent）
public <R> ResourceKey<Registry<R>> makeRegistry(String name,
    Function<ResourceKey<Registry<R>>, RegistryBuilder<R>> builder);

// 数据包注册表（仅服务端，不同步）
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec);

// 数据包注册表（同步到客户端）
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name,
    Codec<R> codec, @Nullable Codec<R> networkCodec);
```

```java
// 创建自定义同步注册表
ResourceKey<Registry<MyCustomType>> MY_REGISTRY = REGISTRUM.makeRegistry(
    "my_custom",
    key -> new RegistryBuilder<MyCustomType>(key).sync(true).maxId(256)
);

// 注册条目到自定义注册表
RegistryEntry<MyCustomType, MyCustomType> entry = REGISTRUM
    .object("my_entry")
    .simple(MY_REGISTRY, MyCustomType::new);
```

## 注册生命周期

```
1. object("name")         — 设置当前操作名称
2. block() / item() 等    — 创建 Builder，存储到 registrations Table
3. .lang() .tag() 等      — Builder 链式配置（在 register() 前）
4. register()             — 创建 Registration 对象，存入 registrations，返回 RegistryEntry
5. RegisterEvent 触发     — onRegister() 遍历 registrations.row(type)，逐一调用 register(event)
6. 按优先级注册后          — onRegisterLate() 执行 afterRegisterCallbacks
7. FMLCommonSetupEvent    — 清理一次性事件监听器
8. GatherDataEvent.Client — (仅 datagen) onData() 启动数据生成
```

### 内部 Registration 类

```java
// package-private: Registration<R, T extends R>
// 存储: Identifier name, ResourceKey<Registry<R>> type,
//       NonNullSupplier<T> creator, RegistryEntry<R,T> delegate,
//       List<NonNullConsumer<? super T>> callbacks

// register(RegisterEvent event):
//   T entry = creator.get();
//   event.register(type, rh -> rh.register(name, entry));
//   callbacks.forEach(c -> c.accept(entry));
//   callbacks.clear();
```

## 事件监听

在 `registerEventListeners(IEventBus bus)` 中自动注册：

| 事件                                  | 优先级    | 处理                                                   |
|-------------------------------------|--------|------------------------------------------------------|
| `RegisterEvent`                     | normal | `onRegister()` — 遍历 registrations 并注册                |
| `RegisterEvent`                     | LOWEST | `onRegisterLate()` — 执行 afterRegisterCallbacks       |
| `BuildCreativeModeTabContentsEvent` | normal | `onBuildCreativeModeTabContents()` — 填充创造标签页         |
| `FMLCommonSetupEvent`               | normal | 通过 `OneTimeEventReceiver` 清理 RegisterEvent 监听器       |
| `GatherDataEvent.Client`            | normal | 仅 datagen 模式，通过 `OneTimeEventReceiver` 调用 `onData()` |

## BuilderCallback

函数式接口，由 `AbstractRegistrum.accept()` 实现，传递给 Builder：

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

    // 简化重载（使用默认 RegistryEntry 包装）
    default <R, T extends R> RegistryEntry<R, T> accept(
        String name, ResourceKey<? extends Registry<R>> type,
        Builder<R, T, ?, ?> builder, NonNullSupplier<? extends T> factory
    );
}
```

## 线程安全

`AbstractRegistrum` **不是线程安全的**。它使用非并发集合（`HashBasedTable`、`HashMultimap`），并通过状态性的 `currentName`
管理命名。

- 所有注册操作应在**模组构造阶段**（`@Mod` 构造函数）同步完成
- 数据生成回调在 `genData()` 中同步执行（串行调用）
- `doDatagen` 通过 `NonNullSupplier.lazy()` 保证惰性单次求值

## 完整示例

```java
@Mod("mymod")
public class MyMod {
    public static final Registrum REGISTRUM = Registrum.create("mymod");

    // 方块 + BlockItem + 方块实体
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

    // 物品
    public static final ItemEntry<MyItem> MY_ITEM = REGISTRUM
        .object("my_item")
        .item(MyItem::new)
            .tab(CreativeModeTabs.TOOLS)
            .lang("My Item")
            .register();

    // 实体
    public static final EntityEntry<MyEntity> MY_ENTITY = REGISTRUM
        .object("my_entity")
        .entity(MyEntity::new, MobCategory.CREATURE)
            .renderer(() -> ctx -> new MyEntityRenderer(ctx))
            .properties(b -> b.sized(0.6f, 1.8f))
            .attributes(MyEntity::createAttributes)
            .lang("My Entity")
            .register();

    public MyMod(IEventBus modBus) {
        // 初始化钩子
        IntegrationHook.setModEventBus(modBus);

        // 注册表完成后回调
        REGISTRUM.addRegisterCallback(Registries.BLOCK, () -> {
            LOGGER.info("All blocks registered!");
        });
    }
}
```
