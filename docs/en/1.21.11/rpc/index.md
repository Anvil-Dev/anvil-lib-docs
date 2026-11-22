# `@RemoteCallable` Declarations, Method References & RPC Calls

<BranchContextCard branch="1.21.11" />

`module.rpc` (Mod ID: `anvillib_rpc`, artifact `anvillib-rpc-neoforge-1.21.11`) provides a **type-safe, method-reference-based cross-side Remote Procedure Call (RPC) framework** for NeoForge 21.11.x. By simply annotating a static method with `@RemoteCallable`, without writing any `CustomPacketPayload`, `StreamCodec` registrations, or `PayloadRegistrar` boilerplate, you can fire one-way notifications (`RPC.call`), async request-response calls (`RPC.invoke`), or synchronous blocking calls in virtual threads (`RPC.invokeSync`) between server and client.

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
    implementation("dev.anvilcraft.lib:anvillib-rpc-neoforge-1.21.11:2.0.0")
}
```

## Quick Start: Declaration & Bidirectional Calls

### 1. Declaring Remotely Callable Methods

Only **`static` methods annotated with `@RemoteCallable`** can serve as RPC targets (any visibility—`private`, package-private, or `public`—is supported via reflection, provided all parameters and return value have resolvable `StreamCodec`s).

```java
package com.example.examplemod.rpc;

import dev.anvilcraft.lib.v2.rpc.CallableParam;
import dev.anvilcraft.lib.v2.rpc.RemoteCallable;
import net.minecraft.core.BlockPos;

public final class MachineRpcApi {
    @RemoteCallable
    public static void showToast(String title, int durationTicks) {
        System.out.println("[RPC Toast] " + title + " (" + durationTicks + " ticks)");
    }

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
   - Common objects & arrays: `String` (`STRING_UTF8`), `byte[]` (`BYTE_ARRAY`), `long[]` (`ByteBufCodecs.LONG_ARRAY`), `UUID` (`UUIDUtil.STREAM_CODEC`), `Tag` (`ByteBufCodecs.TAG`), `CompoundTag` (`ByteBufCodecs.COMPOUND_TAG`)
3. **Static Constant Field Declared on the Target Type Itself**:
   - Automatically scans all `public static final` (checked via Java 21 `AccessFlag`) `StreamCodec` fields on the parameter/return type whose payload generic argument is compatible with that type.
   - If exactly one is found, uses it automatically; if multiple or none are found, throws `IllegalStateException` on first encode prompting you to use `@CallableParam`.

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
    public static void notifyPlayer(ServerPlayer player) {
        RPC.call(RpcTarget.player(player), MachineRpcApi::showToast, "Furnace core overclocked", 60);
    }

    public static void queryCoreAsync(BlockPos origin) {
        CompletableFuture<BlockPos> future = RPC.invoke(
            RpcTarget.server(),
            MachineRpcApi::findNearestCore,
            origin,
            16
        );
        future.thenAccept(resultPos -> System.out.println("Nearest core coords: " + resultPos));
    }

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

1. **Must be a static method reference with no captured local/instance variables**: Method references passed to `RPC.call` / `invoke` extract `SerializedLambda` via `writeReplace()`. Passing a lambda expression, instance method reference, or capturing enclosing variables throws `IllegalArgumentException` at runtime.
2. **`invoke` cannot be used on `void` methods**: If the target method returns `void`, `RPC.invoke` / `RPC.invokeSync` throws `IllegalArgumentException`; use `RPC.call` instead.
3. **Timeout & disconnect semantics**: Pending requests registered by `RPC.invoke` are kept for at most **`100` ticks** (`RpcPendingCalls.TIMEOUT_TICKS`); on timeout, `CompletableFuture` fails with `TimeoutException`; on player logout or server stop, unfinished requests fail with `CancellationException`.
4. **Never call `invokeSync` on the main thread**: The main thread processes incoming reply packets, so calling `future.join()` in place deadlocks; calling on a non-virtual thread logs a warning (or only use the `@ApiStatus.Experimental` `allowNonVirtual = true` overload on a dedicated worker pool).

## Full Public API Reference

### `@RemoteCallable` & `@CallableParam`

| Annotation | Package | Attributes & Default | Description |
| --- | --- | --- | --- |
| `@RemoteCallable` | `dev.anvilcraft.lib.v2.rpc` | `Class<? extends IRemoteCallableValidator> validator() default IRemoteCallableValidator.class` | Marks a method as remotely callable and binds a receiver validator |
| `@CallableParam` | `dev.anvilcraft.lib.v2.rpc` | `Class<?> clazz()`, `String field()` | Explicitly specifies the static `StreamCodec` field for a parameter (`PARAMETER`) or return value (`METHOD`) |

### `RpcTarget`

| Method Signature | Description |
| --- | --- |
| `static RpcTarget player(ServerPlayer player)` | Builds a target for a specific client player (Server -> Client) |
| `static RpcTarget server()` | Builds a target for the server (Client -> Server; client-only after connecting) |
| `void send(CustomPacketPayload payload)` | Sends a payload through the corresponding directional network dispatcher |
| `RpcRegistry registry()` / `RegistryAccess registryAccess()` / `RpcPendingCalls pending()` | Returns the registry index, registry access, and pending calls table for this direction |

### `RPC`

| Method Family | Description |
| --- | --- |
| `static void call(RpcTarget target, RpcMethodRef.R0 methodRef)` – `R16<A...P>` | 0–16 strongly typed parameter one-way calls |
| `static void callByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | One-way call by class + unique method name (bypasses the 16-arg limit) |
| `static <R> CompletableFuture<R> invoke(RpcTarget target, RpcFunctionRef.F0<R> methodRef)` – `F16<R, A...P>` | 0–16 strongly typed parameter async request calls |
| `static <R> CompletableFuture<R> invokeByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | Async request call by class + unique method name |
| `static <R> R invokeSync(RpcTarget target, RpcFunctionRef.F0<R> methodRef, ...)` (0–16 args)<br>`@ApiStatus.Experimental static <R> R invokeSync(RpcTarget target, boolean allowNonVirtual, RpcFunctionRef.F0<R> methodRef, ...)` | Blocks on a virtual thread (or explicitly allowed worker thread) and returns the result |
| `static <R> R invokeSyncByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | Synchronous blocking call by class + unique method name |
