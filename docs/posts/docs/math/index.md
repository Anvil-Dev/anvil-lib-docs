---
title: Math 表达式
prev: false
next: false
---

# 数学表达式模块 <Badge type="tip" text=">=1.21.1" />

包 `dev.anvilcraft.lib.v2.math` 提供一套**可序列化的数学表达式系统**：表达式以函数调用树表示，能解析 `x*2`、`2x`、`sqrt(x)` 这类文本，能编解码为数字／文本／对象三种 JSON 形式，也能直接通过网络传输。函数本身走注册表管理：按名引用的函数由数据包 JSON 定义，代码里则直接构造内联的函数调用。

模组 id 为 `anvillib_math`，注册命名空间统一用 `anvillib`（常量 `AnvilLibMath.MAIN_ID`）。

## 架构概览

表达式树里只有一种节点——一次函数调用（`FunctionExpression`），以及按名字取值的引用（`IExpression.Reference`）。除 `$(name)` 与 `$(name...)` 之外，所有语法成分都被归约成函数调用：

| 书写形式 | 实际结构 |
|---------|---------|
| `2` | `ConstantFunction(2)` 的零参调用 |
| `x` / `y` / `z` | `InputFunction(0/1/2)` 的零参调用 |
| `x3` | `InputFunction(3)` 的零参调用 |
| `$(cost)` | `IExpression.Reference.Named("cost")`，按名字取一个数字 |
| `$(cost...)` | `IExpression.Reference.Spread("cost")`，取整个变参列表 |
| `a+b` / `a-b` / `a*b` / `a/b` / `a^b` | `LibBuiltInFunctions.ADD` 等二元函数的调用 |
| `sqrt(x)` / `max(x,1)` | `LibBuiltInFunctions.SQRT` / `MAX` 的调用 |
| `triple(x)` | 数据包函数 `anvillib:function/triple` 的调用 |
| `x -> $(x)*2` | `LambdaFunction` 的调用，作为值传给别的函数 |
| `$(v)*3`（函数体） | `CustomFunction` 的调用 |

由此形成四层结构：

1. **表达式树** (`IExpression` / `FunctionExpression` / `Arguments`) — 节点、求值、序列化入口
2. **语法** (`FlatExpressionParser` / `FlatExpressionWriter`) — flat 文本 ⟷ 表达式树
3. **函数** (`IFunction` 及其实现) — 求值行为与编解码方式
4. **注册表** (`LibRegistries`) — 函数类型注册表与函数数据包注册表

## 快速上手

**一、解析并求值一段文本。** 解析要够到函数注册表，因此需要 `RegistryOps`：

```java
RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, registryAccess);

// 数字、flat 文本、对象三种写法都认
IExpression expression = IExpression.CODEC.parse(ops, json).getOrThrow();

// x = 3，y = 5
double value = expression.evaluate(3, 5);
int rounded = expression.evaluateInt(3, 5);
```

只想解析文本、不经过 JSON 时用 `IExpression.of(functions, "2x+1")`，`functions` 取自 `registryAccess.lookupOrThrow(LibRegistries.FUNCTION_KEY)`。

**二、用数据包定义函数**，放进 `data/<命名空间>/anvillib/function/triple.json`：

```json
{
  "type": "anvillib:custom",
  "parameters": ["value"],
  "body": "$(value)*3"
}
```

之后任何表达式文本里都能写 `triple(x)`，例如 `"2*triple(x)+1"`。

**三、在代码里使用函数**。数据包注册表不能由代码注册，但代码可以直接构造内联调用，也可以把函数写成模组资源里的数据包 JSON（模组 jar 的 `data/` 目录本身就是一份数据包）：

```json
// src/main/resources/data/mymod/anvillib/function/double.json
{ "type": "anvillib:custom", "parameters": ["value"], "body": "$(value)*2" }
```

```java
// 内联定义：不经过注册表，随表达式一起序列化
FunctionExpression call = FunctionExpression.of(
    CustomFunction.of(List.of("value"), NamedFunction.call("value")),
    IExpression.of(2.0)
);
```

两种方式的细节见[自定义函数](./custom-function)，自定义 `IFunction` 实现与新的函数类型也见该页。

## 文档索引

| 文档                                | 内容                                                          |
|-----------------------------------|-------------------------------------------------------------|
| [表达式 API](./expression)           | `IExpression`、`FunctionExpression`、`Reference`、`Arguments`、求值语义与错误 |
| [函数体系](./function)               | `IFunction`、`Type` 描述符、`Parameter`/`Parameters`、内置函数、通用类型、内联与数据包两种用法 |
| [flat 表达式语法](./flat-syntax)       | 字面量、运算符与优先级、lambda、命名空间规则、解析期校验、规范回写形式                       |
| [内联与编解码](./inline-expression)    | 数字／flat 文本／对象三种内联形式、`Codec` 与 `StreamCodec` 行为、写回优先级          |
| [自定义函数](./custom-function)        | 数据包 JSON 函数、变参与参数绑定、模组资源与内联两种提供方式、下游自定义函数类型               |
| [缓存与生命周期](./cache)              | 解析缓存的分组与淘汰、为什么弱键回收不掉、数据包重载与客户端断开的清理时机                       |

## 内置函数速查

全部内置函数定义在 `LibBuiltInFunctions` 枚举里，每个常量自己就是 `IFunction`，不需要注册进任何注册表就能用（详见[函数体系](./function#内置函数)）。

| 名称        | 参数                  | 说明                                        |
|-----------|---------------------|-------------------------------------------|
| `add`     | `a`, `b`            | 加法                                        |
| `subtract`| `a`, `b`            | 减法                                        |
| `multiply`| `a`, `b`            | 乘法                                        |
| `divide`  | `a`, `b`            | 除法，除零得到 `NaN` 或无穷而不抛异常                    |
| `abs`     | `value`             | 绝对值                                       |
| `floor`   | `value`             | 向下取整                                      |
| `ceil`    | `value`             | 向上取整                                      |
| `round`   | `value`             | 四舍五入（`Math.round`，`NaN` 得 0）                |
| `sqrt`    | `value`             | 平方根，负数得到 `NaN`                             |
| `pow`     | `base`, `exponent`  | 幂，等价于 `^`                                 |
| `min`     | `x...`（可以 0 个）      | 最小值，取不到值时返回 0                            |
| `max`     | `x...`（可以 0 个）      | 最大值，取不到值时返回 0                            |
| `foreach` | `x...`, `function`  | 遍历，末位实参必须是 lambda，返回各次调用结果之和（`function` 必须给） |

内置函数都声明了形参名（就是上表的「参数」列）。调用一个函数时它的形参名会绑定进求值上下文，因此表达式里可以直接用 `$(形参名)` 引用：`add` 声明了 `a`、`b`，所以 `add($(a),$(b))` 能正常求值。前十个函数的参数个数固定；`min`/`max` 声明为变参 `x...`，可以一个实参都不给（返回 0）；`foreach` 同样带变参，`function` 必须给。参数个数不合法时**在解析期**就报错（报错文本末尾还会带出错位置），例如 `sqrt(x,1)` 会抛出 `function 'anvillib:sqrt' Expected 1 arguments but got 2 at position 9 of expression "sqrt(x,1)"`，`foreach()` 会抛出 `function 'anvillib:foreach' Expected at least 1 arguments but got 0`——这里的下限 1 来自必给的 `function`，不是变参（`foreach(x -> $(x))` 合法：lambda 喂给 `function`，变参一个都不给，遍历结果为空）。

运算符与内置函数的对应关系是硬编码的（`+`→`add`、`-`→`subtract`、`*`→`multiply`、`/`→`divide`、`^`→`pow`），解析运算符时**不查注册表**，因此注册一个 `anvillib:add` 也改不了 `+` 的含义。

## 模块主类

### AnvilLibMath

模组入口，`@Mod("anvillib_math")`，同时负责注册函数类型与内置函数；下游模组不需要再调用它们。

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_math";

public AnvilLibMath(IEventBus modEventBus, ModContainer ignored) {
    LibFunctionTypes.register(modEventBus);
    LibBuiltInFunctions.register(modEventBus);
}

// 创建 anvillib 命名空间的 Identifier
public static Identifier of(String path) { ... }
```

## 注册表

`LibRegistries` 声明两个注册表，定义在 `anvillib` 命名空间下：

| 注册表                    | 键                          | 类型                     | 说明                    |
|------------------------|----------------------------|------------------------|-----------------------|
| 函数类型注册表（同步）            | `anvillib:function_type`   | `IFunction.Type<?>`    | 决定 `IFunction` 的编解码方式，`RegistryBuilder` 建表并 `sync(true)` |
| 函数数据包注册表               | `anvillib:function`        | `IFunction`            | 可被表达式按名引用的函数，随数据包加载并同步到客户端 |

```java
public static final ResourceKey<Registry<IFunction.Type<?>>> FUNCTION_TYPE_KEY =
    ResourceKey.createRegistryKey(AnvilLibMath.of("function_type"));
public static final Registry<IFunction.Type<?>> FUNCTION_TYPE = new RegistryBuilder<>(FUNCTION_TYPE_KEY)
    .sync(true)
    .maxId(512)
    .create();
public static final ResourceKey<Registry<IFunction>> FUNCTION_KEY =
    ResourceKey.createRegistryKey(AnvilLibMath.of("function"));
```

- 函数类型注册表在 `NewRegistryEvent` 里 `event.register(FUNCTION_TYPE)`，并同步到客户端（自定义函数类型要在两端都注册，否则客户端解不出网络包）
- 函数数据包注册表在 `DataPackRegistryEvent.NewRegistry` 里用 `event.dataPackRegistry(FUNCTION_KEY, IFunction.DIRECT_CODEC, IFunction.DIRECT_CODEC)` 建立，因此它**只能由数据包 JSON 填充**：`RegisterEvent` 只为 `BuiltInRegistries` 里的注册表触发，`DeferredRegister` 对它无效；代码里也不能直接 `Registry.register`（模组 jar 里的 `data/` 目录本身就是一份数据包）
- 条目路径遵循原版约定：`anvillib:function` 下的 `triple` 对应 `data/<命名空间>/anvillib/function/triple.json`
- 内置函数**不占**这里的条目：`LibBuiltInFunctions` 是枚举硬编码查找，序列化时以内联定义写出

## 依赖引入

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-math-neoforge-26.1:2.0.0"
}
```

聚合模块 `anvillib-neoforge-26.1` 已通过 `jarJar` 包含本模块；本模块自身依赖 `anvillib-util-neoforge-26.1`（`IFunction.Type` 继承自它的 `ISerializer`），`jarJar` 会一并带上。

## 注意事项

- **索引越界、名字未绑定、除零、负数开方都不抛异常**，分别得到 `0` 或 `NaN`；只有整份列表引用 `$(name...)` 落在需要单个数字的位置、名字没绑定成列表、或实参个数与形参声明不符时才抛异常（见[表达式 API](./expression#求值语义与错误)）
- **函数个数与名字在解析期就校验**：数据包函数个数不符不会落进存档（见 [flat 表达式语法](./flat-syntax#参数个数校验)）
- **解析与回写 flat 文本要够到函数注册表**，因此只接受 `RegistryOps`；其它 `DynamicOps` 下 flat 文本分支返回错误，数字与对象形式仍然可用
- **回写结果是规范形式而非原文**：`2*x` 变成 `2x`、`x0` 变成 `x`、`anvillib:` 前缀一律省略，但任何回写结果重新解析都得到同一棵表达式树（见 [flat 表达式语法](./flat-syntax#规范回写形式)）
- **名字区分大小写地写、不区分大小写地读**：解析前会把函数名转小写，因此 `SQRT(x)` 能读到 `sqrt(x)`，而注册表里路径含大写字母的函数无法从 flat 文本引用
- **`x` / `y` / `z` 是传入值而不是函数名**：解析器先认变量后认函数，所以叫 `x`、`x0` 的函数写不出裸名（回写时退回对象形式）
- **解析结果按函数注册表实例缓存，容量 512 且没有过期时间**；弱键回收不掉，因此服务器启动、`/reload`、客户端断开会主动清理，细节见[缓存与生命周期](./cache)
- **函数体自引用不会栈溢出**：求值期有 64 层的调用深度守卫（见[函数体系](./function#调用深度守卫)）
