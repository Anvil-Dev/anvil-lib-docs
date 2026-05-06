---
title: Registrum 核心 API
prev: false
next: false
---

# 核心 API

## Registrum

入口类，继承 `AbstractRegistrum<Registrum>`。

```java
// 创建实例（自动注册事件总线，发现失败则 fatal 日志）
public static Registrum create(String modid);
```

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

### 条目检索

| 方法 | 说明 |
|------|------|
| `<R,T> RegistryEntry<R,T> get(ResourceKey<Registry<R>>)` | 按当前名字获取 |
| `<R,T> RegistryEntry<R,T> get(String, ResourceKey)` | 按指定名字获取 |
| `<R,T> Optional<RegistryEntry<R,T>> getOptional(String, ResourceKey)` | 可选获取 |
| `<R,T> Collection<RegistryEntry<R,T>> getAll(ResourceKey)` | 获取某注册表全部已知条目 |

### 注册回调

```java
// 条目注册后立即调用
public <R,T> S addRegisterCallback(String name, ResourceKey<Registry<R>> type, NonNullConsumer<? super T> callback);

// 注册表全部完成后调用
public <R> S addRegisterCallback(ResourceKey<Registry<R>> type, Runnable callback);

// 检查注册表是否已完成
public <R> boolean isRegistered(ResourceKey<Registry<R>> type);
```

### 数据生成

```java
// 获取数据生成器实例（仅 datagen 阶段可用）
public <P> Optional<P> getDataProvider(GeneratorType<P> type);

// 为指定条目设置数据生成回调（替换已有）
public <P,R> S setDataGenerator(Builder<R,?,?,?> builder, GeneratorType<? extends P> type, NonNullConsumer<? extends P> cons);

// 添加非关联的数据生成回调
public <T> S addDataGenerator(GeneratorType<? extends T> type, NonNullConsumer<? extends T> cons);

// 获取 DataGen 初始化器
public DataProviderInitializer getDataGenInitializer();
```

### 语言/翻译

```java
// 使用 vanilla 风格键名（"block.mymod.myblock"）
public MutableComponent addLang(String type, Identifier id, String localizedName);

// 带后缀
public MutableComponent addLang(String type, Identifier id, String suffix, String localizedName);

// 原始键值对
public MutableComponent addRawLang(String key, String value);
```

### 创造性标签页

```java
// 设置默认标签页（影响后续所有 item builder）
public S defaultCreativeTab(ResourceKey<CreativeModeTab> tab);

// 注册标签页修改回调
public S modifyCreativeModeTab(ResourceKey<CreativeModeTab> tab, Consumer<CreativeModeTabModifier> modifier);
```

### 错误跳过

```java
// 启用错误跳过（仅开发环境有效）
public S skipErrors(boolean skipErrors);
```

### Transform

```java
// 对 AbstractRegistrum 自身应用变换
public S transform(NonNullUnaryOperator<S> func);

// 应用变换并返回 Builder
public <R,T,P,S2> S2 transform(NonNullFunction<S, S2> func);
```

### Builder 入口

```java
// 通用 Builder 创建（使用当前名）
public <R,T,P,S2> S2 entry(NonNullBiFunction<String, BuilderCallback, S2> factory);
// 使用指定名
public <R,T,P,S2> S2 entry(String name, NonNullFunction<BuilderCallback, S2> factory);

// 简化注册（无配置）
public <R,T> RegistryEntry<R,T> simple(ResourceKey<Registry<R>> type, NonNullSupplier<T> factory);
// 简化注册 + 父级
public <R,T,P> RegistryEntry<R,T> simple(P parent, String name, ResourceKey<Registry<R>> type, NonNullSupplier<T> factory);

// 通用 Builder（NoConfigBuilder）
public <R,T> NoConfigBuilder<R,T,S> generic(ResourceKey<Registry<R>> type, NonNullSupplier<T> factory);
```

### 创建自定义注册表

```java
// 同步注册表
public <R> ResourceKey<Registry<R>> makeRegistry(String name,
    Function<ResourceKey<Registry<R>>, RegistryBuilder<R>> builder);

// 数据包注册表（未同步）
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec);

// 数据包注册表（同步到客户端）
public <R> ResourceKey<Registry<R>> makeDatapackRegistry(String name, Codec<R> codec, @Nullable Codec<R> networkCodec);
```

## BuilderCallback

函数式接口，由 `AbstractRegistrum` 传递给 Builder。接受 Builder 完成后调用：

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
}
```

## 注册顺序

1. `object("name")` → 设置当前操作名称
2. `block(...)` / `item(...)` 等 → 创建 Builder 实例
3. Builder 链式配置（`.lang()`, `.tag()`, `.defaultItem()` 等）
4. `register()` → 创建 `Registration` 对象，存入注册表
5. `RegisterEvent` 触发 → `Registration.register()` 实际注册
6. 回调执行 → `callbacks` 依次调用

## 事件监听

在 `registerEventListeners(IEventBus bus)` 中注册：
- `RegisterEvent` — 注册条目
- `RegisterEvent` (LOWEST) — 注册完成后回调
- `BuildCreativeModeTabContentsEvent` — 填充创造性标签页
- `FMLCommonSetupEvent` — 清理一次性监听器
- `GatherDataEvent.Client` — 数据生成（仅 datagen 模式）
