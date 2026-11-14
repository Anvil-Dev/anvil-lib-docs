# 方法引用、校验器与配置同步

本篇深入说明 `module.rpc` 的三项底层机制：**`RpcMethodRef` / `RpcFunctionRef` 函数式接口簇**、**`IRemoteCallableValidator` 接收端权限校验器**，以及 **Configuration 阶段跨端索引一致性保证**。

## 方法引用接口簇 (`RpcMethodRef` & `RpcFunctionRef`)

为了同时满足 Java 编译期强类型检查和跨 JVM/网络传递时的目标还原，`RPC.call`、`RPC.invoke` 与 `RPC.invokeSync` 的方法引用参数并不是普通的 `Runnable` 或 `Consumer`，而是继承自 `java.io.Serializable` 的专用 `@FunctionalInterface`：

- **`RpcMethodRef`（无返回值，`void`）**：包含 `R0` 到 `R16` 共 17 个静态嵌套函数式接口。
  - `RpcMethodRef.R0` -> `void invoke()`
  - `RpcMethodRef.R1<A>` -> `void invoke(A a)`
  - ...
  - `RpcMethodRef.R16<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>` -> `void invoke(A a, ..., P p)`
- **`RpcFunctionRef`（有返回值，`R`）**：包含 `F0<R>` 到 `F16<R, A, ..., P>` 共 17 个静态嵌套函数式接口。
  - `RpcFunctionRef.F0<R>` -> `R invoke()`
  - `RpcFunctionRef.F1<R, A>` -> `R invoke(A a)`
  - ...
  - `RpcFunctionRef.F16<R, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>` -> `R invoke(A a, ..., P p)`

当方法参数多于 16 个，或你需要在泛型工具层动态反射分发时，请改用 `RPC.callByName`、`RPC.invokeByName` 与 `RPC.invokeSyncByName`（注意目标类中对应方法名不得重载）。

## 接收端安全校验器 (`IRemoteCallableValidator`)

永远不要信任客户端发往服务端的 RPC 参数。`@RemoteCallable` 通过 `validator` 属性提供声明式的**执行前置安全闸口**：

- 校验逻辑在**接收端**执行（即方法真正 `method.invoke` 之前、参数已经通过 `StreamCodec` 解码之后）。
- 实现类必须提供**无参构造器**（可为 `private` 或包级私有），框架首次调用时反射实例化并永久缓存该实例。
- 返回 `true` 放行；返回 `false` 拒绝：
  - 若发起方使用的是 **`RPC.call`**：静默丢弃本次调用，不抛异常。
  - 若发起方使用的是 **`RPC.invoke` / `RPC.invokeSync`**：接收端回复失败响应，使发起方的 `CompletableFuture` 以 `CompletionException("Remote RPC failed: ...")` 异常完成。

### 完整校验器示例：OP 权限 + 距离校验

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
        // 此处可安全信任 pos 在玩家操作范围内且玩家拥有 2 级 OP 权限
        return true;
    }

    public static final class OpAndDistanceValidator implements IRemoteCallableValidator {
        // 必须具有无参构造器
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

## 索引映射、配置阶段同步与内部组件

为了同时避免线上明文传输方法签名的开销，并解决双端模组列表顺序/可选客户端模组差异导致的方法索引错位，`module.rpc` 设计了**服务端权威表 + 客户端采纳表 + Configuration 同步任务**架构：

```text
[服务端启动加载]
   └── AnvilLibRpc.REGISTRY (authoritative = true)
          扫描 LoadingModList 中所有 @RemoteCallable 方法并生成 "ClassName#methodName(desc)" <-> int 索引

[玩家加入服务器 - NeoForge Configuration 阶段]
   ├── 服务端 RpcConfigurationTask 发送 RpcConfigurationPayload(snapshot)
   ├── 客户端 AnvilLibRpcClient.REGISTRY (authoritative = false) 调用 adopt(map) 采纳权威映射
   └── 客户端回复 RpcConfigurationFinishPayload 结束配置阶段

[运行时断开连接 / 服务器停止]
   ├── ClientPlayerNetworkEvent.LoggingOut -> 清理 AnvilLibRpcClient.PENDING (仅客户端挂起调用)
   └── ServerStoppedEvent -> 清理 AnvilLibRpc.PENDING (仅服务端挂起调用)
```

- **单人游戏 / 局域网主机双实例隔离**：集成服务端权威表 `AnvilLibRpc.REGISTRY` **永不被 `adopt()` 覆盖**；客户端登出远端服务器后再自己开局域网主机时，依然会下发本地扫描出的完整权威表。同理，两端各自维护独立的 `RpcPendingCalls`（`AnvilLibRpc.PENDING` 与 `AnvilLibRpcClient.PENDING`），按数据包 `ctx.flow()` 区分归属，避免同 JVM 内自增 `callId` 互相踩踏。

### `@ApiStatus.Internal` 内部组件清单

以下类标记了 `@ApiStatus.Internal`，正常使用 `RPC` 时无需直接操作，仅在排查网络包版本或超时行为时参考：

| 内部类 | 包名 | 核心成员 / 职责 |
| --- | --- | --- |
| `AnvilLibRpc` | `dev.anvilcraft.lib.v2.rpc` | 模组入口（`MOD_ID = "anvillib_rpc"`，`MAIN_ID = "anvillib"`），持有服务端 `REGISTRY` 与 `PENDING`，注册配置任务与服务端 tick/stop 清理事件 |
| `AnvilLibRpcClient` | `dev.anvilcraft.lib.v2.rpc.client` | `@Mod(dist = Dist.CLIENT)` 客户端入口，持有客户端 `REGISTRY` 与 `PENDING`，驱动客户端 tick 超时与登出清理 |
| `AnvilLibRpcNetwork` | `dev.anvilcraft.lib.v2.rpc` | 在 `RegisterPayloadHandlersEvent` 中以协议版本 `"1"` 自动注册所有 RPC 包 |
| `RpcRegistry` | `dev.anvilcraft.lib.v2.rpc` | `index(Method)`、`byIndex(int)`、`snapshot()`、`adopt(Map)`；未同步前客户端调用会抛出 `IllegalStateException` |
| `RpcPendingCalls` | `dev.anvilcraft.lib.v2.rpc` | `TIMEOUT_TICKS = 100`；追踪 `callId -> (method, future, registeredTick)`，超时抛 `TimeoutException`，关闭抛 `CancellationException` |
| `RpcPayload` | `dev.anvilcraft.lib.v2.rpc` | 单向 `RPC.call` 载荷（ID：`anvillib_rpc:rpc`），按发送/接收方向决定编码与解码索引表 |
| `RpcRequestPayload` | `dev.anvilcraft.lib.v2.rpc` | 请求载荷（ID：`anvillib_rpc:rpc_request`），校验拒绝或目标抛异常时直接 `ctx.reply(failure)` 并重新抛出 |
| `RpcResponsePayload` | `dev.anvilcraft.lib.v2.rpc` | 响应载荷（ID：`anvillib_rpc:rpc_response`），使用 `RpcMethods.returnCodec` 解码并完成 `CompletableFuture` |
| `RpcConfigurationTask` | `dev.anvilcraft.lib.v2.rpc.config` | Configuration 阶段同步任务（ID：`anvillib_rpc:rpc_config`） |
| `RpcConfigurationPayload` / `Finish` | `dev.anvilcraft.lib.v2.rpc.config` | 映射快照下发包与客户端确认完成包（`anvillib_rpc:rpc_config_finish`） |
| `IRpcPayload` | `dev.anvilcraft.lib.v2.rpc` | 内部 `encodeParams` / `decodeParams` 字节数组编解码辅助接口 |
