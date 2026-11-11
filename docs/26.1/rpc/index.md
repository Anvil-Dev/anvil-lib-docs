# RPC 远程过程调用：核心入口与调用形态 (`module.rpc`)

<BranchContextCard branch="26.1" />

`module.rpc`（构件名 `anvillib-rpc-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.rpc`）提供了一套**免手动定义数据包类、支持方法引用编译期类型检查、同时支持单向触发（`call`）、异步带返回值（`invoke`）与虚拟线程同步阻塞调用（`invokeSync`）**的跨端远程过程调用（RPC）框架。

在传统网络编程中，哪怕只是想让客户端触发服务端一个静态方法或查询一个数值，都得手写 `CustomPacketPayload` 记录类、`StreamCodec`、通道注册与 `CompletableFuture` 回调表。使用 `module.rpc`，只需在任意 `static` 方法上标注 `@RemoteCallable`，即可直接通过 `RPC.call(target, MyClass::myMethod, args...)` 或 `RPC.invoke(target, MyClass::myFunc, args...)` 跨端调用！

本模块按功能拆分为 2 篇子文档：
- **本篇（远程过程调用与 `@RemoteCallable`）**：详解 `@RemoteCallable`、`@CallableParam`、`RpcTarget`、`RPC` 的三大调用族（`call` / `invoke` / `invokeSync`）与默认支持的编解码类型。
- **[方法引用、校验器与配置同步](./refs-and-validation)**：详解 `RpcMethodRef`（`R0..R16`）、`RpcFunctionRef`（`F0..F16`）、`IRemoteCallableValidator`、`RpcRegistry` 双实例一致性与配置阶段同步原理。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `rpc` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-rpc-neoforge-26.1:2.0.0")
}
```

---

## 二、 参数与返回值的 StreamCodec 自动解析规则

`RpcMethods` 按以下 3 级优先级为 `@RemoteCallable` 静态方法的每个参数及返回值查找 `StreamCodec`：

1. **优先级 1：显式标注 `@CallableParam(clazz = ..., field = "...")`**：
   当标注在**参数**上时，为该参数指定 `clazz` 类中名为 `field` 的 `static StreamCodec` 字段；当标注在**方法本身**上时，为该方法的**返回值**指定 `StreamCodec` 字段。
2. **优先级 2：内置默认类型表（免注解直接使用）**：
   以下 20 种基础类型、数组与常用原版类型已内置在 `RpcMethods.DEFAULTS` 中，**无需任何注解**：
   - 8 种基本类型及其包装类：`boolean`/`Boolean`、`byte`/`Byte`、`short`/`Short`、`int`/`Integer`（使用 `VAR_INT`）、`long`/`Long`（使用 `VAR_LONG`）、`float`/`Float`、`double`/`Double`；
   - 字符串与数组：`String`（`STRING_UTF8`）、`byte[]`、`long[]`；
   - 原版常用类型：`UUID`（`UUIDUtil.STREAM_CODEC`）、`Tag`（`ByteBufCodecs.TAG`）、`CompoundTag`（`ByteBufCodecs.COMPOUND_TAG`）。
3. **优先级 3：参数/返回值类型自身声明的唯一 `public static final StreamCodec` 字段**：
   例如原版的 `BlockPos`（自身声明了唯一的 `public static final StreamCodec<ByteBuf, BlockPos> STREAM_CODEC`）或你自定义的 `record`（内部含有唯一的 `public static final StreamCodec<..., Self>` 常量），框架会自动通过反射识别该字段，同样**无需标注 `@CallableParam`**！（仅当该类内部存在多个匹配的 `public static final StreamCodec` 字段产生歧义时，才需要用 `@CallableParam` 消歧）。

---

## 三、 完整代码示例：单向调用、异步返回与虚拟线程同步调用

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

    // 1. 无返回值单向远程方法：int、String、BlockPos 均可自动识别 StreamCodec，无需 @CallableParam
    @RemoteCallable
    public static void notifyOverheatOnClient(BlockPos pos, String machineName, int temperature) {
        MyMod.LOGGER.info("客户端收到机器 {} 在 {} 的过热告警：{}°C", machineName, pos, temperature);
    }

    // 2. 有返回值的远程方法：使用 @CallableParam 指定特定字段作为参数或返回值 StreamCodec
    @CallableParam(clazz = BlockPos.class, field = "STREAM_CODEC")
    @RemoteCallable
    public static BlockPos findNearestWaypoint(
        @CallableParam(clazz = GlobalPos.class, field = "STREAM_CODEC") GlobalPos origin,
        int searchRadius
    ) {
        return origin.pos().offset(searchRadius, 0, searchRadius);
    }

    // ================= 调用方示例 =================

    /**
     * 服务端 -> 指定客户端玩家：发起单向调用与异步/虚拟线程有返回值调用
     */
    public static void serverToClientExamples(ServerPlayer player, BlockPos machinePos) {
        RpcTarget target = RpcTarget.player(player);

        // A. 单向调用 (Fire-and-forget)
        RPC.call(target, MachineRpcEndpoints::notifyOverheatOnClient, machinePos, "高炉控制器", 1800);

        // B. 异步带返回值调用 (返回 CompletableFuture<BlockPos>，默认 100 Tick = 5 秒超时)
        GlobalPos globalOrigin = GlobalPos.of(player.level().dimension(), machinePos);
        CompletableFuture<BlockPos> future = RPC.invoke(
            target,
            MachineRpcEndpoints::findNearestWaypoint,
            globalOrigin,
            64
        );
        future.thenAccept(resultPos -> MyMod.LOGGER.info("异步收到对端返回的坐标: {}", resultPos));

        // C. 在 Java 21+ 虚拟线程中像本地方法一样同步阻塞获取返回值（阻塞虚拟线程不消耗 OS 平台线程！）
        Thread.startVirtualThread(() -> {
            BlockPos resultPos = RPC.invokeSync(
                target,
                MachineRpcEndpoints::findNearestWaypoint,
                globalOrigin,
                64
            );
            MyMod.LOGGER.info("虚拟线程同步收到返回值: {}", resultPos);
        });
    }

    /**
     * 客户端 -> 服务端调用：使用 RpcTarget.server()
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

## 四、 核心注解与 API 详解

### 1. `@RemoteCallable` 与 `@CallableParam`

| 注解名 | 适用目标 (`@Target`) | 属性签名 | 说明 |
| :--- | :---: | :--- | :--- |
| **`@RemoteCallable`** | `METHOD` | `Class<? extends IRemoteCallableValidator> validator() default IRemoteCallableValidator.class;` | 标记一个 **`static`** 方法允许被远程调用。接收端在执行前会强制检查目标方法是否为 `static` 且带有 `@RemoteCallable`，防止恶意构造数据包触发任意类方法。 |
| **`@CallableParam`** | `PARAMETER`、`METHOD` | `Class<?> clazz();`<br>`String field();` | 指向 `clazz` 中的 `static StreamCodec` 字段 `field`。标注在参数上时作用于该参数；标注在方法上时作用于该方法的**返回值**。 |

### 2. `RpcTarget`（调用目标端）

| 静态工厂 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `static RpcTarget player(ServerPlayer player)` | `RpcTarget` | 服务端发往指定客户端玩家（`Server -> Client`）。 |
| `static RpcTarget server()` | `RpcTarget` | 客户端发往服务端（`Client -> Server`，仅限在客户端调用，内部隔离在 `ClientRpcTargets` 中避免服务端加载客户端类）。 |
| `void send(CustomPacketPayload payload)`<br>`RpcRegistry registry()`<br>`RegistryAccess registryAccess()`<br>`RpcPendingCalls pending()` | 对应类型 | 发送数据包并获取当前发送方向对应的索引表、注册表访问器与待响应调用表。 |

### 3. `RPC` 调用入口类 (`dev.anvilcraft.lib.v2.rpc.RPC`)

| 方法族 | 重载范围与签名 | 返回值与超时/线程规则 |
| :--- | :--- | :--- |
| **`RPC.call`** | `call(RpcTarget target, RpcMethodRef.R0..R16 methodRef, args...)`（共 17 个重载，支持 0 ~ 16 个强类型参数） | `void`。单向发送 `RpcPayload`（`anvillib_rpc:rpc`），对端在主线程（`ctx.enqueueWork`）解码并执行目标方法。 |
| **`RPC.callByName`** | `callByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `void`。逃生口：当参数超过 16 个或无法使用方法引用时，按类名与唯一方法名调用（若存在同名重载会因歧义抛出 `IllegalStateException`）。 |
| **`RPC.invoke`** | `invoke(RpcTarget target, RpcFunctionRef.F0..F16<R, ...> methodRef, args...)`（共 17 个重载，支持 0 ~ 16 个参数） | `CompletableFuture<R>`。发送 `RpcRequestPayload`（`anvillib_rpc:rpc_request`），对端在主线程执行后通过 `ctx.reply` 回复 `RpcResponsePayload`。若超过 `100` Tick（5 秒）未收到响应，Future 以 `TimeoutException` 异常结束；若连接断开，以 `CancellationException` 结束；若对端校验拒绝或抛异常，以 `CompletionException` 结束。 |
| **`RPC.invokeByName`** | `<R> CompletableFuture<R> invokeByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `CompletableFuture<R>`。按类名与方法名发起有返回值的异步远程调用。 |
| **`RPC.invokeSync`** | • `invokeSync(RpcTarget target, RpcFunctionRef.F0..F16<R, ...> methodRef, args...)`<br>• `invokeSync(RpcTarget target, boolean allowNonVirtual, RpcFunctionRef.F0..F16<R, ...> methodRef, args...)` | `R`。在当前线程同步阻塞等待 `invoke` 的结果。<br>**线程安全护栏**：<br>1. **严禁在收发包所在的同一主线程（Render thread / Server thread）或 Netty IO 线程上调用**，否则会因等待自己线程处理回包而死锁！框架检测到当前线程名匹配 `Render thread`、`Server thread` 或 `Netty *` 时会直接抛出 `IllegalStateException` 拒绝执行；<br>2. 若在非虚拟线程上调用且未显式传入 `allowNonVirtual = true`，框架会打印 `WARN` 日志提示改用虚拟线程（`Executors.newVirtualThreadPerTaskExecutor()`）或异步 `RPC.invoke`。 |
| **`RPC.invokeSyncByName`** | `invokeSyncByName(RpcTarget target, [boolean allowNonVirtual,] Class<?> clazz, String methodName, Object... args)` | `R`。按方法名发起的同步阻塞远程调用。 |
