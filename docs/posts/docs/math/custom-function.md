---
title: Math 自定义函数
prev: false
next: false
---

# 自定义函数

表达式按名引用的函数存放在 `anvillib:function` 数据包注册表里，下游模组把 JSON 放进自己的数据包（模组 jar 的 `data/` 目录就是一份数据包）即可；代码里要用函数时直接构造内联调用。需要一种全新的编解码形式时，再往 `anvillib:function_type` 注册自己的函数类型。

## 数据包 JSON

条目路径遵循原版约定：`anvillib:function` 下的 `triple` 对应 `data/<命名空间>/anvillib/function/triple.json`。

### 表达式函数

最常用的形式是用 `anvillib:custom` 声明若干参数，并用一段表达式作为函数体。函数体里用 `$(参数名)` 引用参数。

```json
{
  "type": "anvillib:custom",
  "parameters": ["value"],
  "body": "$(value)*3"
}
```

调用时各参数按声明顺序绑定到实参的求值结果，因此调用点不必再提供同名的传入值：

```java
IExpression triple = FlatExpressionParser.parseValue("triple(x)", functions);
triple.evaluate(4); // 12.0
```

| 字段           | 类型                | 说明                          |
|--------------|-------------------|-----------------------------|
| `type`       | `String`          | 函数类型，表达式函数固定为 `anvillib:custom` |
| `parameters` | `List<String>`    | 参数名，按声明顺序绑定实参，不可重复、不能是空名字、必须是标识符（字母或下划线开头，其余是字母、数字、下划线）；以 `...` 结尾的是变参 |
| `body`       | `IExpression`     | 函数体，可以是数字、flat 文本或对象形式       |

实参个数必须落在形参声明允许的范围内：flat 文本里调用时**解析期**就报错，直接用对象形式调用（`FunctionExpression.of(...)`）时在绑定阶段抛 `IllegalArgumentException`（例如 `Expected 2 to 3 arguments but got 1`）。

`body` 的类型就是 `IExpression.CODEC`，因此函数体也能写成嵌套的对象形式：

```json
{
  "type": "anvillib:custom",
  "parameters": ["value"],
  "body": {
    "function": { "type": "anvillib:builtin", "builtin": "pow" },
    "arguments": ["$(value)", 2]
  }
}
```

函数体里写 `$(value)` 而不是 `value`：前者是按名字绑定取值，后者是 `InputFunction(0)`，取的是调用点第 0 个传入值，跟形参无关。

### 变参形参

形参名以 `...` 结尾就是变参，写成 `"parameters": ["a", "x..."]`，`...` 是名字的后缀。

- 一个签名里**最多一个**变参
- 变参可以出现在**任意位置**，不限于末位；它前后的固定形参各占原来的位置，变参吃下剩下的实参
- 变参是 Java 那样的变参：**下限是 0**，一个实参都不给也合法（`min()` 合法、返回 0），上限不限。`"x...": []` 就是一次正常的空调用
- 下限为 0 只针对变参；固定形参一个都不能少，所以 `(x..., last)` 的下限是 1

函数体里取变参有两种写法：

| 写法        | 含义                                    |
|-----------|---------------------------------------|
| `$(x)`    | 取单个数字；`x` 绑到变参上时得到列表里的**最大值**         |
| `$(x...)` | 取**整份列表**本身                           |

`$(x...)` 不是数字，只能传给变参形参位置，用在需要单个数字的地方会在求值期报错。整份列表传给变参位置时会被**摊开**：`min($(x...), 4)` 在 `x = [9, 2, 7]` 时就是 `min(9, 2, 7, 4)`。

配位按**实参个数**算：变参形参先把它后面每个固定形参的位子留出来，剩下的才归它，`$(name...)` 再从变参位开始摊开占用若干位。变参不在末位时，实参序号与形参序号本来就对不上，所以判定的依据是「这个实参实际喂给了哪个形参」，不是形参序号：`(x..., last)` 用 `($(xs...), 1)` 调用时 `$(xs...)` 正好落进变参位，可以正常求值。

空列表摊开成**零**个，因此不占实参位：`(x..., last)` 用 `($(xs...), 1)` 调用、`xs = []` 时 `last` 照样拿到那个 `1`，变参是空的。反过来，列表摊出来的个数超过变参位能吃下的数时，报的是带个数的异常而不是下标越界：`(x..., last)` 用 `($(xs...), 1)` 调用、`xs = [5, 6]` 时变参只剩一个位子，抛 `Spread[name=xs] provides 2 arguments but this position takes 1`。

名字没绑定成列表时同样点名报错，而不是悄悄当成空列表：`min($(typo...))` 抛 `IllegalArgumentException: $(typo...) is not bound to a list`。

自定义函数**自己拆不开**变参：函数体里除了把 `$(x...)` 转交给 `min`、`max`、`foreach` 这类变参函数，没有别的遍历办法。`foreach($(x...), item -> $(item)*2)` 会把整个变参列表逐个交给 lambda。

```json
{
  "type": "anvillib:custom",
  "parameters": ["a", "x..."],
  "body": "min($(x...))"
}
```

调用 `f(9, 5, 2, 7)` 时 `a` 是 9、`x` 是 `[5, 2, 7]`，结果是 2；若函数体写成 `$(x)` 则得到 7（列表里的最大值）。

```java
// 代码里的对应构造：of 按声明文本解析，"x..." 是变参；named 按形参名创建，全部当作固定形参
CustomFunction.of(List.of("a", "x..."), body);
CustomFunction.named(List.of("a", "b"), body);
```

lambda 用同一套形参声明：`LambdaFunction.of(List<String>, IExpression)` 按声明文本创建，`LambdaFunction.named(List<String>, IExpression)` 按形参名创建，单形参的一次调用用 `LambdaFunction.call(String, IExpression)`；它注册在 `anvillib:lambda` 类型下。

函数体可以引用数据包注册表里的函数，包括它自己：自引用与互相引用会在求值期被调用深度上限拦下（`MAX_CALL_DEPTH = 64`），而不是栈溢出，见[函数体系](./function#调用深度守卫)。

### 其它函数类型

注册表条目也可以是常量、传入值引用等内联形式，只要它符合 `IFunction.DIRECT_CODEC`：

```json
{ "type": "anvillib:constant", "value": 3 }
```

这样 `pi` 之类的名字就能直接写进表达式文本。同理可以放 `anvillib:input`、`anvillib:named`、`anvillib:lambda`，甚至把 `builtin` 挂到一个名字上：

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

### 数据包函数与内置函数重名

名字解析的顺序取决于命名空间（见 [flat 表达式语法](./flat-syntax#函数名与命名空间)）：

- 注册在 `anvillib` 命名空间下、且与内置函数同名（如 `anvillib:sqrt`）：文本里 `sqrt(x)` **永远**是内置函数，这份数据包条目引用不到
- 注册在其它命名空间下、且与内置函数同名（如 `mymod:sqrt`）：`mymod:sqrt(x)` 用注册表里的那份，裸名 `sqrt(x)` 用内置函数

## 在模组里提供函数

`anvillib:function` 是数据包注册表，**不能由代码注册**：`RegisterEvent` 只为 `BuiltInRegistries` 里的注册表触发，`DeferredRegister` 的条目在这里永远不会被注册。想提供按名引用的函数，就把 JSON 放进模组资源——模组 jar 里的 `data/` 目录本身就是一份数据包：

```
src/main/resources/data/mymod/anvillib/function/double.json
```

```json
{ "type": "anvillib:custom", "parameters": ["value"], "body": "$(value)*2" }
```

- 放在 `data/<自己的模组命名空间>/anvillib/function/` 下时，表达式里要写全名（`mymod:double(x)`）；想用裸名就得放在共用的 `anvillib` 命名空间下（`data/anvillib/anvillib/function/`）
- 条目必须是可 JSON 编解码的 `IFunction`：自定义实现要提供 `Type.codec()`，否则数据包加载时会缺字段
- 这份 JSON 会随数据包一起同步到客户端，因此 `/reload` 与进服都能生效

代码里不需要按名引用时，直接构造内联调用即可，不必写数据包：

```java
FunctionExpression call = FunctionExpression.of(
    CustomFunction.of(List.of("value"), NamedFunction.call("value")),
    IExpression.of(2.0)
);
```

内联定义（`Holder.direct`）随表达式一起序列化，但**取不到注册名**，整棵树写不出 flat 文本，只能走对象形式；要按名引用、要能用文本表达，仍然得走数据包 JSON。

## 自定义函数类型

需要一种全新的编解码形式时，实现 `IFunction` 与它的 `Type`，再把 `Type` 注册进 `anvillib:function_type`：

```java
public record MyFunction() implements IFunction {
    public static final MapCodec<MyFunction> MAP_CODEC = MapCodec.unit(MyFunction::new);
    public static final StreamCodec<RegistryFriendlyByteBuf, MyFunction> STREAM_CODEC =
        StreamCodec.unit(new MyFunction());
    private static final Parameters PARAMETERS = Parameters.of(List.of("value"));

    @Override
    public Parameters parameters() {
        return MyFunction.PARAMETERS;
    }

    @Override
    public double apply(Call call) {
        return call.valueAt(0) * 2;
    }

    @Override
    public IFunction.Type<? extends IFunction> type() {
        return MyFunctionTypes.DOUBLE.get();
    }

    public static class Type implements IFunction.Type<MyFunction> {
        @Override
        public MapCodec<MyFunction> codec() {
            return MyFunction.MAP_CODEC;
        }

        @Override
        public StreamCodec<RegistryFriendlyByteBuf, MyFunction> streamCodec() {
            return MyFunction.STREAM_CODEC;
        }

        @Override
        public String getSerializedName() {
            return "double";
        }
    }
}
```

- 用 `apply(Call)` 时要同时重写 `parameters()` 声明形参，否则实参个数会按默认的 `Parameters.EMPTY` 校验，`double(x)` 会因个数不符报错
- `Call.valueAt(int)` 取的是各形参绑到的数字（变参位是列表里的最大值）；要整份变参列表就用 `call.bound().list("x")`
- 只关心「每个形参绑到一个数」时可以改重写 `applyBound(List<Double> arguments, Arguments bound)`；要自己控制实参求值时机，就重写 `apply(List<IExpression> arguments, Arguments inputs)`，它拿到的是**未求值**的实参表达式
- 函数体会递归调用自己（或与别的函数互相引用）时，求值要走 `guarded(...)`，否则会以 `StackOverflowError` 收场；`CustomFunction` 与 `LambdaFunction` 已经这么做了
- `Type` 必须同时给出 `codec()`、`streamCodec()` 与 `getSerializedName()`（`ISerializer` + `StringRepresentable`），网络包与数据包两侧都靠它们

注册类型时把 `DeferredRegister` 指向 `LibRegistries.FUNCTION_TYPE`，命名空间用自己模组的即可：

```java
private static final DeferredRegister<IFunction.Type<?>> TYPES = DeferredRegister.create(
    LibRegistries.FUNCTION_TYPE,
    MyMod.MOD_ID
);

public static final DeferredHolder<IFunction.Type<?>, MyFunction.Type> DOUBLE =
    MyFunctionTypes.TYPES.register("double", MyFunction.Type::new);
```

`anvillib:function_type` 是**同步注册表**（`RegistryBuilder.sync(true)`），类型必须在客户端与服务端都注册，否则对方解不出网络包；类型名就是 JSON 里的 `type` 字段，之后就能在新类型下写数据包条目：

```json
{ "type": "mymod:double" }
```

## 与 flat 文本的关系

- 解析文本时，不带命名空间的名字补成 `anvillib`，因此**想用短名引用的函数要放进 `anvillib` 命名空间**（`data/anvillib/anvillib/function/`）；放在自己模组命名空间下的函数必须写全名（如 `mymod:double(x)`）
- 名字在解析前会转成小写，注册路径里含大写字母的条目引用不到
- 变量优先于函数：叫 `x`、`y`、`z`、`x0` 的函数无法从文本里引用（回写时也会退回对象形式）
- 带命名空间的名字先查数据包注册表、再按路径回退到同名内置函数，因此 `mymod:sqrt(x)` 在没注册 `mymod:sqrt` 时等价于 `sqrt(x)`
- 回写文本时，函数必须能从注册表里取到名字（即注册表引用而非内联定义），否则整个表达式退回对象形式
