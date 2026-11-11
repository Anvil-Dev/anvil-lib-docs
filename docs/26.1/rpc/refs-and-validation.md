# 方法引用、接收端校验器与配置阶段同步 (`dev.anvilcraft.lib.v2.rpc`)

<BranchContextCard branch="26.1" />

本篇深入解析 `module.rpc` 背后的方法引用反解析机制（`RpcMethodRef` / `RpcFunctionRef` / `LambdaResolver`）、接收端安全校验器（`IRemoteCallableValidator`）以及防止单人局域网污染的双实例配置阶段同步协议（`RpcRegistry` / `RpcConfigurationTask`）。

---

## 一、 接收端安全校验器 (`IRemoteCallableValidator`)

### 1. 要解决什么问题 / 怎么用

由于 `@RemoteCallable` 方法可以被对端通过网络触发，对于客户端发往服务端的 RPC 调用（`RpcTarget.server()`），如果不做权限与距离校验，恶意客户端可能伪造参数越权执行操作。

`@RemoteCallable(validator = MyValidator.class)` 允许你为任意远程方法绑定一个实现了 **`IRemoteCallableValidator`** 的校验器类：
- **实例化与缓存**：校验器实现类必须提供一个**无参构造器**（访问权限不限，可为 `private` 或包级私有），`RpcMethods` 会在首次调用时反射实例化并缓存在 `VALIDATOR_CACHE` 中；
- **校验时机与拦截行为**：在接收端解码完实参 `Object[] args` 后、真正调用 `method.invoke(null, args)` **之前**，在接收端主线程调用 `validator.validate(ctx, method, args)`：
  - 若返回 `true`：正常执行目标方法；
  - 若返回 `false`：对于 `RPC.call` 单向调用，服务端静默丢弃；对于 `RPC.invoke` / `invokeSync` 有返回值调用，立即向调用方回复 `RpcResponsePayload.failure(callId, "RPC call rejected by validator: ...")`，使调用方的 `CompletableFuture` 以 `CompletionException` 异常失败！

### 2. 完整代码示例：实现 OP 权限校验器与方块交互距离校验器

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
     * 校验器 1：要求发起调用的必须是服务端且拥有 2 级以上 OP 权限的玩家
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
     * 校验器 2：要求第 0 个参数为 BlockPos，且发起调用的玩家距离该方块不超过 8 格
     */
    public static final class WithinBlockReachValidator implements IRemoteCallableValidator {
        @Override
        public boolean validate(IPayloadContext ctx, Method method, Object[] args) {
            if (!(ctx.player() instanceof ServerPlayer player)) return false;
            if (args.length == 0 || !(args[0] instanceof BlockPos targetPos)) return false;
            return player.distanceToSqr(targetPos.getCenter()) <= 64.0;
        }
    }

    // 绑定 ServerOpValidator：非 OP 玩家调用将被直接拦截
    @RemoteCallable(validator = ServerOpValidator.class)
    public static void resetGlobalMultiplier(float multiplier) {
        // 安全执行管理员逻辑...
    }

    // 绑定 WithinBlockReachValidator：距离超过 8 格的调用将被拒绝并令 invoke 抛错
    @RemoteCallable(validator = WithinBlockReachValidator.class)
    public static int queryVaultBalance(BlockPos vaultPos) {
        return 1024;
    }
}
```

---

## 二、 可序列化方法引用接口 (`RpcMethodRef` / `RpcFunctionRef`)

为什么 `RPC.call(target, MyClass::myMethod, ...)` 能够不传字符串方法名就定位到目标 `Method`？

因为 `RpcMethodRef.R0..R16` 和 `RpcFunctionRef.F0..F16` 全部继承了 **`java.io.Serializable`**。Java 编译器在编译指向 `Serializable` 函数式接口的方法引用（`MyClass::myMethod`）时，会在生成的 Lambda 类中自动合成一个 `private Object writeReplace()` 方法，返回 `java.lang.invoke.SerializedLambda`，其中精确记录了：
- `getImplClass()`：目标方法所属类的内部名称；
- `getImplMethodName()`：目标方法名称；
- `getImplMethodSignature()`：JVM 字节码方法描述符（如 `(Lnet/minecraft/core/BlockPos;I)V`），天然支持**同名重载方法消歧**！

| 类名 | 内部函数式接口列表 | 用途 |
| :--- | :--- | :--- |
| **`RpcMethodRef`** | `R0`、`R1<A>`、`R2<A, B>` ... 直至 `R16<A, B, ..., P>`（共 17 个接口，签名均为 `void invoke(...)`） | 供无返回值的 `RPC.call` 使用。 |
| **`RpcFunctionRef`** | `F0<R>`、`F1<R, A>`、`F2<R, A, B>` ... 直至 `F16<R, A, ..., P>`（共 17 个接口，签名均为 `R invoke(...)`） | 供有返回值的 `RPC.invoke` 与 `RPC.invokeSync` 使用。 |

---

## 三、 双实例索引表与配置阶段同步架构 (`RpcRegistry` / `RpcPendingCalls`)

为了避免在每次 RPC 网络包中传输冗长的 `"com.example.MyClass#myMethod(L...;)V"` 字符串，`module.rpc` 在网络线上**只传输一个 `VarInt` 整数方法索引**：

1. **双 `RpcRegistry` 实例隔离（防止单人/局域网串台）**：
   - **权威实例 `AnvilLibRpc.REGISTRY`（`authoritative = true`）**：通过扫描所有加载模组的 `ModFileScanData` 中标注了 `@RemoteCallable` 的方法并按规范键字典序排序分配整数 ID。该实例**从不被网络下发覆盖**。
   - **客户端已采纳实例 `AnvilLibRpcClient.REGISTRY`（`authoritative = false`）**：在连接服务器进入 `PacketProtocol.CONFIGURATION` 配置阶段时，服务端的 `RpcConfigurationTask`（`anvillib_rpc:rpc_config`）下发 `RpcConfigurationPayload`；客户端收到后调用 `AnvilLibRpcClient.REGISTRY.adopt(map)` 采纳服务端映射并回复 `RpcConfigurationFinishPayload`。
   - 这样，哪怕玩家先连接了一个模组列表不同的远程服务器、退回主菜单后又开启单人世界并打开局域网，集成服务端依然下发未被污染的 `AnvilLibRpc.REGISTRY` 本地权威表！
2. **双 `RpcPendingCalls` 实例隔离**：
   服务端（`AnvilLibRpc.PENDING`）与客户端（`AnvilLibRpcClient.PENDING`）各自维护独立的 `callId` 计数器与待响应 Future 表，分别由 `ServerTickEvent.Post` 与 `ClientTickEvent.Post` 每 Tick 驱动 `tick()` 检查 `TIMEOUT_TICKS = 100`（5 秒）超时，并在 `ServerStoppedEvent` / `ClientPlayerNetworkEvent.LoggingOut` 时调用 `clear()` 取消挂起的调用。
