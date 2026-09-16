---
title: Math 缓存与生命周期
prev: false
next: false
---

# 解析缓存与生命周期

`FlatExpressionParser` 内部有一份解析缓存：同一段文本在同一份函数注册表上只会真正解析一次。缓存本身没有过期时间，弱键也指望不上，因此它的清理时机是需要显式维护的——这份文档说明缓存的形状、为什么必须清、以及在哪些时机被清。

## 缓存的结构

```java
private static final int CACHE_CAPACITY = 512;

private static final Map<HolderGetter<IFunction>, Map<String, IExpression>> CACHE =
    Collections.synchronizedMap(new WeakHashMap<>());
```

| 层级     | 键                          | 值                                  | 淘汰规则                    |
|--------|----------------------------|------------------------------------|-------------------------|
| 外层（分组） | `HolderGetter<IFunction>` 实例 | 该注册表上的文本缓存                        | 弱键，期望随注册表一起消失           |
| 内层（条目） | 原文 `String`（不做任何归一化）       | 解析出的 `IExpression`                 | 每组最多 512 条，按最近最少使用淘汰     |

- **分组键是「取注册表的那个对象」**，不是 `RegistryOps`：26.1 里 `RegistryOps.getter(...)` 直接返回注册表本身，所以同一份注册表上的多个 `RegistryOps` 共用一组缓存
- **条目键是原文**，`1+2` 与 `1 + 2`、`2x` 与 `2*x` 都是不同条目；缓存命中时返回的是**同一个实例**（`==` 成立），有调用方依赖这一点做对象比较
- **解析失败的文本不进缓存**：`parseValue` 先解析、成功后才写入，异常路径不会留下半成品
- **没有过期时间**：只有容量与显式清理，没有 TTL
- 外层与内层都是同步包装的 map，缓存值又都是不可变记录（`FunctionExpression` 构造时拷贝实参列表），因此多线程解析是安全的

## 弱键为什么回收不掉

外层用 `WeakHashMap` 的本意是「注册表没了，缓存跟着走」，但这条期望落不了地：

缓存里的表达式树持有 `Holder.Reference`，而每个 `Holder.Reference` 都强引用着它所属的 `HolderOwner`（`Holder.Reference.java` 的 `owner` 字段）——对注册表条目来说就是注册表本身。注册表正是外层 map 的**键**，于是形成了「值 → 键」的强引用链：只要 map 还持有这条值，键就永远不会被回收，`WeakHashMap` 的弱键也就永远不会生效。

后果有两个：

- 换注册表不会让旧缓存消失：数据包重载会重建注册表，旧注册表连同它缓存的表达式都被这份 map 留着，**每次 `/reload` 都会多留一份**，所以数据包重载必须显式清理
- 缓存的定位是「按注册表分组、每组最多 512 条」，而不是「随注册表自动回收」，容量上限只能限制组内条数，管不了组数；组数实际上由「见过多少个不同的注册表实例」决定

## 什么时候会被清

自动清理有三处，都在模块自己的事件处理器里：

| 时机                        | 触发点                                         | 处理                                        |
|---------------------------|---------------------------------------------|-------------------------------------------|
| 服务端启动                     | `ServerStartedEvent`                        | `LibCacheReloadHandler` 清空                |
| 数据包重载（`/reload`）          | `OnDatapackSyncEvent`，且 `event.getPlayer() == null` | 同上；只在整包重载时清，单个玩家进服时不清               |
| 客户端断开                     | `ClientPlayerNetworkEvent.LoggingOut`       | `LibClientCacheHandler` 清空（仅客户端分发）        |

```java
@EventBusSubscriber(modid = AnvilLibMath.MOD_ID)
public class LibCacheReloadHandler {
    @SubscribeEvent
    public static void onServerStarted(ServerStartedEvent event) {
        FlatExpressionParser.clearCache();
    }

    @SubscribeEvent
    public static void onDatapackSync(OnDatapackSyncEvent event) {
        // 本事件在「某个玩家进服」时也会触发，那时注册表并没有换，整表缓存没必要丢；
        // 只有 getPlayer() 为 null（即 /reload 这类全员同步）才说明数据包换过
        if (event.getPlayer() == null) FlatExpressionParser.clearCache();
    }
}
```

```java
@EventBusSubscriber(modid = AnvilLibMath.MOD_ID, value = Dist.CLIENT)
public class LibClientCacheHandler {
    @SubscribeEvent
    public static void onLoggingOut(ClientPlayerNetworkEvent.LoggingOut event) {
        FlatExpressionParser.clearCache();
    }
}
```

三个时机对应同一种情况：**函数注册表被换掉了**。启动与重载会重建数据包注册表；客户端断开后会丢弃服务端同步过来的注册表，下次进服拿到的是新的。不清理的话，客户端会拿旧注册表里的函数继续求值。

## 什么时候要自己清

下游在下面这些场合应当自己调用 `FlatExpressionParser.clearCache()`：

- **自建注册表**：自己 `new` 出来的注册表或自定义 `HolderGetter` 不在事件处理器的覆盖范围内，换掉它们之后要手动清
- **手动重载数据包**：绕过 `/reload` 自己重建注册表时
- **内存敏感场景**：确知某批表达式不再需要（例如关闭了一个表达式编辑器界面）时，清一次比等 LRU 挤出去更彻底
- **测试**：同一个 JVM 里反复构造注册表时，缓存会跨用例保留旧注册表，需要显式清空（模块自带的 `ParseCacheTest` 就是这么验证的）

清理是全局的、粗粒度的：`clearCache()` 清掉所有分组，没有「只清某一组」的接口。代价只是下次解析要重新走一遍解析与自检，如果不确定是否需要清，清一下是安全的选择。

## 下游注意事项

- 用 `registryAccess.lookupOrThrow(LibRegistries.FUNCTION_KEY)` 拿注册表，不要每次解析都包一层新的 `HolderGetter`：新实例只会产生新分组，命中不了缓存
- 缓存条目会强引用注册表，因此长期持有解析结果的代价不只是表达式树本身，而是「整份函数注册表不能释放」——这与原版 `Holder.Reference` 的行为一致，不需要额外处理，但要知道
- 运行时拼接文本（例如把用户输入拼进表达式）会让每个不同文本占一条缓存，512 条上限按最近最少使用淘汰，不会无限增长，但热路径上建议先做一次文本归一化（去空白）以提高命中率
- 回写（`Codec.encode`）为了自检会把文本重新解析一遍，**因此编码也会写入缓存**；大批量编码等于大批量解析

## 相关 API

```java
// 清空全部解析缓存
FlatExpressionParser.clearCache();

// 从动态操作里取出函数注册表（只认 RegistryOps），取不到返回 null
HolderGetter<IFunction> functions = FlatExpressionParser.functionGetter(ops);
```

解析入口本身与缓存行为见 [flat 表达式语法](./flat-syntax)，注册表与事件处理器的声明见[数学表达式模块](./index)。
