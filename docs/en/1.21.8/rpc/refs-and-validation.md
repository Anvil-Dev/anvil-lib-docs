# Method References, Validators & Configuration Sync

<BranchContextCard branch="1.21.8" />

This page explains three underlying mechanisms of `module.rpc`: **the `RpcMethodRef` / `RpcFunctionRef` functional interface families**, **`IRemoteCallableValidator` receiver-side permission validators**, and **cross-side index consistency during the Configuration phase**.

## Method Reference Interface Families (`RpcMethodRef` & `RpcFunctionRef`)

To satisfy both Java compile-time strong type checking and target resolution across the network, method reference parameters to `RPC.call`, `RPC.invoke`, and `RPC.invokeSync` extend `java.io.Serializable`:

- **`RpcMethodRef` (`void`)**: Contains 17 static nested `@FunctionalInterface`s from `R0` to `R16` (`void invoke(...)`).
- **`RpcFunctionRef` (returning `R`)**: Contains 17 static nested `@FunctionalInterface`s from `F0<R>` to `F16<R, A, ..., P>` (`R invoke(...)`).

When a method has more than 16 parameters or requires dynamic reflective dispatch in generic utilities, use `RPC.callByName`, `RPC.invokeByName`, and `RPC.invokeSyncByName` instead.

## Receiver-Side Security Validators (`IRemoteCallableValidator`)

`@RemoteCallable(validator = ...)` provides a declarative **pre-execution security gate**:
- Executes on the **receiver side** (after parameters are decoded by `StreamCodec` and before `method.invoke`).
- Implementations must have a **no-arg constructor**; the framework reflectively instantiates and caches the instance on first call.
- Returning `true` allows execution; returning `false` rejects it (`call` silently drops it; `invoke` / `invokeSync` fails the caller's `CompletableFuture` with `CompletionException`).

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
        return true;
    }

    public static final class OpAndDistanceValidator implements IRemoteCallableValidator {
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

### `@ApiStatus.Internal` Internal Components

| Internal Class | Package | Core Members / Responsibilities |
| --- | --- | --- |
| `AnvilLibRpc` | `dev.anvilcraft.lib.v2.rpc` | Module entry (`MOD_ID = "anvillib_rpc"`, `MAIN_ID = "anvillib"`), holds server `REGISTRY` and `PENDING`, registers config task and server tick/stop cleanup |
| `AnvilLibRpcClient` | `dev.anvilcraft.lib.v2.rpc.client` | `@Mod(dist = Dist.CLIENT)` client entry, holds client `REGISTRY` and `PENDING`, drives client tick timeouts and logout cleanup |
| `AnvilLibRpcNetwork` | `dev.anvilcraft.lib.v2.rpc` | Auto-registers all RPC packets at protocol version `"1"` in `RegisterPayloadHandlersEvent` |
| `RpcRegistry` | `dev.anvilcraft.lib.v2.rpc` | `index(Method)`, `byIndex(int)`, `snapshot()`, `adopt(Map)`; client calls before sync throw `IllegalStateException` |
| `RpcPendingCalls` | `dev.anvilcraft.lib.v2.rpc` | `TIMEOUT_TICKS = 100`; tracks pending calls, throwing `TimeoutException` on timeout and `CancellationException` on shutdown |
| `RpcPayload` / `Request` / `Response` | `dev.anvilcraft.lib.v2.rpc` | Network payloads `anvillib_rpc:rpc`, `anvillib_rpc:rpc_request`, `anvillib_rpc:rpc_response` |
| `RpcConfigurationTask` / `Payload` / `Finish` | `dev.anvilcraft.lib.v2.rpc.config` | `anvillib_rpc:rpc_config` configuration task and index map ack packet |
| `IRpcPayload` | `dev.anvilcraft.lib.v2.rpc` | Internal `encodeParams` / `decodeParams` byte array codec helper interface |
