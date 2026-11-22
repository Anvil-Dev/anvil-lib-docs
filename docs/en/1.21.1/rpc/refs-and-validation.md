# Method References, Validators & Configuration Sync

This page explains three underlying mechanisms of `module.rpc`: **the `RpcMethodRef` / `RpcFunctionRef` functional interface families**, **`IRemoteCallableValidator` receiver-side permission validators**, and **cross-side index consistency during the Configuration phase**.

## Method Reference Interface Families (`RpcMethodRef` & `RpcFunctionRef`)

To satisfy both Java compile-time strong type checking and target resolution across JVM/network boundaries, method reference parameters to `RPC.call`, `RPC.invoke`, and `RPC.invokeSync` are not plain `Runnable` or `Consumer`, but dedicated `@FunctionalInterface`s extending `java.io.Serializable`:

- **`RpcMethodRef` (`void`)**: Contains 17 static nested functional interfaces from `R0` to `R16`.
  - `RpcMethodRef.R0` -> `void invoke()`
  - `RpcMethodRef.R1<A>` -> `void invoke(A a)`
  - ...
  - `RpcMethodRef.R16<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>` -> `void invoke(A a, ..., P p)`
- **`RpcFunctionRef` (returning `R`)**: Contains 17 static nested functional interfaces from `F0<R>` to `F16<R, A, ..., P>`.
  - `RpcFunctionRef.F0<R>` -> `R invoke()`
  - `RpcFunctionRef.F1<R, A>` -> `R invoke(A a)`
  - ...
  - `RpcFunctionRef.F16<R, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>` -> `R invoke(A a, ..., P p)`

When a method has more than 16 parameters or requires dynamic reflective dispatch in generic utilities, use `RPC.callByName`, `RPC.invokeByName`, and `RPC.invokeSyncByName` (the method name must not be overloaded in the target class).

## Receiver-Side Security Validators (`IRemoteCallableValidator`)

Never trust RPC arguments sent from client to server. `@RemoteCallable` provides a declarative **pre-execution security gate** via `validator`:

- Validation runs on the **receiver side** (after arguments are decoded by `StreamCodec` and before `method.invoke`).
- Implementations must have a **no-arg constructor** (`private` or package-private is fine); the framework reflectively instantiates and caches the instance on first call.
- Returning `true` allows execution; returning `false` rejects it:
  - For **`RPC.call`**: silently drops the invocation without throwing.
  - For **`RPC.invoke` / `RPC.invokeSync`**: the receiver replies with a failure response, failing the caller's `CompletableFuture` with `CompletionException("Remote RPC failed: ...")`.

### Full Validator Example: OP Permission + Reach Distance Validator

```java
package com.example.examplemod.rpc;

import dev.anvilcraft.lib.v2.rpc.CallableParam;
import dev.anvilcraft.lib.v2.rpc.IRemoteCallableValidator;
import dev.anvilcraft.lib.v2.rpc.RemoteCallable;
import net.minecraft.core.BlockPos;
import net.minecraft.network.PacketFlow;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.neoforged.neoforge.network.handling.IPayloadContext;

import java.lang.reflect.Method;

public final class AdminBlockActions {
    @RemoteCallable(validator = OpAndDistanceValidator.class)
    public static boolean resetMachine(
        @CallableParam(clazz = BlockPos.class, field = "STREAM_CODEC") BlockPos pos
    ) {
        // Safe to trust that pos is within reach and the player has OP level 2
        return true;
    }

    public static final class OpAndDistanceValidator implements IRemoteCallableValidator {
        // Must have a no-arg constructor
        public OpAndDistanceValidator() {
        }

        @Override
        public boolean validate(IPayloadContext ctx, Method method, Object[] args) {
            if (ctx.flow() != PacketFlow.SERVERBOUND) {
                return false;
            }
            Player player = ctx.player();
            if (!(player instanceof ServerPlayer serverPlayer) || !serverPlayer.hasPermissions(2)) {
                return false;
            }
            if (args.length > 0 && args[0] instanceof BlockPos targetPos) {
                return serverPlayer.blockPosition().distSqr(targetPos) <= 64.0 * 64.0;
            }
            return false;
        }
    }
}
```

## Index Mapping, Configuration Sync & Internal Components

To avoid sending plaintext method signatures on the wire while resolving method index mismatches caused by differing mod load orders or client-only mods, `module.rpc` uses a **server authoritative table + client adopted table + Configuration sync task** architecture:

```text
[Server Startup Load]
   └── AnvilLibRpc.REGISTRY (authoritative = true)
          Scans all @RemoteCallable methods in LoadingModList and builds "ClassName#methodName(desc)" <-> int index

[Player Joins Server - NeoForge Configuration Phase]
   ├── Server RpcConfigurationTask sends RpcConfigurationPayload(snapshot)
   ├── Client AnvilLibRpcClient.REGISTRY (authoritative = false) calls adopt(map) to adopt authoritative map
   └── Client replies with RpcConfigurationFinishPayload to finish configuration phase

[Runtime Disconnect / Server Stop]
   ├── ClientPlayerNetworkEvent.LoggingOut -> clears AnvilLibRpcClient.PENDING (client pending calls only)
   └── ServerStoppedEvent -> clears AnvilLibRpc.PENDING (server pending calls only)
```

- **Singleplayer / LAN host dual-instance isolation**: The integrated server's authoritative `AnvilLibRpc.REGISTRY` is **never overwritten by `adopt()`**; even if a client disconnects from a remote server and opens a LAN world, the integrated server still sends its unpolluted local authoritative table. Likewise, both sides maintain independent `RpcPendingCalls` (`AnvilLibRpc.PENDING` and `AnvilLibRpcClient.PENDING`) keyed by `ctx.flow()` so incrementing `callId`s in the same JVM never collide.

### `@ApiStatus.Internal` Internal Components

The following classes are marked `@ApiStatus.Internal`; you do not need to touch them in normal `RPC` usage, only for debugging packet versions or timeout behavior:

| Internal Class | Package | Core Members / Responsibilities |
| --- | --- | --- |
| `AnvilLibRpc` | `dev.anvilcraft.lib.v2.rpc` | Module entry (`MOD_ID = "anvillib_rpc"`, `MAIN_ID = "anvillib"`), holds server `REGISTRY` and `PENDING`, registers config task and server tick/stop cleanup |
| `AnvilLibRpcClient` | `dev.anvilcraft.lib.v2.rpc.client` | `@Mod(dist = Dist.CLIENT)` client entry, holds client `REGISTRY` and `PENDING`, drives client tick timeouts and logout cleanup |
| `AnvilLibRpcNetwork` | `dev.anvilcraft.lib.v2.rpc` | Auto-registers all RPC packets at protocol version `"1"` in `RegisterPayloadHandlersEvent` |
| `RpcRegistry` | `dev.anvilcraft.lib.v2.rpc` | `index(Method)`, `byIndex(int)`, `snapshot()`, `adopt(Map)`; client calls before sync throw `IllegalStateException` |
| `RpcPendingCalls` | `dev.anvilcraft.lib.v2.rpc` | `TIMEOUT_TICKS = 100`; tracks `callId -> (method, future, registeredTick)`, throwing `TimeoutException` on timeout and `CancellationException` on shutdown |
| `RpcPayload` | `dev.anvilcraft.lib.v2.rpc` | One-way `RPC.call` payload (`anvillib_rpc:rpc`), selecting encode/decode index table by send/receive direction |
| `RpcRequestPayload` | `dev.anvilcraft.lib.v2.rpc` | Request payload (`anvillib_rpc:rpc_request`); replies with `ctx.reply(failure)` and rethrows if validator rejects or target throws |
| `RpcResponsePayload` | `dev.anvilcraft.lib.v2.rpc` | Response payload (`anvillib_rpc:rpc_response`), decoding via `RpcMethods.returnCodec` and completing `CompletableFuture` |
| `RpcConfigurationTask` | `dev.anvilcraft.lib.v2.rpc.config` | Configuration-phase sync task (`anvillib_rpc:rpc_config`) |
| `RpcConfigurationPayload` / `Finish` | `dev.anvilcraft.lib.v2.rpc.config` | Mapping snapshot packet and client finish ack (`anvillib_rpc:rpc_config_finish`) |
| `IRpcPayload` | `dev.anvilcraft.lib.v2.rpc` | Internal `encodeParams` / `decodeParams` byte array codec helper interface |
