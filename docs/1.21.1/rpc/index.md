# @RemoteCallable 声明、方法引用与 RPC 调用

`module.rpc`（模组 ID：`anvillib_rpc`）为 NeoForge 1.21.1 提供了**基于方法引用的类型安全跨端远程过程调用（RPC）框架**。开发者只需在一个静态方法上标注 `@RemoteCallable`，无需编写任何 `CustomPacketPayload`、`StreamCodec` 注册或 `PayloadRegistrar` 样板代码，即可在服务端与客户端之间单向通知（`RPC.call`）、异步请求-响应（`RPC.invoke`）或在虚拟线程中同步阻塞取返回值（`RPC.invokeSync`）。

## 为什么需要 module.rpc

手写原版/NeoForge 网络包存在三类常见负担：
1. **样板代码膨胀**：每个操作都要定义一条 `record Payload`、绑定 `StreamCodec`、注册网络通道并分派主线程队列。
2. **带宽与协议安全性**：明文传输类名或方法名极浪费带宽且容易被伪造。`anvillib_rpc` 在连接 Configuration 阶段由服务端下发权威整型索引表，网络包线上只传输 `VarInt` 索引与二进制参数；接收端会二次校验目标方法必须为 `static` 且带有 `@RemoteCallable` 注解。
3. **缺少天然的请求-响应关联**：原版包发送后若需取回返回值，需要自己管理 `callId`、超时与断线清理；`RPC.invoke` / `RPC.invokeSync` 内置 `100` tick 超时控制与会话断开自动失败（`CancellationException`）。

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
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

## 快速上手：声明与双向调用

### 1. 声明可远程调用方法

只有 **`static` 且标注了 `@RemoteCallable` 的方法**才能作为 RPC 目标（访问修饰符不限，支持 `private` / 包级 / `public`，框架会通过反射设置可访问，但目标方法参数不得包含无法解析编解码器的自定义类型）。

```java
package com.example.examplemod.rpc;

import dev.anvilcraft.lib.v2.rpc.CallableParam;
import dev.anvilcraft.lib.v2.rpc.RemoteCallable;
import net.minecraft.core.BlockPos;

public final class MachineRpcApi {
    // 1. 单向远程过程调用：基本类型、String、byte[]/long[]、UUID、Tag/CompoundTag 无需注解
    @RemoteCallable
    public static void showToast(String title, int durationTicks) {
        System.out.println("[RPC Toast] " + title + " (" + durationTicks + " ticks)");
    }

    // 2. 自定义类型参数/返回值：若 BlockPos 自身无唯一匹配 public static final StreamCodec，使用 @CallableParam 显式指定
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
   - 常见对象与数组：`String` (`STRING_UTF8`)、`byte[]` (`BYTE_ARRAY`)、`long[]`（`VarInt` 长度 + 逐元素 `VarLong` 编码）、`UUID` (`UUIDUtil.STREAM_CODEC`)、`Tag` (`ByteBufCodecs.TAG`)、`CompoundTag` (`ByteBufCodecs.COMPOUND_TAG`)
3. **目标类型自身声明的静态常量字段**：
   - 自动扫描参数/返回类型上所有 `public static final` 且属于 `StreamCodec`、负载泛型实参兼容该类型的字段。
   - 若找到恰好一个则自动使用；若找到多个字段（存在歧义）或找不到任何字段，将在首次调用编码时抛出 `IllegalStateException` 提示改用 `@CallableParam`。

::: tip `BlockPos` 等原版类需要 `@CallableParam` 吗？
`BlockPos` 在 NeoForge 1.21.1 中同时拥有 `STREAM_CODEC` 与其他静态字段时（若存在歧义或来自父接口），建议直接显式标注 `@CallableParam(clazz = BlockPos.class, field = "STREAM_CODEC")`，避免依赖扫描歧义。
:::

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
    // 场景 A：服务端 -> 客户端 单向调用（fire-and-forget）
    public static void notifyPlayer(ServerPlayer player) {
        RPC.call(RpcTarget.player(player), MachineRpcApi::showToast, "熔炉核心已超频", 60);
    }

    // 场景 B：客户端 -> 服务端 异步请求并取得 CompletableFuture
    public static void queryCoreAsync(BlockPos origin) {
        CompletableFuture<BlockPos> future = RPC.invoke(
            RpcTarget.server(),
            MachineRpcApi::findNearestCore,
            origin,
            16
        );
        future.thenAccept(resultPos -> System.out.println("最近核心坐标：" + resultPos));
    }

    // 场景 C：在 Java 21 虚拟线程中同步阻塞读取返回值（不阻塞平台线程与主线程）
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

1. **必须是静态方法引用，不可捕获局部/实例变量**：传入 `RPC.call` / `invoke` 的方法引用通过 `writeReplace()` 提取 `SerializedLambda`。如果传入 Lambda 表达式、实例方法引用或捕获了外围变量，框架无法还原唯一 `Method`，将在运行时抛出 `IllegalArgumentException`。
2. **`invoke` 不能用于 `void` 方法**：若被调方法返回类型为 `void`，`RPC.invoke` / `RPC.invokeSync` 会抛出 `IllegalArgumentException`，请使用 `RPC.call`。
3. **超时与断连语义**：`RPC.invoke` 登记的待响应请求最多保留 **`100` tick**（`RpcPendingCalls.TIMEOUT_TICKS`），超时未回包则 `CompletableFuture` 以 `TimeoutException` 失败；若玩家登出或服务器停止，未完成的 `CompletableFuture` 会立即以 `CancellationException` 结束。
4. **切勿在主线程调用 `invokeSync`**：在非虚拟线程调用 `invokeSync(target, methodRef, ...)` 时会触发警告日志；如果确有受控的后台平台线程池需要阻塞等待，可使用带 `allowNonVirtual = true` 的 `@ApiStatus.Experimental` 重载，但**绝不可在 Minecraft 服务端/客户端主线程调用**（主线程排队处理网络包回包，原地 `future.join()` 会直接死锁！）。

## 公开 API 完整参考

### `@RemoteCallable`

包名：`dev.anvilcraft.lib.v2.rpc` · 目标：`ElementType.METHOD` · 保留：`RetentionPolicy.RUNTIME`

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `validator()` | `Class<? extends IRemoteCallableValidator>` | `IRemoteCallableValidator.class` | 指定接收端安全校验器；取默认哨兵接口时表示始终放行 |

### `@CallableParam`

包名：`dev.anvilcraft.lib.v2.rpc` · 目标：`{ElementType.PARAMETER, ElementType.METHOD}` · 保留：`RetentionPolicy.RUNTIME`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `clazz()` | `Class<?>` | 声明目标 `StreamCodec` 静态字段的类 |
| `field()` | `String` | `static StreamCodec` 字段名 |

### `RpcTarget`

包名：`dev.anvilcraft.lib.v2.rpc`

| 方法签名 | 说明 |
| --- | --- |
| `static RpcTarget player(ServerPlayer player)` | 构建发送给指定客户端玩家的目标端（服务端 -> 客户端） |
| `static RpcTarget server()` | 构建发送给服务端的目标端（客户端 -> 服务端），**仅限客户端且已连接服务器时调用** |
| `void send(CustomPacketPayload payload)` | 通过对应方向的网络分发器发送数据包 |
| `RpcRegistry registry()` | 返回本发送方向应使用的编码索引表（服务端用权威表，客户端用已采纳表） |
| `RegistryAccess registryAccess()` | 返回编码所需的注册表访问器 |
| `RpcPendingCalls pending()` | 返回本调用方用于登记 `invoke` 响应的挂起表 |

### `RPC`

包名：`dev.anvilcraft.lib.v2.rpc`

#### 1. 单向无返回值调用 (`call` / `callByName`)

| 方法组 | 参数列表 | 说明 |
| --- | --- | --- |
| `static void call(RpcTarget target, RpcMethodRef.R0 methodRef)` ~ `R16<A...P>` | `target`, `methodRef`, `a...p` (0 到 16 个强类型参数) | 编译期检查参数个数与类型，发送到对端异步在主线程执行，无返回值 |
| `static void callByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | 目标类、唯一方法名、变长实参 | 逃生口版本，突破 16 参数限制或无方法引用场景；若方法存在同名重载将抛出 `IllegalStateException` 歧义异常 |

#### 2. 异步有返回值调用 (`invoke` / `invokeByName`)

| 方法组 | 返回值 | 说明 |
| --- | --- | --- |
| `static <R> CompletableFuture<R> invoke(RpcTarget target, RpcFunctionRef.F0<R> methodRef)` ~ `F16<R, A...P>` | `CompletableFuture<R>` | 发送请求并在收到对端返回时兑现 `future`；超时（100 tick）以 `TimeoutException` 失败，校验失败或异常以 `CompletionException` 失败 |
| `static <R> CompletableFuture<R> invokeByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `CompletableFuture<R>` | `invoke` 的按方法名逃生口版本，要求目标类内 `@RemoteCallable` 静态方法名唯一 |

#### 3. 同步阻塞调用 (`invokeSync` / `invokeSyncByName`)

| 方法组 | 返回值 | 说明 |
| --- | --- | --- |
| `static <R> R invokeSync(RpcTarget target, RpcFunctionRef.F0<R> methodRef, ...)` (0 ~ 16 参) | `R` | 在当前（推荐虚拟）线程阻塞等待 `future.join()` 并直接返回 `R`；非虚拟线程调用会打印 Warn 日志 |
| `@ApiStatus.Experimental static <R> R invokeSync(RpcTarget target, boolean allowNonVirtual, RpcFunctionRef.F0<R> methodRef, ...)` (0 ~ 16 参) | `R` | 当 `allowNonVirtual = true` 时静默跳过“非虚拟线程”警告日志，适用于专用阻塞工作线程池 |
| `static <R> R invokeSyncByName(RpcTarget target, Class<?> clazz, String methodName, Object... args)` | `R` | `invokeSync` 的按方法名逃生口版本，参数个数不限，需方法名唯一 |
