# `@RemoteCallable` Declarations, Method References & RPC Calls

`module.rpc` (Mod ID: `anvillib_rpc`) provides a **type-safe, method-reference-based cross-side Remote Procedure Call (RPC) framework** for NeoForge 1.21.1. By simply annotating a static method with `@RemoteCallable`, without writing any `CustomPacketPayload`, `StreamCodec` registrations, or `PayloadRegistrar` boilerplate, you can fire one-way notifications (`RPC.call`), async request-response calls (`RPC.invoke`), or synchronous blocking calls in virtual threads (`RPC.invokeSync`) between server and client.

## Why `module.rpc`?

Hand-writing vanilla/NeoForge network packets has three common burdens:
1. **Boilerplate bloat**: Every action requires a `record Payload`, `StreamCodec`, channel registration, and main-thread queue dispatch.
2. **Bandwidth & protocol security**: Sending plaintext class/method names wastes bandwidth and invites spoofing. `anvillib_rpc` sends an authoritative integer index table from server to client during Configuration, so runtime packets only carry `VarInt` indices and binary args; the receiver verifies the target method is `static` and annotated with `@RemoteCallable`.
3. **No built-in request-response correlation**: Getting a return value with vanilla packets requires managing `callId`, timeouts, and disconnect cleanup yourself; `RPC.invoke` / `RPC.invokeSync` include a built-in `100`-tick timeout and automatic `CancellationException` on disconnect.

## Setup

### Gradle Repositories & Dependencies

Official releases are available on Maven Central, but `Cjsah Maven` with `exclusiveContent` filtering is recommended to avoid NeoForge Maven's incomplete Maven Central sync causing interface injection or transitive metadata errors:

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

## Quick Start: Declaration & Bidirectional Calls

### 1. Declaring Remotely Callable Methods

Only **`static` methods annotated with `@RemoteCallable`** can serve as RPC targets (any visibility—`private`, package-private, or `public`—is supported via reflection, provided no parameter has an unresolvable custom type).

```java
package com.example.examplemod.rpc;

import dev.anvilcraft.lib.v2.rpc.CallableParam;
import dev.anvilcraft.lib.v2.rpc.RemoteCallable;
import net.minecraft.core.BlockPos;

public final class MachineRpcApi {
    // 1. One-way RPC: primitives, String, byte[]/long[], UUID, Tag/CompoundTag need no annotations
    @RemoteCallable
    public static void showToast(String title, int durationTicks) {
        System.out.println("[RPC Toast] " + title + " (" + durationTicks + " ticks)");
    }

    // 2. Custom param/return types: if BlockPos lacks a unique matching public static final StreamCodec, specify via @CallableParam
    @CallableParam(clazz = BlockPos.class, field = "STREAM_CODEC")
    @RemoteCallable
    public static BlockPos findNearestCore(
        @CallableParam(clazz = BlockPos.class, field = "STREAM_CODEC") BlockPos origin,
        int radius
    ) {
        return origin.offset(0, radius, 0);
    }
}
```

### 2. `StreamCodec` Resolution Order for Parameters & Return Values

For each parameter and non-`void` return type, the framework resolves `StreamCodec` in the following priority order (cached per method):

1. **Explicit `@CallableParam(clazz = ..., field = "...")`**:
   - When placed on a **parameter**, reads the `static StreamCodec` field `field` on `clazz` for that parameter.
   - When placed on the **method**, reads that field for the method's **return value**.
2. **Built-in Default Codec Table**: The following types work out of the box without `@CallableParam`:
   - Primitives & boxed types: `boolean`/`Boolean` (`BOOL`), `byte`/`Byte` (`BYTE`), `short`/`Short` (`SHORT`), `int`/`Integer` (`VAR_INT`), `long`/`Long` (`VAR_LONG`), `float`/`Float` (`FLOAT`), `double`/`Double` (`DOUBLE`)
   - Common objects & arrays: `String` (`STRING_UTF8`), `byte[]` (`BYTE_ARRAY`), `long[]` (`VarInt` length + per-element `VarLong`), `UUID` (`UUIDUtil.STREAM_CODEC`), `Tag` (`ByteBufCodecs.TAG`), `CompoundTag` (`ByteBufCodecs.COMPOUND_TAG`)
3. **Static Constant Field Declared on the Target Type Itself**:
   - Automatically scans all `public static final` `StreamCodec` fields on the parameter/return type whose payload generic argument is compatible with that type.
   - If exactly one is found, uses it automatically; if multiple (ambiguous) or none are found, throws `IllegalStateException` on first encode prompting you to use `@CallableParam`.

::: tip Do Vanilla Classes Like `BlockPos` Need `@CallableParam`?
When `BlockPos` in NeoForge 1.21.1 has `STREAM_CODEC` alongside other static fields (if ambiguous or inherited from superinterfaces), explicitly annotating `@CallableParam(clazz = BlockPos.class, field = "STREAM_CODEC")` avoids scan ambiguity.
:::

### 3. Initiating One-Way, Async & Virtual-Thread Sync Calls

```java
package com.example.examplemod.rpc;

import dev.anvilcraft.lib.v2.rpc.RPC;
import dev.anvilcraft.lib.v2.rpc.RpcTarget;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;

public final class RpcCallerExamples {
    // Case A: Server -> Client one-way call (fire-and-forget)
    public static void notifyPlayer(ServerPlayer player) {
        RPC.call(RpcTarget.player(player), MachineRpcApi::showToast, "Furnace core overclocked", 60);
    }

    // Case B: Client -> Server async request returning CompletableFuture
    public static void queryCoreAsync(BlockPos origin) {
        CompletableFuture<BlockPos> future = RPC.invoke(
            RpcTarget.server(),
            MachineRpcApi::findNearestCore,
            origin,
            16
        );
        future.thenAccept(resultPos -> System.out.println("Nearest core coords: " + resultPos));
    }

    // Case C: Synchronous blocking read in a Java 21 virtual thread (does not block platform or main threads)
    public static void queryCoreInVirtualThread(ServerPlayer player, BlockPos origin) {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            executor.submit(() -> {
                BlockPos result = RPC.invokeSync(
                    RpcTarget.player(player),
                    MachineRpcApi::findNearestCore,
                    origin,
                    8
                );
                System.out.println("Sync return: " + result);
            });
        }
    }
}
```

## Common Pitfalls & Limitations

1. **Must be a static method reference with no captured local/instance variables**: Method references passed to `RPC.call` / `invoke` extract `SerializedLambda` via `writeReplace()`. Passing a lambda expression, instance method reference, or capturing enclosing variables prevents resolving a unique `Method` and throws `IllegalArgumentException` at runtime.
2. **`invoke` cannot be used on `void` methods**: If the target method returns `void`, `RPC.invoke` / `RPC.invokeSync` throws `IllegalArgumentException`; use `RPC.call` instead.
3. **Timeout & disconnect semantics**: Pending requests registered by `RPC.invoke` are kept for at most **`100` ticks** (`RpcPendingCalls.TIMEOUT_TICKS`); on timeout, `CompletableFuture` fails with `TimeoutException`; on player logout or server stop, unfinished requests fail immediately with `CancellationException`.
4. **Never call `invokeSync` on the main thread**: Calling `invokeSync(target, methodRef, ...)` on a non-virtual thread logs a warning; if a controlled background platform thread pool must block, use the `@ApiStatus.Experimental` `allowNonVirtual = true` overload, but **never call it on the Minecraft server/client main thread** (which processes incoming reply packets, so `future.join()` deadlocks!).

## Full Public API Reference

### `@RemoteCallable`

Package: `dev.anvilcraft.lib.v2.rpc` · Target: `ElementType.METHOD` · Retention: `RetentionPolicy.RUNTIME`

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `validator()` | `Class<? extends IRemoteCallableValidator>` | `IRemoteCallableValidator.class` | Specifies the receiver-side security validator; default sentinel interface allows all calls |

### `@CallableParam`

Package: `dev.anvilcraft.lib.v2.rpc` · Target: `{ElementType.PARAMETER, ElementType.METHOD}` · Retention: `RetentionPolicy.RUNTIME`

| Attribute | Type | Description |
| --- | --- | --- |
| `clazz()` | `Class<?>` | Class declaring the target `static StreamCodec` field |
| `field()` | `String` | Name of the `static StreamCodec` field |

### `RpcTarget`

Package: `dev.anvilcraft.lib.v2.rpc`

| Method Signature | Description |
| --- | --- |
| `static RpcTarget player(ServerPlayer player)` | Builds a target for a specific client player (Server -> Client) |
| `static RpcTarget server()` | Builds a target for the server (Client -> Server; **client-only and only after connecting to a server**) |
| `void send(CustomPacketPayload payload)` | Sends a payload through the corresponding directional network dispatcher |
| `RpcRegistry registry()` | Returns the encoding index table for this direction (authoritative on server, adopted on client) |
| `RegistryAccess registryAccess()` | Returns the registry access needed for encoding |
| `RpcPendingCalls pending()` | Returns the pending table used by this caller to track `invoke` responses |

### `RPC`

Package: `dev.anvilcraft.lib.v2.rpc`

#### 1. One-Way Void Calls (`call` / `callByName`)

| Method Family | Parameter List | Description |
| --- | --- | --- |
| `static void call(RpcTarget target, RpcMethodRef.R0 methodRef)` – `R16<A...P>` | `target`, `methodRef`, `a...p` (0 to 16 strongly typed args) | Compile-time checked arg count and types; executes asynchronously on the remote main thread with no return value |
| `static void callByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | target class, unique method name, varargs | Escape hatch bypassing the 16-arg limit or when method references aren't available; throws `IllegalStateException` if overloaded |

#### 2. Async Value-Returning Calls (`invoke` / `invokeByName`)

| Method Family | Return Type | Description |
| --- | --- | --- |
| `static <R> CompletableFuture<R> invoke(RpcTarget target, RpcFunctionRef.F0<R> methodRef)` – `F16<R, A...P>` | `CompletableFuture<R>` | Sends request and completes `future` on reply; fails with `TimeoutException` after 100 ticks, or `CompletionException` on validator rejection/exception |
| `static <R> CompletableFuture<R> invokeByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `CompletableFuture<R>` | Method-name escape hatch for `invoke`; requires unique `@RemoteCallable` static method name in the target class |

#### 3. Synchronous Blocking Calls (`invokeSync` / `invokeSyncByName`)

| Method Family | Return Type | Description |
| --- | --- | --- |
| `static <R> R invokeSync(RpcTarget target, RpcFunctionRef.F0<R> methodRef, ...)` (0–16 args) | `R` | Blocks on the current (preferably virtual) thread waiting for `future.join()` and returns `R`; logs a warning if called on a non-virtual thread |
| `@ApiStatus.Experimental static <R> R invokeSync(RpcTarget target, boolean allowNonVirtual, RpcFunctionRef.F0<R> methodRef, ...)` (0–16 args) | `R` | Silently skips the non-virtual-thread warning when `allowNonVirtual = true`, intended for dedicated blocking worker pools |
| `static <R> R invokeSyncByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `R` | Method-name escape hatch for `invokeSync`; unlimited args, requires unique method name |
