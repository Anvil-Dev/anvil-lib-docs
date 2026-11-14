# 方法引用、校验器与配置同步

<BranchContextCard branch="1.21.8" />

本篇深入说明 `module.rpc` 的三项底层机制：**`RpcMethodRef` / `RpcFunctionRef` 函数式接口簇**、**`IRemoteCallableValidator` 接收端权限校验器**，以及 **Configuration 阶段跨端索引一致性保证**。

## 方法引用接口簇 (`RpcMethodRef` & `RpcFunctionRef`)

为了同时满足 Java 编译期强类型检查和跨网络传递时的目标还原，`RPC.call`、`RPC.invoke` 与 `RPC.invokeSync` 的方法引用参数继承自 `java.io.Serializable`：

- **`RpcMethodRef`（无返回值，`void`）**：包含 `R0` 到 `R16` 共 17 个静态嵌套 `@FunctionalInterface`（`void invoke(...)`）。
- **`RpcFunctionRef`（有返回值，`R`）**：包含 `F0<R>` 到 `F16<R, A, ..., P>` 共 17 个静态嵌套 `@FunctionalInterface`（`R invoke(...)`）。

当方法参数多于 16 个，或需要在泛型工具层动态反射分发时，请改用 `RPC.callByName`、`RPC.invokeByName` 与 `RPC.invokeSyncByName`。

## 接收端安全校验器 (`IRemoteCallableValidator`)

`@RemoteCallable(validator = ...)` 提供声明式的**执行前置安全闸口**：
- 在**接收端**执行（参数已完成 `StreamCodec` 解码之后、目标 `method.invoke` 之前）。
- 实现类必须提供**无参构造器**，框架首次调用时反射实例化并永久缓存该实例。
- 返回 `true` 放行；返回 `false` 拒绝（`call` 静默丢弃，`invoke` / `invokeSync` 使 `CompletableFuture` 以 `CompletionException` 失败）。

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

## 索引映射、配置阶段同步与内部组件

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

### `@ApiStatus.Internal` 内部组件清单

| 内部类 | 包名 | 核心成员 / 职责 |
| --- | --- | --- |
| `AnvilLibRpc` | `dev.anvilcraft.lib.v2.rpc` | 模组入口（`MOD_ID = "anvillib_rpc"`，`MAIN_ID = "anvillib"`），持有服务端 `REGISTRY` 与 `PENDING`，注册配置任务与服务端 tick/stop 清理事件 |
| `AnvilLibRpcClient` | `dev.anvilcraft.lib.v2.rpc.client` | `@Mod(dist = Dist.CLIENT)` 客户端入口，持有客户端 `REGISTRY` 与 `PENDING`，驱动客户端 tick 超时与登出清理 |
| `AnvilLibRpcNetwork` | `dev.anvilcraft.lib.v2.rpc` | 在 `RegisterPayloadHandlersEvent` 中以协议版本 `"1"` 自动注册所有 RPC 包 |
| `RpcRegistry` | `dev.anvilcraft.lib.v2.rpc` | `index(Method)`、`byIndex(int)`、`snapshot()`、`adopt(Map)`；未同步前客户端调用抛出 `IllegalStateException` |
| `RpcPendingCalls` | `dev.anvilcraft.lib.v2.rpc` | `TIMEOUT_TICKS = 100`；追踪挂起调用，超时抛 `TimeoutException`，关闭抛 `CancellationException` |
| `RpcPayload` / `Request` / `Response` | `dev.anvilcraft.lib.v2.rpc` | `anvillib_rpc:rpc`、`anvillib_rpc:rpc_request`、`anvillib_rpc:rpc_response` 网络载荷 |
| `RpcConfigurationTask` / `Payload` / `Finish` | `dev.anvilcraft.lib.v2.rpc.config` | `anvillib_rpc:rpc_config` 配置任务与索引映射确认包 |
| `IRpcPayload` | `dev.anvilcraft.lib.v2.rpc` | 内部 `encodeParams` / `decodeParams` 字节数组编解码辅助接口 |
