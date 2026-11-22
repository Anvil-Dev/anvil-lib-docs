# Method References, Receiver Validators & Configuration Sync (`dev.anvilcraft.lib.v2.rpc`)

<BranchContextCard branch="26.1" />

This page dives into `module.rpc`'s method-reference de-serialization (`RpcMethodRef` / `RpcFunctionRef` / `LambdaResolver`), receiver-side security validators (`IRemoteCallableValidator`), and the dual-instance configuration sync protocol (`RpcRegistry` / `RpcConfigurationTask`) that prevents singleplayer/LAN cross-contamination.

---

## 1. Receiver-Side Security Validators (`IRemoteCallableValidator`)

### 1. Problem & Usage

Because `@RemoteCallable` methods can be triggered over the network, client-to-server RPCs (`RpcTarget.server()`) without permission and distance checks could allow malicious clients to forge arguments and run privileged actions.

`@RemoteCallable(validator = MyValidator.class)` binds an **`IRemoteCallableValidator`** implementation to any remote method:
- **Instantiation & caching**: Validator implementations must have a **no-arg constructor** (any visibility, including `private` or package-private); `RpcMethods` reflectively instantiates and caches it in `VALIDATOR_CACHE` on first call;
- **Timing & interception**: After decoding `Object[] args` on the receiver and **before** `method.invoke(null, args)`, `validator.validate(ctx, method, args)` is called on the receiver's main thread:
  - If `true`: the target method executes normally;
  - If `false`: for one-way `RPC.call`, the server silently drops it; for `RPC.invoke` / `invokeSync`, it immediately replies with `RpcResponsePayload.failure(callId, "RPC call rejected by validator: ...")`, failing the caller's `CompletableFuture` with `CompletionException`!

### 2. Full Code Example: OP Permission Validator & Block Reach Distance Validator

```java
package com.example.mymod.rpc;

import dev.anvilcraft.lib.v2.rpc.IRemoteCallableValidator;
import dev.anvilcraft.lib.v2.rpc.RemoteCallable;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.neoforged.neoforge.network.handling.IPayloadContext;

import java.lang.reflect.Method;

public final class SecureAdminRpc {
    private SecureAdminRpc() {
    }

    /**
     * Validator 1: Requires the caller to be on the server and have OP level >= 2
     */
    public static final class ServerOpValidator implements IRemoteCallableValidator {
        @Override
        public boolean validate(IPayloadContext ctx, Method method, Object[] args) {
            if (!ctx.flow().isServerbound()) return false;
            Player player = ctx.player();
            return player instanceof ServerPlayer serverPlayer && serverPlayer.hasPermissions(2);
        }
    }

    /**
     * Validator 2: Requires arg 0 to be a BlockPos within 8 blocks of the calling player
     */
    public static final class WithinBlockReachValidator implements IRemoteCallableValidator {
        @Override
        public boolean validate(IPayloadContext ctx, Method method, Object[] args) {
            if (!(ctx.player() instanceof ServerPlayer player)) return false;
            if (args.length == 0 || !(args[0] instanceof BlockPos targetPos)) return false;
            return player.distanceToSqr(targetPos.getCenter()) <= 64.0;
        }
    }

    // Bind ServerOpValidator: calls from non-OP players are blocked
    @RemoteCallable(validator = ServerOpValidator.class)
    public static void resetGlobalMultiplier(float multiplier) {
        // Safely execute admin logic...
    }

    // Bind WithinBlockReachValidator: calls from > 8 blocks away are rejected and fail invoke
    @RemoteCallable(validator = WithinBlockReachValidator.class)
    public static int queryVaultBalance(BlockPos vaultPos) {
        return 1024;
    }
}
```

---

## 2. Serializable Method Reference Interfaces (`RpcMethodRef` / `RpcFunctionRef`)

How does `RPC.call(target, MyClass::myMethod, ...)` locate the target `Method` without passing a string method name?

Because `RpcMethodRef.R0..R16` and `RpcFunctionRef.F0..F16` all extend **`java.io.Serializable`**. When javac compiles a method reference (`MyClass::myMethod`) targeting a `Serializable` functional interface, it synthesizes a `private Object writeReplace()` method returning `java.lang.invoke.SerializedLambda`, which accurately records:
- `getImplClass()`: internal name of the target method's declaring class;
- `getImplMethodName()`: target method name;
- `getImplMethodSignature()`: JVM bytecode method descriptor (e.g., `(Lnet/minecraft/core/BlockPos;I)V`), naturally supporting **overloaded method disambiguation**!

| Class | Inner Functional Interfaces | Purpose |
| :--- | :--- | :--- |
| **`RpcMethodRef`** | `R0`, `R1<A>`, `R2<A, B>` ... up to `R16<A, B, ..., P>` (17 interfaces, all `void invoke(...)`) | Used by void `RPC.call`. |
| **`RpcFunctionRef`** | `F0<R>`, `F1<R, A>`, `F2<R, A, B>` ... up to `F16<R, A, ..., P>` (17 interfaces, all `R invoke(...)`) | Used by value-returning `RPC.invoke` and `RPC.invokeSync`. |

---

## 3. Dual-Instance Index Table & Configuration Sync Architecture (`RpcRegistry` / `RpcPendingCalls`)

To avoid sending verbose `"com.example.MyClass#myMethod(L...;)V"` strings in every RPC packet, `module.rpc` sends **only a `VarInt` integer method ID** on the wire:

1. **Dual `RpcRegistry` Instance Isolation (Preventing Singleplayer/LAN Cross-Contamination)**:
   - **Authoritative instance `AnvilLibRpc.REGISTRY` (`authoritative = true`)**: Scans `ModFileScanData` across all loaded mods for `@RemoteCallable` methods and assigns integer IDs sorted lexicographically by canonical key. This instance is **never overwritten by network packets**.
   - **Client adopted instance `AnvilLibRpcClient.REGISTRY` (`authoritative = false`)**: When connecting to a server during `PacketProtocol.CONFIGURATION`, the server's `RpcConfigurationTask` (`anvillib_rpc:rpc_config`) sends `RpcConfigurationPayload`; the client calls `AnvilLibRpcClient.REGISTRY.adopt(map)` and replies with `RpcConfigurationFinishPayload`.
   - Thus, even if a player joins a remote server with a different mod list, returns to the title screen, and opens a singleplayer world to LAN, the integrated server still sends its unpolluted local `AnvilLibRpc.REGISTRY`!
2. **Dual `RpcPendingCalls` Instance Isolation**:
   Server (`AnvilLibRpc.PENDING`) and client (`AnvilLibRpcClient.PENDING`) each maintain independent `callId` counters and pending-future maps, ticked every tick by `ServerTickEvent.Post` and `ClientTickEvent.Post` for `TIMEOUT_TICKS = 100` (5s) timeouts, and cleared via `clear()` on `ServerStoppedEvent` / `ClientPlayerNetworkEvent.LoggingOut`.
