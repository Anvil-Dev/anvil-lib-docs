# RPC Remote Procedure Call: Core Entry Points & Call Modes (`module.rpc`)

<BranchContextCard branch="26.3" />

`module.rpc` (artifact `anvillib-rpc-neoforge-26.3`, package `dev.anvilcraft.lib.v2.rpc`) provides a cross-side Remote Procedure Call (RPC) framework featuring **zero manual packet classes, compile-time type-checked method references, one-way calls (`call`), async return values (`invoke`), and virtual-thread synchronous blocking calls (`invokeSync`)**.

In traditional networking, even triggering a static method or querying a single value from the other side requires writing a `CustomPacketPayload` record, `StreamCodec`, channel registration, and a `CompletableFuture` callback table. With `module.rpc`, simply annotate any `static` method with `@RemoteCallable` and call `RPC.call(target, MyClass::myMethod, args...)` or `RPC.invoke(target, MyClass::myFunc, args...)` across sides!

This module is split into 2 sub-documents by functionality:
- **This page (RPC & `@RemoteCallable`)**: Covers `@RemoteCallable`, `@CallableParam`, `RpcTarget`, `RPC`'s three call families (`call` / `invoke` / `invokeSync`), and built-in supported codecs.
- **[Method References, Validators & Config Sync](./refs-and-validation)**: Covers `RpcMethodRef` (`R0..R16`), `RpcFunctionRef` (`F0..F16`), `IRemoteCallableValidator`, dual-instance `RpcRegistry` consistency, and configuration-phase sync.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.3`, this module is included automatically. To depend on `rpc` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-rpc-neoforge-26.3:2.0.0")
}
```

---

## 2. Automatic `StreamCodec` Resolution for Parameters & Return Values

`RpcMethods` resolves the `StreamCodec` for each parameter and return value of a `@RemoteCallable` static method in 3 priority tiers:

1. **Tier 1: Explicit `@CallableParam(clazz = ..., field = "...")`**:
   When placed on a **parameter**, points to a `static StreamCodec` field named `field` in `clazz`; when placed on the **method itself**, specifies the `StreamCodec` field for the **return value**.
2. **Tier 2: Built-in Default Type Table (No Annotation Needed)**:
   The following 20 primitives, arrays, and common vanilla types are built into `RpcMethods.DEFAULTS` and work **without any annotation**:
   - 8 primitives and boxed types: `boolean`/`Boolean`, `byte`/`Byte`, `short`/`Short`, `int`/`Integer` (`VAR_INT`), `long`/`Long` (`VAR_LONG`), `float`/`Float`, `double`/`Double`;
   - Strings & arrays: `String` (`STRING_UTF8`), `byte[]`, `long[]`;
   - Common vanilla types: `UUID` (`UUIDUtil.STREAM_CODEC`), `Tag` (`ByteBufCodecs.TAG`), `CompoundTag` (`ByteBufCodecs.COMPOUND_TAG`).
3. **Tier 3: Unique `public static final StreamCodec` Field Declared on the Type Itself**:
   For example, vanilla `BlockPos` (declares a unique `public static final StreamCodec<ByteBuf, BlockPos> STREAM_CODEC`) or your own `record` (with a single `public static final StreamCodec<..., Self>` constant) is automatically discovered via reflection—**no `@CallableParam` needed**! (`@CallableParam` is only needed to disambiguate if the class declares multiple matching `public static final StreamCodec` fields).

---

## 3. Full Code Example: One-Way Calls, Async Returns & Virtual-Thread Sync Calls

```java
package com.example.mymod.rpc;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.rpc.CallableParam;
import dev.anvilcraft.lib.v2.rpc.RPC;
import dev.anvilcraft.lib.v2.rpc.RemoteCallable;
import dev.anvilcraft.lib.v2.rpc.RpcTarget;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.server.level.ServerPlayer;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;

public final class MachineRpcEndpoints {
    private MachineRpcEndpoints() {
    }

    // 1. Void one-way remote method: int, String, and BlockPos all auto-resolve StreamCodec without @CallableParam
    @RemoteCallable
    public static void notifyOverheatOnClient(BlockPos pos, String machineName, int temperature) {
        MyMod.LOGGER.info("Client received overheat alert for {} at {}: {}°C", machineName, pos, temperature);
    }

    // 2. Value-returning remote method: use @CallableParam to specify a StreamCodec field for a param or return value
    @CallableParam(clazz = BlockPos.class, field = "STREAM_CODEC")
    @RemoteCallable
    public static BlockPos findNearestWaypoint(
        @CallableParam(clazz = GlobalPos.class, field = "STREAM_CODEC") GlobalPos origin,
        int searchRadius
    ) {
        return origin.pos().offset(searchRadius, 0, searchRadius);
    }

    // ================= Caller Examples =================

    /**
     * Server -> specific client player: one-way call and async / virtual-thread value-returning calls
     */
    public static void serverToClientExamples(ServerPlayer player, BlockPos machinePos) {
        RpcTarget target = RpcTarget.player(player);

        // A. One-way call (Fire-and-forget)
        RPC.call(target, MachineRpcEndpoints::notifyOverheatOnClient, machinePos, "Blast Controller", 1800);

        // B. Async call with return value (returns CompletableFuture<BlockPos>, default 100-tick = 5s timeout)
        GlobalPos globalOrigin = GlobalPos.of(player.level().dimension(), machinePos);
        CompletableFuture<BlockPos> future = RPC.invoke(
            target,
            MachineRpcEndpoints::findNearestWaypoint,
            globalOrigin,
            64
        );
        future.thenAccept(resultPos -> MyMod.LOGGER.info("Async response coordinate: {}", resultPos));

        // C. In a Java 21+ virtual thread, block synchronously like a local call (blocking a virtual thread does not block an OS thread!)
        Thread.startVirtualThread(() -> {
            BlockPos resultPos = RPC.invokeSync(
                target,
                MachineRpcEndpoints::findNearestWaypoint,
                globalOrigin,
                64
            );
            MyMod.LOGGER.info("Virtual thread sync response: {}", resultPos);
        });
    }

    /**
     * Client -> Server call: use RpcTarget.server()
     */
    public static void clientToServerExample() {
        CompletableFuture<BlockPos> future = RPC.invoke(
            RpcTarget.server(),
            MachineRpcEndpoints::findNearestWaypoint,
            GlobalPos.of(net.minecraft.world.level.Level.OVERWORLD, BlockPos.ZERO),
            128
        );
    }
}
```

---

## 4. Core Annotations & API Reference

### 1. `@RemoteCallable` & `@CallableParam`

| Annotation | Target (`@Target`) | Attribute Signatures | Description |
| :--- | :---: | :--- | :--- |
| **`@RemoteCallable`** | `METHOD` | `Class<? extends IRemoteCallableValidator> validator() default IRemoteCallableValidator.class;` | Marks a **`static`** method as remotely callable. Before execution, the receiver enforces that the target method is `static` and annotated with `@RemoteCallable`, preventing forged packets from invoking arbitrary methods. |
| **`@CallableParam`** | `PARAMETER`, `METHOD` | `Class<?> clazz();`<br>`String field();` | Points to a `static StreamCodec` field `field` in `clazz`. Applies to the parameter when placed on a parameter, or to the **return value** when placed on the method. |

### 2. `RpcTarget` (Call Target Side)

| Static Factory / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `static RpcTarget player(ServerPlayer player)` | `RpcTarget` | Server to a specific client player (`Server -> Client`). |
| `static RpcTarget server()` | `RpcTarget` | Client to server (`Client -> Server`; client-only, isolated in `ClientRpcTargets` so servers never load client classes). |
| `void send(CustomPacketPayload payload)`<br>`RpcRegistry registry()`<br>`RegistryAccess registryAccess()`<br>`RpcPendingCalls pending()` | Corresponding type | Sends a payload and accesses the registry index, registry access, and pending calls table for this direction. |

### 3. `RPC` Call Entry Class (`dev.anvilcraft.lib.v2.rpc.RPC`)

| Method Family | Overload Range & Signatures | Return Value & Timeout / Thread Rules |
| :--- | :--- | :--- |
| **`RPC.call`** | `call(RpcTarget target, RpcMethodRef.R0..R16 methodRef, args...)` (17 overloads, 0–16 strongly typed params) | `void`. Sends one-way `RpcPayload` (`anvillib_rpc:rpc`); the receiver decodes and runs the target method on its main thread (`ctx.enqueueWork`). |
| **`RPC.callByName`** | `callByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `void`. Escape hatch when args exceed 16 or method references cannot be used: calls by class and unique method name (throws `IllegalStateException` if overloaded/ambiguous). |
| **`RPC.invoke`** | `invoke(RpcTarget target, RpcFunctionRef.F0..F16<R, ...> methodRef, args...)` (17 overloads, 0–16 params) | `CompletableFuture<R>`. Sends `RpcRequestPayload` (`anvillib_rpc:rpc_request`); the receiver runs on its main thread and replies with `RpcResponsePayload` via `ctx.reply`. Completes exceptionally with `TimeoutException` after `100` ticks (5s), `CancellationException` on disconnect, or `CompletionException` if rejected/thrown on the remote side. |
| **`RPC.invokeByName`** | `<R> CompletableFuture<R> invokeByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `CompletableFuture<R>`. Initiates an async value-returning RPC by class and method name. |
| **`RPC.invokeSync`** | • `invokeSync(RpcTarget target, RpcFunctionRef.F0..F16<R, ...> methodRef, args...)`<br>• `invokeSync(RpcTarget target, boolean allowNonVirtual, RpcFunctionRef.F0..F16<R, ...> methodRef, args...)` | `R`. Blocks the current thread waiting for the `invoke` result.<br>**Thread Safety Guardrails**:<br>1. **Never call on the same main thread (`Render thread` / `Server thread`) or Netty IO thread that handles packets**, or it will deadlock waiting for itself to process the reply! Detected thread names matching `Render thread`, `Server thread`, or `Netty *` immediately throw `IllegalStateException`;<br>2. Calling on a non-virtual thread without `allowNonVirtual = true` logs a `WARN` recommending virtual threads (`Executors.newVirtualThreadPerTaskExecutor()`) or async `RPC.invoke`. |
| **`RPC.invokeSyncByName`** | `invokeSyncByName(RpcTarget target, [boolean allowNonVirtual,] Class<?> clazz, String methodName, Object... args)` | `R`. Synchronous blocking RPC by method name. |
