# 函数体系、内置函数与双注册表 (`function` / `init`)

<BranchContextCard branch="1.21.1" />

在 `module.math` 中，无论是常数（`3.14`）、输入变量（`x`）、加减乘除运算符（`+`、`-`、`*`、`/`），还是数据包作者自定义的复合公式，在底层全部统一为实现了 **`IFunction`** 接口的函数对象。

本篇详解 `IFunction` 的 5 种实现类、形参列表描述器 `Parameters`、内置的 29 个数学函数与常量（`LibBuiltInFunctions`）以及双注册表机制（`LibRegistries`）。

---

## 一、 双注册表架构与命名空间约定 (`LibRegistries`)

`module.math` 维护了两个挂载在 **`anvillib` 主命名空间**下的注册表：

| 注册表键 (`ResourceKey`) | 注册表性质 | 条目类型 | 注册方式与注意事项 |
| :--- | :--- | :--- | :--- |
| **`LibRegistries.FUNCTION_TYPE_KEY`**<br>(`anvillib:function_type`) | 静态同步注册表 (`LibRegistries.FUNCTION_TYPE`) | `IFunction.Type<?>` | 决定 `IFunction` 的 JSON/网络序列化分发类型。可通过 `DeferredRegister.create(LibRegistries.FUNCTION_TYPE, modId)` 在代码中注册新的 `IFunction.Type`。 |
| **`LibRegistries.FUNCTION_KEY`**<br>(`anvillib:function`) | **数据包注册表 (DataPack Registry)** | `IFunction` | 存储可被表达式按名称引用的具体函数（JSON 路径：`data/<namespace>/anvillib/function/<path>.json`）。<br>**重要避坑**：因为这是**数据包注册表**，`RegisterEvent` 不会为它触发，**严禁使用 `DeferredRegister` 在代码里注册 `IFunction`**！应通过数据包 JSON（或 DataGen 的 `DatapackBuiltinEntriesProvider`）提供，或在代码中直接用 `Holder.direct(function)` 创建内联引用。 |

> **Flat 表达式短名解析约定**：
> 在写 Flat 公式字符串（如 `"sin(x) + my_func(y)"`）时，不带命名空间前缀的函数名/变量名一律自动补全为 **`anvillib:<name>`**。如果你在自己的模组命名空间 `data/my_mod/anvillib/function/foo.json` 下注册了自定义函数，在 Flat 公式中请使用全名 `"my_mod:foo(x)"`（或者将其注册在 `data/anvillib/anvillib/function/` 下以支持短名调用，但需注意避免与其他模组重名）。

---

## 二、 内置的 29 个函数、运算符与变量一览 (`LibBuiltInFunctions`)

`LibBuiltInFunctions` 在 `anvillib` 命名空间下预置了以下所有常用数学算子、常量与标准输入变量（在代码中也可直接引用 `LibBuiltInFunctions.ADD`、`LibBuiltInFunctions.SIN` 等静态 `Holder<IFunction>` 常量）：

| 类别 | 内置函数 ID (`anvillib:<name>`) | 参数签名 (`Parameters`) | 数学语义说明 |
| :--- | :--- | :--- | :--- |
| **基础运算符** | `add` (`+`)、`subtract` (`-`)、`multiply` (`*`)、`divide` (`/`)、`modulo` (`%`)、`power` (`^`)、`negate` (一元 `-`) | 二元 `(x, y)`；`negate` 为一元 `(x)` | 四则运算、取模（`x % y`）、乘方（`Math.pow(x, y)`）与取反（`-x`）。 |
| **数学常数** | `pi`、`e` | 无参 `()` | 圆周率 $\pi$（`Math.PI`）与自然常数 $e$（`Math.E`）。在公式中可直接写 `pi` 或 `e`。 |
| **预设输入变量** | `x`、`y`、`z`、`w` | 无参 `()`（`requireInput = true`） | 4 个开箱即用的标准 `InputFunction` 变量，公式中直接写 `x`、`y`、`z`、`w` 即可从 `Arguments` 读取对应值。 |
| **取整与符号** | `abs(x)`、`sign(x)`、`floor(x)`、`ceil(x)`、`round(x)` | 一元 `(x)` | 绝对值、符号函数（`Math.signum`）、向下取整、向上取整、四舍五入。 |
| **三角与反三角** | `sin(x)`、`cos(x)`、`tan(x)`、`asin(x)`、`acos(x)`、`atan(x)`、`atan2(y, x)` | 一元 `(x)`；`atan2` 为二元 `(y, x)` | 弧度制三角函数与双参反正切 `Math.atan2(y, x)`。 |
| **双曲函数** | `sinh(x)`、`cosh(x)`、`tanh(x)` | 一元 `(x)` | 双曲正弦、双曲余弦、双曲正切。 |
| **指数与对数** | `sqrt(x)`、`cbrt(x)`、`exp(x)`、`ln(x)`、`log10(x)`、`log(base, x)` | 一元 `(x)`；`log` 为二元 `(base, x)` | 平方根、立方根、$e^x$、自然对数 $\ln(x)$、常用对数 $\log_{10}(x)$ 及任意底对数 $\frac{\ln(x)}{\ln(\text{base})}$。 |
| **极值、钳制与插值** | • `min(x0, x1, ...)`（变参，至少 1 个）<br>• `max(x0, x1, ...)`（变参，至少 1 个）<br>• `clamp(x, min, max)`（3 参）<br>• `lerp(a, b, t)`（3 参） | 变参或三元 `(a, b, t)` | 变参最小值、变参最大值、区间钳制 `Math.clamp(x, min, max)` 与线性插值 `Mth.lerp(t, a, b)`（注意 `lerp` 第 3 个参数 `t` 为插值系数）。 |

---

## 三、 在数据包中定义自定义函数 (`CustomFunction` / `InputFunction`)

下游模组或整合包作者可以在数据包 `data/<namespace>/anvillib/function/<name>.json` 中通过 JSON 定义新的**复合函数（`anvillib:custom`）**或**新的命名输入变量（`anvillib:input`）**！

### 示例 1：定义复合函数 `data/my_mod/anvillib/function/ logistic_curve.json`

`CustomFunction` 允许声明自己的形参名列表 `params`（如 `["level", "midpoint", "steepness"]`）和一个内部表达式 `body`。在 `body` 中可以直接把形参名当作变量使用：

```json
{
  "type": "anvillib:custom",
  "id": "my_mod:logistic_curve",
  "params": ["level", "midpoint", "steepness"],
  "body": "1 / (1 + exp(-steepness * (level - midpoint)))"
}
```

定义后，任何其他公式中都可以直接调用 `"100 * my_mod:logistic_curve(x, 10, 0.5)"`！

### 示例 2：定义新的全局输入变量 `data/my_mod/anvillib/function/pollution.json`

如果除了内置的 `x, y, z, w` 之外，你的公式还需要读取名为 `"pollution"` 的环境参数，只需在数据包中添加一个 `anvillib:input` 类型的 JSON：

```json
{
  "type": "anvillib:input",
  "name": "pollution"
}
```

---

## 四、 `IFunction` 体系与 `Parameters` API 详解

### 1. `IFunction` 接口与 5 种实现类 (`dev.anvilcraft.lib.v2.math.expression.function`)

| 类 / 接口名 | 注册类型 (`LibFunctionTypes`) | 关键构造器与方法签名 | 说明 |
| :--- | :--- | :--- | :--- |
| **`IFunction`** | — | • `Codec<IFunction> DIRECT_CODEC`<br>• `Codec<Holder<IFunction>> CODEC`<br>• `StreamCodec<RegistryFriendlyByteBuf, Holder<IFunction>> STREAM_CODEC`<br>• `double eval(double[] resolvedArgs, Arguments inputs)`<br>• `Parameters expectedParams()`<br>• `default boolean requireInput()`（默认 `false`）<br>• `Type<?> type()` | 函数顶层接口。 |
| **`ConstantFunction`** | `anvillib:constant` | `public record ConstantFunction(double value)` | 常数函数：无参，始终返回 `value`。 |
| **`InputFunction`** | `anvillib:input` | `public record InputFunction(String name)` | 输入变量函数：无参，`requireInput()` 为 `true`，调用 `inputs.get(name)` 取值。 |
| **`CustomFunction`** | `anvillib:custom` | `public record CustomFunction(ResourceLocation id, Parameters expectedParams, IExpression body)` | 数据驱动复合函数：求值时将 `resolvedArgs` 按 `expectedParams` 的形参名绑定到局部 `Arguments` 中，再递归计算 `body.eval(localInputs)`。 |
| **`NamedFunction`** | `anvillib:named` | `public static NamedFunction of(ResourceLocation id, Parameters params, ToDoubleFunction<double[]> impl)` | 内置纯数学函数实现（按注册表 ID 序列化，仅允许绑定在 `LibBuiltInFunctions` 中的内置算子）。 |
| **`LambdaFunction`** | *不支持序列化* | `public record LambdaFunction(Parameters expectedParams, ToDoubleFunction<double[]> impl)` | 纯内存临时 Lambda 函数：调用其 `CODEC` 或 `STREAM_CODEC` 会报错，仅用于纯本地代码临时求值。 |

### 2. `Parameter` 与 `Parameters`（形参签名描述）

| 类名 | 常量 / 静态工厂 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| `Parameter` | `public record Parameter(String name)` | 单个形参名记录（名称不得为空白字符串）。 |
| `Parameters` | • `public static final Parameters EMPTY`<br>• `public static Parameters of(String... names)`（ 고정参数个数，禁止重名）<br>• `public static Parameters varargs(String prefix, int minCount)`（变参，最少 `minCount` 个参数）<br>• `public boolean acceptsCount(int count)`<br>• `public void validateCount(int count)`（不匹配时抛 `IllegalArgumentException`）<br>• `public String nameAt(int index)` | 描述函数期望的参数个数（固定或变长）与各位置形参名称。 |
