---
title: Math 表达式 API
prev: false
next: false
---

# 表达式 API

包 `dev.anvilcraft.lib.v2.math.expression` 提供表达式树本身。树的节点分两类：一次函数调用（`FunctionExpression`），以及按名字取值的引用（`IExpression.Reference`）。

## IExpression

表达式节点接口，是使用本模块的主要入口。

```java
public interface IExpression {
    double evaluate(Arguments inputs);
    default double evaluate(double... inputs) { ... }
    default int evaluateInt(Arguments inputs) { ... }
    default int evaluateInt(double... inputs) { ... }

    static Reference ref(String name) { ... }
    static FunctionExpression of(double value) { ... }
    static IExpression of(HolderGetter<IFunction> functions, String source) { ... }
    static FunctionExpression of(IFunction function, IExpression... arguments) { ... }
}
```

### 求值

| 方法                                     | 说明                        |
|----------------------------------------|---------------------------|
| `evaluate(Arguments inputs)`            | 按传入值求值，名字与下标都能用            |
| `evaluate(double... inputs)`            | 传入值只按下标引用                 |
| `evaluateInt(Arguments inputs)`         | 求值后 `Math.round` 取整        |
| `evaluateInt(double... inputs)`         | 上述两者的组合                   |

`evaluate(double...)` 是 `evaluate(Arguments.of(inputs))` 的便捷写法，等价于只按下标绑定一批传入值。

```java
IExpression expression = IExpression.of(functions, "2x+1");
expression.evaluate(3);        // 7.0
expression.evaluateInt(3);     // 7
```

### 求值语义与错误

本模块刻意让「算不出来」静默退化，只有**结构性错误**才抛异常：

| 情况                                | 结果                                    |
|-----------------------------------|---------------------------------------|
| 除零 `x/0`                          | `Infinity` / `-Infinity`，`0/0` 是 `NaN` |
| 负数开方 `sqrt(-1)`                    | `NaN`                                 |
| 下标越界 `x9`                         | `0`                                   |
| 名字未绑定 `$(nothing)`                 | `0`                                   |
| 名字绑到变参列表后按单值取 `$(x)`               | 列表里的**最大值**                          |
| 名字绑到空列表后按单值取 `$(x)`                | `0`                                   |
| `$(name...)` 落在需要单个数字的位置           | 抛 `IllegalStateException`              |
| `$(name...)` 的名字没绑定成列表             | 抛 `IllegalArgumentException`           |
| 实参个数与形参声明不符（`IFunction.bind`）       | 抛 `IllegalArgumentException`           |
| 函数体递归超过 64 层                      | 抛 `IllegalStateException`              |

前三行的边界行为来自 Java 的浮点语义与 `Arguments.value(int)` 的兜底，`NaN` 会沿着后续运算继续传播。想把「缺失」和「真是 0」区分开，只能自己保证传入值齐全。

```java
IExpression.of(functions, "1/x").evaluate(0);          // Infinity
IExpression.of(functions, "sqrt(x)").evaluate(-1);     // NaN
IExpression.of(functions, "x9").evaluate(3);           // 0.0（下标 9 越界）
IExpression.of(functions, "$(cost)").evaluate(3);      // 0.0（没有绑定 cost）
```

### evaluateInt 的边界

`evaluateInt` 的边界按 `Math.round(double)` 走，与上面这些保持 `NaN` 的函数不同：`NaN` 会得到 `0`，超出 `long` 范围的值夹到 `Long.MIN_VALUE`/`Long.MAX_VALUE`，最后那步 `(int)` 强转还会按补码回绕。所以 `evaluateInt(sqrt(-1))` 是 `0`、`round(1e300)` 是 `Long.MAX_VALUE`、`evaluateInt(3e9)` 是负数；要区分这些情况就直接看 `evaluate` 的原始值。同理，内置的 `round` 函数本身也有这个边界（`round(sqrt(-1))` 是 `0`，不是 `NaN`）。

### 静态工厂

```java
// 内联一个数字
FunctionExpression two = IExpression.of(2.0);

// 解析一段 flat 文本（需要函数注册表）
IExpression parsed = IExpression.of(functions, "2x+1");

// 内联一次函数调用
FunctionExpression call = IExpression.of(LibBuiltInFunctions.SQRT, IExpression.of(9.0));
call.evaluate();   // 3.0

// 按名字取值的引用，名字以 "..." 结尾时取整份列表
IExpression named = IExpression.ref("cost");     // $(cost)
IExpression spread = IExpression.ref("x...");    // $(x...)
```

`IExpression.of(HolderGetter<IFunction>, String)` 直接转调 `FlatExpressionParser.parseValue`，文本不合法时抛 `IllegalArgumentException`，成功时结果进解析缓存（见[缓存与生命周期](./cache)）。

### 编解码常量

| 常量                       | 类型                                                | 说明                                    |
|--------------------------|---------------------------------------------------|---------------------------------------|
| `CODEC`                  | `Codec<IExpression>`                              | 数字／flat 文本／对象三种内联形式，写回时优先写最简的一支        |
| `FLAT_OR_OBJECT_CODEC`   | `Codec<IExpression>`                              | 只有 flat 文本与对象两支，写不出文本时退回对象            |
| `STREAM_CODEC`           | `StreamCodec<RegistryFriendlyByteBuf, IExpression>` | 网络编解码，由 `CODEC` 桥接                      |
| `LIST_CODEC`             | `Codec<List<IExpression>>`                        | 表达式列表（`CODEC.listOf()`）                |

`FLAT_OR_OBJECT_CODEC` 不能用 `Codec.xor` 实现：`xor` 的编码器只认定一支，文本写不出来时会直接失败，退回不了对象。它的解码顺序是先试 flat 文本、失败再试对象形式；而 `CODEC` 在最前面还多一支数字。三种形式与写回优先级见[内联与编解码](./inline-expression)。

## FunctionExpression

表达式树的调用节点：一个函数加上它的实参。

```java
public record FunctionExpression(Holder<IFunction> function, List<IExpression> arguments)
        implements IExpression {
    public static FunctionExpression of(IFunction function, IExpression... arguments) { ... }
    public static FunctionExpression of(Holder<IFunction> function, IExpression... arguments) { ... }
    public double evaluate(Arguments inputs) { ... }
}
```

- `function` 是 `Holder<IFunction>`：**注册表引用**（`Holder.Reference`）表示数据包 JSON 定义的函数，**内联 `Holder.direct`** 表示随表达式一起序列化的函数（内置函数、常量、`x`、lambda、函数体）
- `arguments` 在构造时做不可变拷贝
- 求值时把**未求值**的实参表达式连同当前上下文一起交给 `IFunction.apply`，由函数自己决定何时、在什么上下文里求值：普通函数在调用点上下文里求值实参并按形参名绑定，lambda 则先换成自己的形参绑定再求值函数体

```java
// 数据包函数的引用
Holder<IFunction> triple = functions.get(ResourceKey.create(LibRegistries.FUNCTION_KEY, AnvilLibMath.of("triple")))
    .orElseThrow();

// 内联一个内置函数
FunctionExpression call = FunctionExpression.of(
    LibBuiltInFunctions.MULTIPLY,
    IExpression.of(2.0),
    InputFunction.call(0)
);
call.evaluate(3); // 6.0
```

`FunctionExpression` 自带三套编解码：`MAP_CODEC`（对象形式 `{"function": …, "arguments": […]}`）、`CODEC`（同上，作为 `Codec`）、`STREAM_CODEC`（网络）。对象形式的 `function` 字段由 `IFunction.HOLDER_CODEC` 决定：注册表里的函数写成**注册名字符串**，内联定义写成**对象**：

```json
{ "function": "anvillib:triple", "arguments": ["x"] }
```

```json
{ "function": { "type": "anvillib:builtin", "builtin": "sqrt" }, "arguments": [9] }
```

## IExpression.Reference

按名字取值的实参不是函数调用，而是单独的引用节点：

```java
public sealed interface Reference extends IExpression permits Reference.Named, Reference.Spread {
    String name();

    record Named(String name) implements Reference { ... }    // $(name)
    record Spread(String name) implements Reference { ... }   // $(name...)
}
```

- `$(name)`（`Reference.Named`）取一个数字；`name` 绑定到变参上时得到列表里的**最大值**
- `$(name...)`（`Reference.Spread`）取**整份列表**本身，`name()` 里不带 `...`（后缀在 `IExpression.ref` 里就被剥掉了）。它不是数字，只能传给变参形参位置，用在需要单个数字的地方会在求值期抛出 `IllegalStateException`
- 整份列表交给变参位置时会被**摊开**：`min($(x...), 4)` 在 `x = [9, 2, 7]` 时就是 `min(9, 2, 7, 4)`
- 引用节点只按**名字**取值，名字绑定由调用上下文提供（调用点的传入值，或当前调用的形参绑定）

```java
// 两种引用
IExpression named = IExpression.ref("cost");     // Reference.Named
IExpression spread = IExpression.ref("x...");    // Reference.Spread（名字以 ... 结尾时；后缀在构造时被剥掉，name() 是 "x"）

// 直接求值：$() 引用依赖上下文里的名字绑定
named.evaluate(Arguments.of(List.of(3.0), List.of("cost"), List.of(new Arguments.Value.Single(42)))); // 42.0
```

`$(x)` 与 `x` 在求值期**不等价**：`x` 是 `InputFunction(0)`，按传入值下标取值；`$(x)` 是 `Reference.Named("x")`，按名字绑定取值。只有在 `x` 既没被绑定成名字、又恰好是第 0 个传入值时二者结果才相同（都是 0 或都是那个值）。flat 文本里两者写法不同，回写时也按各自形式写回。

## Arguments

求值时的传入值集合，既可以按下标引用，也可以按名字引用。名字绑定有两种值：单个数字，以及变参绑定的一串数字。

```java
public record Arguments(List<Double> values, Map<String, Value> named) {
    public static Arguments of(double... values) { ... }
    public static Arguments of(List<Double> values, List<String> names, List<Value> bound) { ... }
    public Arguments withAll(List<String> names, List<Value> bound) { ... }
    public double value(int index) { ... }
    public double value(String name) { ... }
    public List<Double> list(String name) { ... }
    public boolean isList(String name) { ... }

    public sealed interface Value permits Value.Single, Value.Many {
        record Single(double value) implements Value { ... }
        record Many(List<Double> values) implements Value { ... }
    }
}
```

| 方法                          | 说明                                                                    |
|-----------------------------|-----------------------------------------------------------------------|
| `value(int index)`          | 按下标取一个数字，`index < 0` 或越界时返回 `0`                                       |
| `value(String name)`        | 按名字取一个数字：未绑定时返回 `0`，绑到列表时返回列表里的**最大值**，绑到空列表时返回 `0`                  |
| `list(String name)`         | 按名字取整份列表，未绑定或绑的是单个数字时返回**空列表**                                       |
| `isList(String name)`       | 该名字是否绑定成了一份列表。`list` 分不开「名字写错」与「绑定成空列表」，靠这个区分：前者说明 `$(name...)` 写错了名字 |
| `withAll(names, bound)`     | 在已有绑定之上再加一批，同名的以新值为准，返回新实例（原实例不变）                                     |

名字来自两种绑定：**调用点提供的传入值**，以及**正在求值的那次调用为形参建立的名字绑定**（`IFunction.bind` 内部就是调 `withAll`）。形参绑定覆盖调用点的同名传入值。

```java
// 只按下标
double a = expression.evaluate(3, 5, 7);

// 下标 + 具名混合
Arguments inputs = Arguments.of(List.of(3.0), List.of("cost"), List.of(new Arguments.Value.Single(10)));
double b = expression.evaluate(inputs);

// 变参绑定：名字绑到一份列表上
Arguments spread = Arguments.of(List.of(), List.of("xs"), List.of(new Arguments.Value.Many(List.of(1.0, 2.0, 3.0))));
spread.value("xs");   // 3.0，列表里的最大值
spread.list("xs");    // [1.0, 2.0, 3.0]
spread.isList("xs");  // true
spread.isList("typo");// false
```

`Arguments` 本身是不可变记录（构造时对 `values`、`named` 以及 `Value.Many` 里的列表做拷贝），因此可以安全地在多次求值之间复用同一个实例。
