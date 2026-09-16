---
title: Math 函数体系
prev: false
next: false
---

# 函数体系

包 `dev.anvilcraft.lib.v2.math.expression.function` 提供函数的定义、求值与编解码。函数是**类型化对象**：先由 `Type` 描述符决定怎么编解码，再由 `IFunction` 自己决定怎么求值。

## IFunction

```java
public interface IFunction {
    int MAX_CALL_DEPTH = 64;
    ThreadLocal<Integer> CALL_DEPTH = ThreadLocal.withInitial(() -> 0);

    double apply(List<IExpression> arguments, Arguments inputs);
    default double apply(Call call) { ... }
    default double applyBound(List<Double> arguments, Arguments bound) { ... }
    default Parameters parameters() { ... }
    default double guarded(String description, Supplier<Double> body) { ... }
    Type<? extends IFunction> type();

    static @Nullable HolderGetter<IFunction> getter(DynamicOps<?> ops) { ... }
    static Type<? extends IFunction> typeOf(ResourceKey<Type<?>> key) { ... }
    static Call bind(List<IExpression> arguments, Arguments inputs, Parameters parameters) { ... }
    static List<Double> numbers(Arguments.Value value) { ... }

    record Call(List<IExpression> references, List<Double> values, Arguments bound) {
        public double valueAt(int index) { ... }
    }

    interface Type<F extends IFunction> extends ISerializer<F>, StringRepresentable {
        MapCodec<F> codec();
        StreamCodec<RegistryFriendlyByteBuf, F> streamCodec();
    }
}
```

| 方法                              | 说明                                                                          |
|---------------------------------|-----------------------------------------------------------------------------|
| `apply(arguments, inputs)`      | 求出本次调用的结果；`arguments` 是**未求值**的实参表达式，函数自己决定在什么上下文里求它们                          |
| `apply(call)`                   | 便捷重载：实参已按形参绑定好，`call.valueAt(int)` 取某一位的数值，`call.bound()` 取绑定后的上下文          |
| `applyBound(arguments, bound)`  | 只看数字与上下文的入口，固定形参位是绑到的数字、变参位是列表里的最大值；只关心「每个形参绑到一个数」的函数类型可以重写它 |
| `parameters()`                  | 形参声明，默认 `Parameters.EMPTY`，适用于零参函数类型                                          |
| `type()`                        | 返回 `Type` 描述符，决定这个函数怎么编解码                                                    |
| `guarded(description, body)`    | 在调用深度守卫内求值，超深时抛出可读异常（见[调用深度守卫](#调用深度守卫)）                                     |

默认的 `apply(arguments, inputs)` 会按 `parameters()` 校验实参个数，在调用点上下文里求值全部实参，再按位置绑成名字交给 `apply(Call)`；没有形参声明、或者要自己控制实参求值时机的函数类型应当重写它。`applyBound` 的默认实现直接抛 `IllegalStateException`，提醒实现者二者选一。

`IFunction.Type` 同时是 `ISerializer`（`dev.anvilcraft.lib.v2.util.ISerializer`，来自 util 模块）与 `StringRepresentable`：`getSerializedName()` 就是它在 `anvillib:function_type` 注册表里的路径，`codec()` 是 JSON 侧的 `MapCodec`，`streamCodec()` 是网络侧的 `StreamCodec`。

### 编解码常量

| 常量                     | 说明                                                    |
|------------------------|-------------------------------------------------------|
| `DIRECT_CODEC`         | 内联形式，按 `type()` 分发到对应 `Type.codec()`                  |
| `HOLDER_CODEC`         | `anvillib:function` 的条目引用，也用于内联定义（`RegistryFileCodec`）   |
| `HOLDER_STREAM_CODEC`  | 按引用传输函数（`ByteBufCodecs.holderRegistry`）               |
| `STREAM_CODEC`         | 内联形式，按 `type()` 分发到 `Type.streamCodec()`               |
| `CODEC`                | 优先写注册表里已有的引用，找不到可引用的条目时退化为内联定义                        |
| `getter(DynamicOps)`   | 从动态操作里取出函数注册表，取不到返回 `null`（只认 `RegistryOps`）          |

`HOLDER_CODEC` 的两种写法由 `RegistryFileCodec` 决定：函数是注册表条目时写成**注册名字符串**，是内联定义时写成**对象**：

```json
"anvillib:triple"
```

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

`CODEC` 只覆写了编码器：它在注册表里按值找同一条目，找到就写引用，找不到就写内联定义；解码固定走 `HOLDER_CODEC`，因此读引用形式需要 `RegistryOps`。

### Parameter 与 Parameters

`parameters()` 返回的形参声明是一组值对象：

```java
public record Parameter(String name, boolean variadic) {
    public static final String VARIADIC_SUFFIX = "...";
    public static Parameter parse(String declaration) { ... }   // "x..." 是变参
    public String declaration() { ... }                        // 变参带 ...
    public int minimumCount() { ... }                          // 固定形参 1，变参 0
    public static @Nullable Parameter variadicOf(List<Parameter> parameters) { ... }
}

public record Parameters(List<Parameter> parameters) {
    public static final Parameters EMPTY = new Parameters(List.of());
    public static Parameters parse(List<String> declarations) { ... }   // "x..." 结尾的是变参
    public static Parameters of(List<String> names) { ... }             // 全部当作固定形参
    public boolean isEmpty() { ... }
    public int size() { ... }
    public List<String> names() { ... }            // 变参名不带 ...
    public List<String> declarations() { ... }     // 变参名带 ...
    public @Nullable Parameter variadic() { ... }  // 没有变参时为 null
    public boolean variadicExists() { ... }
    public int fixedCount() { ... }                // 不是变参的形参个数
    public int minimumArity() { ... }
    public int maximumArity() { ... }              // 有变参时是 Integer.MAX_VALUE
    public void checkArity(int size) { ... }
    public void checkArity(List<IExpression> arguments) { ... }
    public String range() { ... }                  // "2"、"at least 1"、"1 to 3"
}
```

规则：

- 形参名必须是标识符：首字符是字母或下划线，其余是字母、数字或下划线。名字里出现空格、`)` 之类的字符会在**构造期**被拒，而不是等到回写文本时才发现写不出来
- 名字以 `...` 结尾就是变参（`Parameter.VARIADIC_SUFFIX`），存储时后缀被剥掉，`names()` 里的变参名不带 `...`
- 一个签名里**最多一个**变参，出现两个直接抛 `IllegalArgumentException: At most one variadic parameter is allowed`
- 变参可以出现在**任意位置**，不限于末位：它吃掉「实参总数减去固定形参个数」个实参，前后的固定形参照样拿得到值
- 变参按 Java 的变参语义处理，**下限是 0**（`minimumCount()` 返回 0），因此 `min()` 合法；固定形参一个都不能少
- 名字重复抛 `IllegalArgumentException: Duplicate parameter name '<name>'`；空名字抛 `Parameter name cannot be empty`

`checkArity(int)` 用于「已知实参个数」的场合，`checkArity(List<IExpression>)` 用于「实参还是表达式」的场合：后者会把 `$(name...)` 这种整份列表引用当成可摊开的区间，只在「即使摊开也不可能合法」时才报错（函数没有变参形参时，列表一个固定形参位都接不住）。解析器、`LibBuiltInFunctions.call`/`callChecked` 与 `IFunction.bind` 共用这两份判断，报错口径不会出现两套说法。

### 调用深度守卫

函数体可以按名引用注册表里的任何函数，包括自己，因此自引用与互相引用必须在求值期拦下来，否则会以 `StackOverflowError` 收场：

- `MAX_CALL_DEPTH = 64`：当前线程允许的最大调用深度
- `CALL_DEPTH`：`ThreadLocal<Integer>`，记录同线程当前深度
- `guarded(description, body)`：深度已达上限时抛 `IllegalStateException: Function call depth exceeded 64 at <description>`，否则把深度加一、执行 `body`，并在 `finally` 里复原（异常路径也不污染后续调用）

`CustomFunction` 与 `LambdaFunction` 都走同一个守卫（描述分别是 `parameters [...]` 与 `lambda [...]`），因此两个**注册进注册表、互相按名调用**的 lambda 也会被拦下，而不只是穿过 `CustomFunction` 的环。正常函数体远达不到 64 层，代价可以忽略。

### 实参绑定

`bind(arguments, inputs, parameters)` 是「实参 → 形参」的配位逻辑，重写 `apply` 时可以直接用它：

1. 逐个求值实参：整份变参列表的引用（`IExpression.Reference.Spread`）不求值，直接把列表绑上去，名字没绑定成列表时先报 `$(name...) is not bound to a list`
2. 按**实参个数**配位：变参先把它后面每个固定形参的位子留出来，剩下的才归它，`$(name...)` 再从变参位开始摊开占用若干位
3. 摊开的元素多于该位能吃的数时抛 `IllegalStateException: <实参> provides N arguments but this position takes M`；整份列表落在固定形参位上时抛 `<实参> is a list and can only be passed to a variadic parameter`

配位结果打包成 `Call(references, values, bound)`：`references` 是原实参表达式，`values` 是各形参绑到的数字（变参位是列表里的最大值），`bound` 是「调用点传入值 + 本次形参绑定」的新上下文，函数体里的 `$(name)` 就是从这里取值的。

## 内置函数

内置函数由 `LibBuiltInFunctions` 定义，它本身就是一个 `IFunction` 枚举：每个枚举常量既携带参数名与求值行为，也是表达式树里的节点，不留中间表示。查找走 `byName` 的枚举硬编码，**不占** `anvillib:function` 注册表的条目——那是数据包注册表，只在数据包加载时由 JSON 填充；序列化时内置函数因此总以内联定义写出。

```java
public enum LibBuiltInFunctions implements IFunction, StringRepresentable {
    ADD(List.of("a", "b")) {
        @Override
        public double apply(Call call) {
            return call.valueAt(0) + call.valueAt(1);
        }
    },
    // ...
    MAX(List.of("x...")) { ... },
    FOREACH(List.of("x...", "function")) { ... };

    public static void register(IEventBus modEventBus) { ... }   // 由 AnvilLibMath 调用
    public static @Nullable LibBuiltInFunctions byName(String name) { ... }   // 不区分大小写
    public Parameters parameters() { ... }
    public int minimumArity() { ... }
    public int maximumArity() { ... }
    public Identifier id() { ... }                                 // anvillib:<小写枚举名>
    public FunctionExpression call(IExpression... arguments) { ... }
    public FunctionExpression call(List<IExpression> arguments) { ... }
    public DataResult<FunctionExpression> callChecked(List<IExpression> arguments) { ... }
}
```

### 全部常量

| 常量          | 参数                  | 参数个数   | 求值行为                            |
|-------------|---------------------|--------|---------------------------------|
| `ADD`       | `a`, `b`            | 2      | `a + b`                         |
| `SUBTRACT`  | `a`, `b`            | 2      | `a - b`                         |
| `MULTIPLY`  | `a`, `b`            | 2      | `a * b`                         |
| `DIVIDE`    | `a`, `b`            | 2      | `a / b`，不检查除零                   |
| `ABS`       | `value`             | 1      | `Math.abs`                      |
| `FLOOR`     | `value`             | 1      | `Math.floor`                    |
| `CEIL`      | `value`             | 1      | `Math.ceil`                     |
| `ROUND`     | `value`             | 1      | `Math.round`，`NaN` 得 0、超 `long` 范围饱和 |
| `SQRT`      | `value`             | 1      | `Math.sqrt`，负数得 `NaN`            |
| `POW`       | `base`, `exponent`  | 2      | `Math.pow`，等价于 `^`              |
| `MIN`       | `x...`              | ≥ 0    | 变参列表最小值，空列表返回 0                 |
| `MAX`       | `x...`              | ≥ 0    | 变参列表最大值，空列表返回 0                 |
| `FOREACH`   | `x...`, `function`  | ≥ 1    | 末位是 lambda，返回各次调用结果之和           |

注册名（`id()`）是枚举名的小写形式（`ADD` → `anvillib:add`），`byName` 查找时不区分大小写。`MIN`/`MAX` 按名字取整份变参列表（`call.bound().list("x")`），因此空列表与「一个 0」区分得开。

### foreach

`foreach` 是唯一接 lambda 的内置函数：末位实参必须是 lambda，它之前的实参构成被遍历的列表，返回值是各次调用结果之和。

```java
// 等价于 flat 文本 "foreach(1,2,3,x -> $(x)*2)"，求值为 12.0
LibBuiltInFunctions.FOREACH.call(
    IExpression.of(1), IExpression.of(2), IExpression.of(3),
    LambdaFunction.call("x", LibBuiltInFunctions.MULTIPLY.call(IExpression.ref("x"), IExpression.of(2)))
);
```

- 变参位上是 `$(x...)` 时拿到的是整份列表，所以变参自定义函数里写 `foreach($(x...), item -> $(item)*2)` 就能遍历自己那个拆不开的变参
- 整份列表会被**摊开**进被遍历的列表：`$(x...)` 在 `x = [1, 2, 3]` 时贡献三个值
- 名字没绑定成列表时点名报错：`$(typo...)` 抛出 `IllegalArgumentException: $(typo...) is not bound to a list`，而不是静默当成空列表返回 0
- lambda 一次只喂一个值，因此形参列表以变参开头的 lambda 会被拒绝（`IllegalArgumentException`）
- 末位不是 lambda 时抛 `IllegalArgumentException: forEach expects a lambda as its last argument but got <实参>`
- 这些规则都在**求值期**执行：解析器与回写器对 `foreach` 没有任何特殊处理，`foreach` 的形参声明 `["x...", "function"]` 只保证个数校验一致

### 调用

```java
// 构造调用节点，参数个数不合法时抛出 IllegalArgumentException
FunctionExpression call = LibBuiltInFunctions.SQRT.call(IExpression.of(9.0));

// 需要自己处理错误时用 DataResult 版本
DataResult<FunctionExpression> result = LibBuiltInFunctions.POW.callChecked(List.of(
    IExpression.of(2.0),
    IExpression.of(3.0)
));
```

| 方法                                 | 参数个数不合法时                    |
|------------------------------------|-----------------------------|
| `call(IExpression...)`             | 抛出 `IllegalArgumentException` |
| `call(List<IExpression>)`          | 抛出 `IllegalArgumentException` |
| `callChecked(List<IExpression>)`   | 返回 `DataResult.error`，消息前缀是 `Function <名字> ` |

个数校验走 `Parameters.checkArity(List<IExpression>)`，与解析同一套规则：`$(x...)` 只能落在变参形参位上，没有变参形参的内建函数（例如 `sqrt`）在这里就把 `$(x...)` 拦下，而不是构造出一个到求值期才炸的调用。

`LibBuiltInFunctions` 自带的类型是 `anvillib:builtin`，JSON 里靠 `builtin` 字段区分具体函数：

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

## 通用类型

非内置函数的类型由 `LibFunctionTypes` 注册（命名空间 `anvillib`）：

| 字段          | 注册名                  | 对应实现               | JSON 字段                |
|-------------|----------------------|--------------------|------------------------|
| `INPUT`     | `anvillib:input`     | `InputFunction`    | `index`（非负整数）          |
| `NAMED`     | `anvillib:named`     | `NamedFunction`    | `name`                 |
| `CONSTANT`  | `anvillib:constant`  | `ConstantFunction` | `value`                |
| `CUSTOM`    | `anvillib:custom`    | `CustomFunction`   | `parameters`、`body`     |
| `LAMBDA`    | `anvillib:lambda`    | `LambdaFunction`   | `parameters`、`body`     |

```java
public static final DeferredHolder<IFunction.Type<?>, InputFunction.Type> INPUT = DF
    .register("input", InputFunction.Type::new);
// ... NAMED / CONSTANT / CUSTOM / LAMBDA
public static void register(IEventBus bus) { DF.register(bus); }
```

每种类型都实现 `IFunction.Type<F>`（`codec()` + `streamCodec()` + `getSerializedName()`）。下游要加一种全新类型时按同一模式注册自己的 `Type`，见[自定义函数](./custom-function#自定义函数类型)。

### InputFunction

按下标引用求值时的传入值，JSON 字段为 `index`，要求非负整数；越界时取 0。表达式里的 `x` / `y` / `z` 就是 `index` 为 0 / 1 / 2 的零参调用，`x3` 是 `index` 为 3 的零参调用。

```json
{ "type": "anvillib:input", "index": 0 }
```

```java
IExpression x = InputFunction.call(0);        // x
IExpression third = InputFunction.call(3);    // x3
```

### NamedFunction

按名字引用求值时的传入值，`record NamedFunction(String name)`，JSON 字段为 `name`。未绑定时取 0，绑到列表上时取列表里的最大值。

```json
{ "type": "anvillib:named", "name": "cost" }
```

```java
// 零参调用：$(name)
FunctionExpression call = NamedFunction.call("cost");
```

flat 文本里的 `$(name)` 解析出的是引用节点 `IExpression.Reference.Named`（用 `IExpression.ref("cost")` 构造），`$(name...)` 则是 `IExpression.Reference.Spread`，都不是这里的零参调用——区别在于引用节点的取值只按名字绑定走，而 `NamedFunction` 是普通函数调用（见[表达式 API](./expression#iexpression)）。

### ConstantFunction

不接收参数，求值恒为固定数字，JSON 字段为 `value`。表达式树里的字面量数字就是它的零参调用。

```json
{ "type": "anvillib:constant", "value": 2 }
```

```java
// 这两种写法等价
IExpression a = IExpression.of(2.0);
IExpression b = ConstantFunction.of(2).call();

// 判断一个调用是不是常量，并取出常量值
Optional<Double> value = ConstantFunction.value(someCall);
```

`ConstantFunction.CODEC` 的类型就是 `Codec<Double>`，因此常量在表达式里的内联形式直接是一个数字；`value(FunctionExpression)` 只在「零实参 + 唯一实参是 `ConstantFunction`」时返回 `Optional.of(...)`，编码时正是靠它决定要不要写数字。

### CustomFunction

`record CustomFunction(Parameters parameters, IExpression body)`，JSON 字段为 `parameters` 与 `body`。求值时实参在调用点上下文里求值，函数体在形参绑定后的上下文里求值，因此函数体既能读到形参、也能读到调用点的名字。见[自定义函数](./custom-function)。

```java
CustomFunction.of(List.of("a", "x..."), body);   // 按声明文本，"x..." 是变参
CustomFunction.named(List.of("a", "b"), body);   // 按形参名，全部当作固定形参
```

### LambdaFunction

lambda 也是函数类型：`record LambdaFunction(Parameters parameters, IExpression body)`，注册名 `anvillib:lambda`，JSON 字段同样是 `parameters` 与 `body`，flat 文本里写成 `x -> $(x)*2`。

```java
LambdaFunction.of(List.of("x"), body);        // 按声明文本，"x..." 结尾的是变参
LambdaFunction.named(List.of("x"), body);     // 按形参名，全部当作固定形参
LambdaFunction.call("x", body);               // 单形参 lambda 的一次调用
```

```json
{
  "type": "anvillib:lambda",
  "parameters": ["x"],
  "body": "$(x)*2"
}
```

lambda 是**闭包**：函数体沿用求值处的传入值，形参绑定只覆盖同名的传入值。它只能作为实参传给别的函数（例如内置的 `foreach`），自己单独求值没有实参可绑。零形参 lambda（`parameters: []`）在对象形式里合法，但写不成 flat 文本——文本里的空参数串会被读成「缺参数名」，因此只能退回对象形式。

## 代码里使用函数

`anvillib:function` 是**数据包注册表**，不能由代码注册：NeoForge 的 `RegisterEvent` 只为 `BuiltInRegistries` 里的注册表触发（`GameData.postRegisterEvents` 遍历的就是那批），数据包注册表不在其中，因此 `DeferredRegister.create(LibRegistries.FUNCTION_KEY, …)` 的条目永远不会被注册，直到 `DeferredHolder.get()` 时才抛未解析的异常。代码侧有两种用法：

**一、把函数写成模组资源里的数据包 JSON**，模组 jar 的 `data/` 目录本身就是一份数据包：

```json
// src/main/resources/data/mymod/anvillib/function/double.json
{ "type": "anvillib:custom", "parameters": ["value"], "body": "$(value)*2" }
```

**二、直接构造内联调用**，不经过注册表，函数定义随表达式一起序列化：

```java
// 自定义函数的内联定义
FunctionExpression call = FunctionExpression.of(
    CustomFunction.of(List.of("value"), NamedFunction.call("value")),
    IExpression.of(2.0)
);

// 现成的实现同样可以内联
FunctionExpression sqrt = LibBuiltInFunctions.SQRT.call(IExpression.of(9.0));
```

- 内联定义是 `Holder.direct`，注册表条目是 `Holder.Reference`，两者在对象形式里的写法不同（`{"function": {…}}` 与 `{"function": "命名空间:名字"}`），见[内联与编解码](./inline-expression#对象形式)
- 内联定义**取不到注册名**，因此整棵表达式写不出 flat 文本，只能退回对象形式；想让表达式能用 `double(x)` 这样的文本表达，就得走数据包 JSON
- 数据包 JSON 放在哪个命名空间决定引用方式：放在 `data/anvillib/anvillib/function/` 下可以用裸名 `double(x)`，放在自己的模组命名空间下必须写全名（`mymod:double(x)`）
- 名字里含大写字母的条目在 flat 文本里**引用不到**（解析时名字先被转成小写），但对象形式的引用仍然可用

自定义 `IFunction` 实现与自定义函数类型的完整写法见[自定义函数](./custom-function)。
