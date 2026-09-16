---
title: Math 内联与编解码
prev: false
next: false
---

# 内联与编解码

`IExpression.CODEC` 同时接受三种写法，写回时按同样的优先级选择。`FunctionExpression.CODEC` 只是其中的**对象形式**，数字与 flat 文本两支由 `IExpression.CODEC` 兜底。

## 三种内联形式

### 数字

一个 JSON 数字就是 `ConstantFunction` 的零参调用。

```json
7
```

### flat 文本

一段字符串就是解析后的调用树，解析需要函数注册表。

```json
"2x+1"
```

### 对象形式

显式的函数 + 实参结构，`arguments` 省略时视为空列表。

`function` 字段由 `IFunction.HOLDER_CODEC`（`RegistryFileCodec`）决定，两种写法都认：

```json
{
  "function": "anvillib:triple",
  "arguments": ["x"]
}
```

```json
{
  "function": {
    "type": "anvillib:constant",
    "value": 4
  }
}
```

```json
{
  "function": {
    "type": "anvillib:builtin",
    "builtin": "pow"
  },
  "arguments": [
    "x",
    2
  ]
}
```

- 注册表里的函数（数据包 JSON 定义）写成**注册名字符串**，读回来是 `Holder.Reference`
- 内联定义写成**对象**，第一层字段 `type` 是函数类型（`anvillib:builtin`、`anvillib:constant`、`anvillib:custom`、`anvillib:lambda`、`anvillib:input`、`anvillib:named`，或下游注册的类型），其余字段由该类型的 `MapCodec` 决定
- 字符串形式要求 `RegistryOps`：没有注册表时读不到条目，报 `Failed to get element ResourceKey[...]`

三种写法互相等价，例如下面两个 JSON 解析出**同一棵表达式树**：

```json
"2x+1"
```

```json
{
  "function": { "type": "anvillib:builtin", "builtin": "add" },
  "arguments": [
    {
      "function": { "type": "anvillib:builtin", "builtin": "multiply" },
      "arguments": [2, "x"]
    },
    1
  ]
}
```

lambda 是值，也能写成对象形式：它的函数类型是 `anvillib:lambda`，字段与 `anvillib:custom` 一样是 `parameters` 与 `body`。能用 flat 文本表达的 lambda 会优先写成 `x -> $(x)*2` 这样的文本，写不出来时才退回对象形式。

```json
{
  "function": {
    "type": "anvillib:lambda",
    "parameters": ["x"],
    "body": "$(x)*2"
  }
}
```

## 写回优先级

编码时按以下顺序尝试：

1. **数字** — 整棵树是零实参的 `ConstantFunction` 调用（`ConstantFunction.value(FunctionExpression)` 能取出常量值）
2. **flat 文本** — 整棵树都能用 flat 文本表达
3. **对象形式** — 其余情况

也就是说，只要函数在 `anvillib:function` 注册表里能取到名字，就会写成 flat 文本；取不到名字（内联的函数定义，例如内置函数）或节点写不出文本时退回对象形式。非有限常量（`NaN`、无穷）写不成 flat 文本——解析器也不接受溢出成无穷的字面量——所以不要把非有限值当作可序列化的常量，各 `DynamicOps` 对它的支持也不一致。

```java
// 引用注册表里的函数 -> 写成 flat 文本
DataResult<JsonElement> asText = IExpression.CODEC.encodeStart(ops, parsed);   // "2x+1"

// 内联一个数据包自定义函数 -> 写成对象
DataResult<JsonElement> asObject = IExpression.CODEC.encodeStart(ops, inlineCall);
```

写回不是「尽力而为」：`FlatExpressionWriter` 会把写出的文本重新解析、再写一遍，两次不一致或读回来不是同一棵树时就判为写不出来，交给对象形式。因此任何写出的文本都能读回同一棵树，代价是编码约为树规模的两倍（并把文本写进解析缓存，见[缓存与生命周期](./cache)）。

## RegistryOps 要求

flat 文本的解析与回写都要查 `anvillib:function` 注册表，因此涉及文本与引用字符串的分支只接受 `RegistryOps`：

| 分支                        | 非 `RegistryOps` 下的行为                        |
|---------------------------|---------------------------------------------|
| 数字                        | 可用                                          |
| flat 文本（读与写）               | 返回错误 `Cannot access registry ResourceKey[minecraft:root / anvillib:function], use RegistryOps` |
| 对象形式 + 内联函数定义             | 可用                                          |
| 对象形式 + 注册名字符串             | 读不到条目（`Failed to get element ...`）           |

```java
RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, registryAccess);
IExpression expression = IExpression.CODEC.parse(ops, json).getOrThrow();
```

解析失败时 `IExpression.CODEC` 会把 flat 分支的错误丢掉、改报对象分支的错误，因此想看到上面这些文本错误，得直接调用 `FlatExpressionParser.codec()`。完整错误信息表见 [flat 表达式语法](./flat-syntax#解析错误信息一览)。

## 编解码常量一览

表达式侧：

| 常量                                   | 类型                                                  | 说明                                     |
|--------------------------------------|-----------------------------------------------------|----------------------------------------|
| `IExpression.CODEC`                  | `Codec<IExpression>`                                | 数字／flat 文本／对象三支，写回时按优先级选                 |
| `IExpression.FLAT_OR_OBJECT_CODEC`   | `Codec<IExpression>`                                | 只有文本与对象两支                              |
| `IExpression.LIST_CODEC`             | `Codec<List<IExpression>>`                          | 实参列表（`CODEC.listOf()`）                  |
| `IExpression.STREAM_CODEC`           | `StreamCodec<RegistryFriendlyByteBuf, IExpression>` | 网络编解码，由 `CODEC` 桥接                      |
| `FunctionExpression.MAP_CODEC`       | `MapCodec<FunctionExpression>`                      | 对象形式，作为地图编解码器使用                        |
| `FunctionExpression.CODEC`           | `Codec<FunctionExpression>`                         | 对象形式                                   |
| `FunctionExpression.STREAM_CODEC`    | `StreamCodec<RegistryFriendlyByteBuf, FunctionExpression>` | 一次调用的网络编解码                             |

函数侧：

| 常量                            | 说明                                               |
|-------------------------------|--------------------------------------------------|
| `IFunction.DIRECT_CODEC`      | 内联定义，按 `type()` 分发                                |
| `IFunction.HOLDER_CODEC`      | 注册名字符串或内联对象，读回 `Holder<IFunction>`                |
| `IFunction.CODEC`             | `IFunction` 本身：写引用优先、退化内联；解码走 `HOLDER_CODEC`        |
| `IFunction.HOLDER_STREAM_CODEC` | 按注册表引用传输函数                                        |
| `IFunction.STREAM_CODEC`      | 内联定义，按 `type()` 分发                                 |
| `ConstantFunction.CODEC`      | `Codec<Double>`，常量的内联形式就是数字                       |
| 各类型的 `MAP_CODEC` / `STREAM_CODEC` | 由 `Type.codec()` / `Type.streamCodec()` 暴露     |

## 网络编解码

`IExpression.STREAM_CODEC` 由 `CODEC` 桥接而来，走注册表同步，可以放进数据包与数据组件：

```java
StreamCodec<RegistryFriendlyByteBuf, IExpression> STREAM_CODEC = IExpression.defer(
    () -> ByteBufCodecs.fromCodecWithRegistries(IExpression.CODEC).cast()
);
```

- `FunctionExpression.STREAM_CODEC` 与 `IFunction.HOLDER_STREAM_CODEC` 分别用于传输整个调用节点与按引用传输函数（`ByteBufCodecs.holderRegistry(LibRegistries.FUNCTION_KEY)`）
- 网络路径上内联定义会被完整写进字节流，注册表引用只写一个 id，因此两端注册表必须一致：`anvillib:function` 是数据包注册表，由原版同步；`anvillib:function_type` 是 `sync(true)` 的同步注册表，下游新增的函数类型要在两端都注册
- 同一个表达式编码两遍得到同样的字节；flat 文本与对象形式在网络上都能读回来（都在 `CODEC` 的接受范围内）
- 客户端收到新注册表后，旧的解析缓存不会被自动回收，断开连接时会清一次，见[缓存与生命周期](./cache)

```java
RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), registryAccess);
IExpression.STREAM_CODEC.encode(buf, expression);
IExpression decoded = IExpression.STREAM_CODEC.decode(buf);
```

## 内置函数的类型

内置函数由 `LibBuiltInFunctions` 自带的类型 `anvillib:builtin` 承载，靠 `builtin` 字段区分具体函数：

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

`builtin` 字段的取值就是 `LibBuiltInFunctions` 枚举名的小写形式（`ADD` → `add`），因此 `{"type": "anvillib:builtin", "builtin": "add"}` 与 flat 文本里的 `+` 是同一个函数。内置函数不属于 `anvillib:function` 注册表，所以它们在 JSON 里总是以内联定义出现，不会被写成 `"anvillib:sqrt"` 这样的引用字符串。
