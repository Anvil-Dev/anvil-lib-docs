# @RemoteCallable 声明、方法引用与 RPC 调用

<BranchContextCard branch="1.21.11" />

`module.rpc`（模组 ID：`anvillib_rpc`，构件名 `anvillib-rpc-neoforge-1.21.11`）为 NeoForge 21.11.x 提供了**基于方法引用的类型安全跨端远程过程调用（RPC）框架**。开发者只需在一个静态方法上标注 `@RemoteCallable`，无需编写任何 `CustomPacketPayload`、`StreamCodec` 注册或 `PayloadRegistrar` 样板代码，即可在服务端与客户端之间单向通知（`RPC.call`）、异步请求-响应（`RPC.invoke`）或在虚拟线程中同步阻塞取返回值（`RPC.invokeSync`）。

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，以避免 NeoForge Maven 未完全同步 Maven Central 导致接口注入或传递元数据异常：

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

## 快速上手：声明与双向调用

### 1. 声明可远程调用方法

只有 **`static` 且标注了 `@RemoteCallable` 的方法**才能作为 RPC 目标（访问修饰符不限，支持 `private` / 包级 / `public`，框架会通过反射设置可访问，但目标方法参数与返回值必须有可解析的 `StreamCodec`）。

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

### 2. 参数与返回值 `StreamCodec` 解析顺序

对于每个参数以及非 `void` 返回值，框架按以下优先级解析 `StreamCodec`（解析结果按方法缓存）：

1. **显式注解 `@CallableParam(clazz = ..., field = "...")`**：
   - 标注在**参数**上时，读取 `clazz` 中名为 `field` 的 `static StreamCodec` 字段用于该参数。
   - 标注在**方法**上时，读取该字段用于方法的**返回值**。
2. **内建默认编解码器表**：以下类型开箱即用，无需 `@CallableParam`：
   - 原始类型与装箱类型：`boolean`/`Boolean` (`BOOL`)、`byte`/`Byte` (`BYTE`)、`short`/`Short` (`SHORT`)、`int`/`Integer` (`VAR_INT`)、`long`/`Long` (`VAR_LONG`)、`float`/`Float` (`FLOAT`)、`double`/`Double` (`DOUBLE`)
   - 常见对象与数组：`String` (`STRING_UTF8`)、`byte[]` (`BYTE_ARRAY`)、`long[]` (`ByteBufCodecs.LONG_ARRAY`)、`UUID` (`UUIDUtil.STREAM_CODEC`)、`Tag` (`ByteBufCodecs.TAG`)、`CompoundTag` (`ByteBufCodecs.COMPOUND_TAG`)
3. **目标类型自身声明的静态常量字段**：
   - 自动扫描参数/返回类型上所有 `public static final`（通过 Java 21 `AccessFlag` 检查）且属于 `StreamCodec`、负载泛型实参兼容该类型的字段。
   - 若找到恰好一个则自动使用；若找到多个字段或找不到任何字段，将在首次调用编码时抛出 `IllegalStateException` 提示改用 `@CallableParam`。

### 3. 发起单向、异步与虚拟线程同步调用

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
        RPC.call(RpcTarget.player(player), MachineRpcApi::showToast, "熔炉核心已超频", 60);
    }

    public static void queryCoreAsync(BlockPos origin) {
        CompletableFuture<BlockPos> future = RPC.invoke(
            RpcTarget.server(),
            MachineRpcApi::findNearestCore,
            origin,
            16
        );
        future.thenAccept(resultPos -> System.out.println("最近核心坐标：" + resultPos));
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
                System.out.println("同步返回：" + result);
            });
        }
    }
}
```

## 常见坑点与限制

1. **必须是静态方法引用，不可捕获局部/实例变量**：传入 `RPC.call` / `invoke` 的方法引用通过 `writeReplace()` 提取 `SerializedLambda`。如果传入 Lambda 表达式、实例方法引用或捕获了外围变量，框架将在运行时抛出 `IllegalArgumentException`。
2. **`invoke` 不能用于 `void` 方法**：若被调方法返回类型为 `void`，`RPC.invoke` / `RPC.invokeSync` 会抛出 `IllegalArgumentException`，请使用 `RPC.call`。
3. **超时与断连语义**：`RPC.invoke` 登记的待响应请求最多保留 **`100` tick**（`RpcPendingCalls.TIMEOUT_TICKS`），超时未回包则 `CompletableFuture` 以 `TimeoutException` 失败；玩家登出或服务器停止时未完成请求以 `CancellationException` 结束。
4. **切勿在主线程调用 `invokeSync`**：主线程负责处理网络回包，原地 `future.join()` 会直接死锁；非虚拟线程调用会触发告警日志（或仅在独立工作线程池中使用 `allowNonVirtual = true` 的 `@ApiStatus.Experimental` 重载）。

## 公开 API 完整参考

### `@RemoteCallable` & `@CallableParam`

| 注解 | 包名 | 属性与默认值 | 说明 |
| --- | --- | --- | --- |
| `@RemoteCallable` | `dev.anvilcraft.lib.v2.rpc` | `Class<? extends IRemoteCallableValidator> validator() default IRemoteCallableValidator.class` | 声明方法可远程调用并绑定接收端校验器 |
| `@CallableParam` | `dev.anvilcraft.lib.v2.rpc` | `Class<?> clazz()`、`String field()` | 显式指定参数（目标 `PARAMETER`）或返回值（目标 `METHOD`）的 `StreamCodec` 静态字段 |

### `RpcTarget`

| 方法签名 | 说明 |
| --- | --- |
| `static RpcTarget player(ServerPlayer player)` | 构建发送给指定客户端玩家的目标端（服务端 -> 客户端） |
| `static RpcTarget server()` | 构建发送给服务端的目标端（客户端 -> 服务端），仅限客户端连接服务器后调用 |
| `void send(CustomPacketPayload payload)` | 通过对应方向的网络分发器发送数据包 |
| `RpcRegistry registry()` / `RegistryAccess registryAccess()` / `RpcPendingCalls pending()` | 返回发送方向关联的索引表、注册表访问器与挂起调用表 |

### `RPC`

| 方法组 | 说明 |
| --- | --- |
| `static void call(RpcTarget target, RpcMethodRef.R0 methodRef)` ~ `R16<A...P>` | 0~16 强类型参数单向调用 |
| `static void callByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | 按类名+唯一方法名发起单向调用（突破 16 参数上限） |
| `static <R> CompletableFuture<R> invoke(RpcTarget target, RpcFunctionRef.F0<R> methodRef)` ~ `F16<R, A...P>` | 0~16 强类型参数异步请求调用 |
| `static <R> CompletableFuture<R> invokeByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | 按类名+唯一方法名发起异步请求调用 |
| `static <R> R invokeSync(RpcTarget target, RpcFunctionRef.F0<R> methodRef, ...)` (0~16 参)<br>`@ApiStatus.Experimental static <R> R invokeSync(RpcTarget target, boolean allowNonVirtual, RpcFunctionRef.F0<R> methodRef, ...)` | 在虚拟线程（或显式允许的工作线程）阻塞等待并返回结果 |
| `static <R> R invokeSyncByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | 按类名+唯一方法名同步阻塞调用 |
