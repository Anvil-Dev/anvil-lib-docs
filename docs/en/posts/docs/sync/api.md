---
title: Sync Core API
prev: false
next: false
---

# Core API <Badge type="tip" text=">=26.1" />

## @Sync Annotation

Marks a class as a synchronizable type, specifying the default sync direction.

```java
@Target(ElementType.TYPE)
public @interface Sync {
    SyncDirection value() default SyncDirection.BOTH;
}
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| value | `SyncDirection` | `BOTH` | Default sync direction for this class |

The direction defined in the annotation is automatically applied to all `SyncProxy` fields in the class by `SyncBytecodeInjector` at compile/class-load time — completely transparent.

## SyncDirection

```java
public enum SyncDirection {
    BOTH(true, true),   // Bidirectional
    C2S(true, false),   // Client → Server only
    S2C(false, true);   // Server → Client only

    boolean createByClient;
    boolean createByServer;
}
```

## SyncProxy\<T\>

Data synchronization proxy wrapping a field value with automatic codec and change propagation.

### Constructors

```java
new SyncProxy<>(initialValue);                // Auto-infer StreamCodec
new SyncProxy<>(initialValue, customCodec);   // Custom StreamCodec
new SyncProxy<>(type);                        // Null value, codec from type
new SyncProxy<>(customCodec);                 // Null value, custom codec
```

### Core Methods

| Method | Description |
|--------|-------------|
| `T getValue()` | Get current value |
| `void setValue(@Nullable T value)` | Set value, detect changes and auto-send |
| `SyncProxy<T> direction(SyncDirection)` | Set sync direction, returns this (fluent) |
| `void encode(ByteBuf)` | Encode current value to buffer |
| `void setValue(ByteBuf, boolean serverbound)` | Decode from buffer; triggers sync when serverbound=true |

### Default StreamCodec Types (18 types)

Auto-provided for: `CompoundTag`, `Tag`, `Vector3fc`, `Quaternionfc`, `PropertyMap`, `GameProfile`, `BlockPos`, `Component`, `ItemStack`, `ItemStackTemplate`, `String`, `Boolean`/`boolean`, `Double`/`double`, `Float`/`float`, `Long`/`long`, `Integer`/`int`, `Short`/`short`, `Byte`/`byte`, `long[]`, `byte[]`. Custom types must use `new SyncProxy<>(value, customCodec)`.

## SyncManager

```java
public class SyncManager {
    void compileContent();
    <P, ID> SyncRegisterEntry<P, ID> contains(Class<?> clazz);
}
```

Singleton via `AnvilLibSync.SYNC_MANAGER`. `contains()` supports inheritance matching via `isAssignableFrom`.

## SyncRegisterEntry\<T, ID\> — Object Location Strategy

`SyncRegisterEntry` is more than a registry entry — it defines a **complete object location strategy**. It tells AnvilLib: for objects carrying sync fields, how to encode their identity for network transmission, and how to find them back on the other side.

```java
public record SyncRegisterEntry<T, ID>(
    Class<?> clazz,                                      // Object type carrying SyncProxy fields
    StreamCodec<ByteBuf, ID> idCodec,                    // How to encode/decode the object identifier
    Function<T, ID> idGetter,                            // How to get the unique identifier from the object
    Finder<T, ID> finder,                                // How to find the object back given the identifier
    boolean dimension,                                   // Whether dimension-aware distribution is needed
    @Nullable Function<T, ResourceKey<Level>> dimensionGetter // How to get the dimension
) {
    @FunctionalInterface
    interface Finder<T, ID> {
        @Nullable T apply(IPayloadContext context, ID id) throws Exception;
    }
}
```

### Field Meanings

| Field | Purpose |
|-------|---------|
| `clazz` | The type that carries `SyncProxy` fields (the proxy's parent) |
| `idCodec` | Codec for the identifier on the network (e.g., `UUIDUtil.STREAM_CODEC` for UUIDs) |
| `idGetter` | Extract the unique identifier from the object when sending |
| `finder` | Look up the target object from the decoded identifier + context when receiving (may return null) |
| `dimension` | Enable dimension-aware distribution (only players in the same dimension receive) |
| `dimensionGetter` | Extract the `ResourceKey<Level>` from the object |

### Factory Methods

```java
SyncRegisterEntry.create(type, idCodec, idGetter, finder);          // No dimension
SyncRegisterEntry.create(type, idCodec, idGetter, finder, dimGetter); // With dimension
SyncRegisterEntry.create(type, idCodec, idGetter, finder, dim, dimGetter); // Full
```

Dimension mode auto-selects send strategy based on `id` type: `BlockPos` → chunk tracking, `Entity` → entity tracking, otherwise → per-dimension broadcast.

## Bytecode Injection (Transparent)

When a class is annotated with `@Sync`, the framework auto-injects at class-load time (completely transparent to users):

```java
// Injected at the end of <init> (instance) or <clinit> (static):
// 1. proxy.setParent(this / Owner.class)       —  associate proxy with its parent
// 2. proxy.setFieldName("fieldName")           —  record field name for reflection
// 3. proxy.setDirection(SyncDirection.XXX)     —  apply @Sync annotation direction
```

- `SyncTargetIndex` scans all mod annotations at startup
- `SyncClassProcessorProvider` triggers injection only for indexed classes
- `SyncBytecodeInjector` performs the actual ASM transformation

> **Users do nothing**: just declare fields as `public final SyncProxy<T>` and add `@Sync` to the class.

## SideUtil

Physical-side utility for entity/block entity finding and network send logic. Internal to `SyncPayload` and `SyncManager`.

| Method | Description |
|--------|-------------|
| `registryAccess()` | Get current side RegistryAccess |
| `entityFinder(IPayloadContext, UUID)` | Find entity |
| `blockEntityFinder(IPayloadContext, BlockPos)` | Find block entity |
| `createFriendlyByteBuf(ByteBuf)` | Create side-appropriate buffer |
| `send(SyncDirection, ...)` | Dispatch SyncPayload |
| `clientSend(Supplier<IPacket>)` | Client → Server |
| `serverSend(T, ID, ...)` | Server → Clients (dimension-aware) |
