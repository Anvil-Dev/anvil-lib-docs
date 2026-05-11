---
title: Sync 核心 API
prev: false
next: false
---

# 核心 API <Badge type="tip" text=">=26.1" />

## @Sync 注解

标记类为可同步类型，指定默认同步方向。

```java
@Target(ElementType.TYPE)
public @interface Sync {
    SyncDirection value() default SyncDirection.BOTH;
}
```

| 属性    | 类型              | 默认值    | 说明        |
|-------|-----------------|--------|-----------|
| value | `SyncDirection` | `BOTH` | 该类的默认同步方向 |

注解中定义的方向在编译/类加载阶段由 `SyncBytecodeInjector` 自动应用到该类中所有 `SyncProxy` 字段上，对用户完全透明。

## SyncDirection

```java
public enum SyncDirection {
    BOTH(true, true),   // 双向同步
    C2S(true, false),   // 仅客户端→服务端
    S2C(false, true);   // 仅服务端→客户端

    boolean createByClient; // 是否允许客户端发起
    boolean createByServer; // 是否允许服务端发起
}
```

## SyncProxy\<T\>

数据同步代理，包装字段值并提供自动编解码和变更传播。

### 构造

```java
// 从非空值创建（自动推断 StreamCodec）
new SyncProxy<>(initialValue);

// 从值 + 自定义 StreamCodec 创建
new SyncProxy<>(initialValue, customStreamCodec);

// 从类型创建（值为 null，后续设置）
new SyncProxy<>(type);

// 从自定义 StreamCodec 创建（值为 null）
new SyncProxy<>(customStreamCodec);
```

### 核心方法

| 方法                                            | 说明                                    |
|-----------------------------------------------|---------------------------------------|
| `T getValue()`                                | 获取当前值                                 |
| `void setValue(@Nullable T value)`            | 设置值，检测变更并自动发送到对端                      |
| `SyncProxy<T> direction(SyncDirection)`       | 设置同步方向，返回 this（链式调用）                  |
| `void encode(ByteBuf)`                        | 将当前值编码到缓冲区                            |
| `void setValue(ByteBuf, boolean serverbound)` | 从缓冲区解码并设置值，serverbound 为 true 时触发变更同步 |

### 默认支持的 StreamCodec 类型（18 种）

::: details Click to expand — Built-in StreamCodec Type Table
`SyncProxy.defaultCodec()` 自动为以下类型提供 StreamCodec：

| 类型                  | StreamCodec                             |
|---------------------|-----------------------------------------|
| `CompoundTag`       | `ByteBufCodecs.TAG`                     |
| `Tag`               | `ByteBufCodecs.TAG`                     |
| `Vector3fc`         | `ByteBufCodecs.VECTOR3F`                |
| `Quaternionfc`      | `ByteBufCodecs.QUATERNIONF`             |
| `PropertyMap`       | `ByteBufCodecs.GAME_PROFILE_PROPERTIES` |
| `GameProfile`       | `ByteBufCodecs.GAME_PROFILE`            |
| `BlockPos`          | `BlockPos.STREAM_CODEC`                 |
| `Component`         | `ComponentSerialization.STREAM_CODEC`   |
| `ItemStack`         | `ItemStack.OPTIONAL_STREAM_CODEC`       |
| `ItemStackTemplate` | `ItemStackTemplate.STREAM_CODEC`        |
| `String`            | `ByteBufCodecs.STRING_UTF8`             |
| `Boolean/boolean`   | `ByteBufCodecs.BOOL`                    |
| `Double/double`     | `ByteBufCodecs.DOUBLE`                  |
| `Float/float`       | `ByteBufCodecs.FLOAT`                   |
| `Long/long`         | `ByteBufCodecs.LONG`                    |
| `Integer/int`       | `ByteBufCodecs.INT`                     |
| `Short/short`       | `ByteBufCodecs.SHORT`                   |
| `Byte/byte`         | `ByteBufCodecs.BYTE`                    |
| `long[]`            | `ByteBufCodecs.LONG_ARRAY`              |
| `byte[]` (Byte[])   | `ByteBufCodecs.BYTE_ARRAY`              |

:::

对于不在列表中的类型，必须通过 `new SyncProxy<>(value, customCodec)` 提供自定义 StreamCodec，否则构造时抛出 NPE。

### 变更传播机制

```
setValue(newValue)
  → 比较 oldValue != newValue
  → 通过 SyncManager.setValue() 创建 SyncPayload
  → SideUtil.send() 根据方向发送到对应端
  → 对端接收后通过 SyncPayload.handler() 解码
  → 反射定位字段并调用 syncProxy.setValue(buf, serverbound)
```

## SyncManager

全局管理器，维护已注册的同步类型映射并协调数据收发。

```java
public class SyncManager {
    // 从 AnvilLibSyncRegistries.SYNC_ENTRY_REGISTRY 编译同步条目
    void compileContent();

    // 根据父对象类型查找 SyncRegisterEntry（支持继承匹配）
    <P, ID> SyncRegisterEntry<P, ID> contains(Class<?> clazz);
}
```

通过 `AnvilLibSync.SYNC_MANAGER` 获取全局单例。在 `RegisterEvent`（LOWEST 优先级）时自动调用 `compileContent()`。

`contains(Class<?>)` 支持**继承匹配**：精确匹配失败后遍历所有已注册 key 检查 `isAssignableFrom`，子类可复用父类的同步注册策略。

## SyncRegisterEntry\<T, ID\> — 对象定位策略

`SyncRegisterEntry` 不是简单的"注册一个类"，而是注册**一整套对象定位策略**。它告诉
AnvilLib：对于某种承载同步字段的对象，如何将它编码为网络可传输的标识，以及如何在另一端重新找到它。

```java
public record SyncRegisterEntry<T, ID>(
    Class<?> clazz,                                         // 要处理的对象类型
    StreamCodec<ByteBuf, ID> idCodec,                       // 对象标识符的编解码器
    Function<T, ID> idGetter,                               // 如何从对象拿到唯一标识
    SyncRegisterEntry.Finder<T, ID> finder,                 // 收到包后，如何根据标识找回对象
    boolean dimension,                                      // 是否需要维度信息
    @Nullable Function<T, ResourceKey<Level>> dimensionGetter // 如何取维度
) {
    @FunctionalInterface
    interface Finder<T, ID> {
        @Nullable T apply(IPayloadContext context, ID id) throws Exception;
    }
}
```

### 各字段含义

| 字段                | 作用                                                      |
|-------------------|---------------------------------------------------------|
| `clazz`           | 承载 `SyncProxy` 字段的对象类型（`SyncProxy` 的 parent）            |
| `idCodec`         | 将该类型对象的唯一标识编解码为网络字节（如 `UUID` 用 `UUIDUtil.STREAM_CODEC`） |
| `idGetter`        | 发送同步包时，从对象实例提取唯一标识                                      |
| `finder`          | 接收同步包后，根据解码出的标识和对端上下文，查找目标对象（可能为 null）                  |
| `dimension`       | 是否启用维度感知分发（仅同维度的玩家收到同步包）                                |
| `dimensionGetter` | 从对象提取所在维度的 `ResourceKey<Level>`                         |

### 工厂方法

```java
// 无维度分发（全局广播）
SyncRegisterEntry.create(type, idCodec, idGetter, finder);

// 带维度分发
SyncRegisterEntry.create(type, idCodec, idGetter, finder, dimensionGetter);

// 完全控制
SyncRegisterEntry.create(type, idCodec, idGetter, finder, dimension, dimensionGetter);
```

维度分发模式根据 `id` 类型自动选择网络发送方式：

- `BlockPos` → `sendToPlayersTrackingChunk`（仅追踪该 chunk 的玩家）
- `Entity` → `sendToPlayersTrackingEntity`（仅追踪该实体的玩家）
- 其他 → `sendToPlayersInDimension`（该维度的所有玩家）

## 字节码注入（对用户透明）

`SyncBytecodeInjector` 通过 ASM 在类加载阶段对 `@Sync` 标记的类进行字节码注入。注入行为**对用户完全透明**，用户无需关心或手动调用。

注入在 `<init>`（实例字段）和 `<clinit>`（静态字段）方法的末尾插入以下调用：

```java
// 对每个 public final SyncProxy 字段，注入：
// 1. proxy.setParent(this / Owner.class)       —  让代理知道它属于哪个对象/类
// 2. proxy.setFieldName("fieldName")           —  让代理知道字段名（用于 SyncPayload 反射定位）
// 3. proxy.setDirection(SyncDirection.XXX)     —  应用 @Sync 注解中定义的同步方向
```

- `SyncTargetIndex` 在启动时扫描所有模组的 `@Sync` 注解，建立目标类索引
- `SyncClassProcessorProvider` 实现 NeoForge 的 `ClassProcessorProvider`，仅对索引中的类触发注入
- `SyncBytecodeInjector` 执行实际的 ASM 字节码改写

> **用户不需要做任何事情**：只要在类上添加 `@Sync` 注解，字节码注入就会自动建立 proxy 与父对象/字段名/方向的关联。

## SyncConfigManager

管理同步字段的配置注册，为每个 `SyncProxy` 字段分配唯一 ID，用于网络传输时压缩字段名。客户端配置由 `AnvilLibSyncClient`
初始化。

```java
// 全局单例 — 由 AnvilLibSyncClient 创建
SyncConfigManager config = AnvilLibSync.SYNC_CONFIG_MANAGER;

// 注册单个同步字段（类名#字段名）
config.register("com.example.MyEntity#health");

// 通过字段名获取 ID
int id = config.getId("com.example.MyEntity#health");

// 通过 ID 反向查找字段名
String fieldName = config.getById(id);

// 批量注册（客户端接收服务端配置时使用）
config.registerAll(syncConfigById);

// 创建配置同步包
SyncConfigurationPayload payload = config.createPayload();
```

### SyncConfigurationPayload

在客户端连接服务端时，将服务端已注册的同步字段 ID 映射发送到客户端。客户端通过 `registerAll()` 应用。

```java
// 服务端 → 客户端配置同步
public record SyncConfigurationPayload(Map<Integer, String> configs) implements IClientboundPacket
```

### SyncConfigurationFinishPayload

配置同步完成信号（`CLIENTBOUND`），客户端收到后确认配置同步结束。

```java
public record SyncConfigurationFinishPayload() implements IClientboundPacket
```

## SideUtil

物理端工具类，提供实体/方块实体查找器和网络发送逻辑。主要由 `SyncPayload` 和 `SyncManager` 内部使用。

| 方法                                             | 说明                                              |
|------------------------------------------------|-------------------------------------------------|
| `registryAccess()`                             | 获取当前端的 RegistryAccess                           |
| `entityFinder(IPayloadContext, UUID)`          | 根据上下文端查找实体                                      |
| `blockEntityFinder(IPayloadContext, BlockPos)` | 根据上下文端查找方块实体                                    |
| `createFriendlyByteBuf(ByteBuf)`               | 创建适配当前端的 FriendlyByteBuf                        |
| `send(SyncDirection, ...)`                     | 根据方向发送 SyncPayload                              |
| `clientSend(Supplier<IPacket>)`                | 客户端发送（→ `ClientPacketDistributor.sendToServer`） |
| `serverSend(T, ID, ...)`                       | 服务端发送（维度感知）                                     |
