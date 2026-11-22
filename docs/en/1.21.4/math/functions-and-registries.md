# Function System, Built-ins & Dual Registries (`function` / `init`)

<BranchContextCard branch="1.21.4" />

In `module.math`, whether an expression is a constant (`3.14`), input variable (`x`), arithmetic operator (`+`, `-`, `*`, `/`), or datapack custom formula, it is uniformly represented at the low level as an object implementing **`IFunction`**.

This page covers the 5 implementations of `IFunction`, the parameter descriptor `Parameters`, the 29 built-in math functions and constants (`LibBuiltInFunctions`), and the dual-registry mechanism (`LibRegistries`).

---

## 1. Dual-Registry Architecture & Namespace Conventions (`LibRegistries`)

`module.math` maintains two registries under the **`anvillib` main namespace**:

| Registry Key (`ResourceKey`) | Registry Nature | Entry Type | Registration & Notes |
| :--- | :--- | :--- | :--- |
| **`LibRegistries.FUNCTION_TYPE_KEY`**<br>(`anvillib:function_type`) | Static synced registry (`LibRegistries.FUNCTION_TYPE`) | `IFunction.Type<?>` | Determines JSON/network serialization dispatch type of `IFunction`. Register new `IFunction.Type`s in code via `DeferredRegister.create(LibRegistries.FUNCTION_TYPE, modId)`. |
| **`LibRegistries.FUNCTION_KEY`**<br>(`anvillib:function`) | **Datapack Registry** | `IFunction` | Stores concrete functions referenced by name in expressions (JSON path: `data/<namespace>/anvillib/function/<path>.json`).<br>**Critical Pitfall**: because this is a **Datapack Registry**, `RegisterEvent` never fires for it—**never register `IFunction` in code with `DeferredRegister`**! Provide them via datapack JSON (or DataGen `DatapackBuiltinEntriesProvider`), or wrap inline in code via `Holder.direct(function)`. |

> **Flat Expression Short-Name Resolution**:
> In Flat formula strings (such as `"sin(x) + my_func(y)"`), unqualified function/variable names default to **`anvillib:<name>`**. If you register a custom function under `data/my_mod/anvillib/function/foo.json`, reference it in Flat formulas as `"my_mod:foo(x)"`.

---

## 2. Overview of the 29 Built-in Functions, Operators & Variables (`LibBuiltInFunctions`)

`LibBuiltInFunctions` presets all common math operators, constants, and standard input variables under `anvillib` (also accessible in code as static `Holder<IFunction>` constants like `LibBuiltInFunctions.ADD`, `LibBuiltInFunctions.SIN`):

| Category | Built-in Function ID (`anvillib:<name>`) | Parameter Signature (`Parameters`) | Math Semantics |
| :--- | :--- | :--- | :--- |
| **Basic Operators** | `add` (`+`), `subtract` (`-`), `multiply` (`*`), `divide` (`/`), `modulo` (`%`), `power` (`^`), `negate` (unary `-`) | Binary `(x, y)`; `negate` is unary `(x)` | Arithmetic, modulo (`x % y`), exponentiation (`Math.pow(x, y)`), and negation (`-x`). |
| **Math Constants** | `pi`, `e` | Zero-arg `()` | $\pi$ (`Math.PI`) and Euler's number $e$ (`Math.E`). Write `pi` or `e` directly in formulas. |
| **Preset Input Variables** | `x`, `y`, `z`, `w` | Zero-arg `()` (`requireInput = true`) | Four ready-to-use `InputFunction` variables; writing `x`, `y`, `z`, `w` reads the corresponding values from `Arguments`. |
| **Rounding & Sign** | `abs(x)`, `sign(x)`, `floor(x)`, `ceil(x)`, `round(x)` | Unary `(x)` | Absolute value, signum (`Math.signum`), floor, ceiling, round. |
| **Trig & Inverse Trig** | `sin(x)`, `cos(x)`, `tan(x)`, `asin(x)`, `acos(x)`, `atan(x)`, `atan2(y, x)` | Unary `(x)`; `atan2` is binary `(y, x)` | Radian trig functions and two-argument arctangent `Math.atan2(y, x)`. |
| **Hyperbolic** | `sinh(x)`, `cosh(x)`, `tanh(x)` | Unary `(x)` | Hyperbolic sine, cosine, and tangent. |
| **Exponential & Log** | `sqrt(x)`, `cbrt(x)`, `exp(x)`, `ln(x)`, `log10(x)`, `log(base, x)` | Unary `(x)`; `log` is binary `(base, x)` | Square root, cube root, $e^x$, natural log $\ln(x)$, base-10 log $\log_{10}(x)$, and arbitrary-base log $\frac{\ln(x)}{\ln(\text{base})}$. |
| **Extrema, Clamp & Lerp** | • `min(x0, x1, ...)` (variadic, at least 1)<br>• `max(x0, x1, ...)` (variadic, at least 1)<br>• `clamp(x, min, max)` (3 args)<br>• `lerp(a, b, t)` (3 args) | Variadic or ternary `(a, b, t)` | Variadic min, variadic max, `Math.clamp(x, min, max)`, and linear interpolation `Mth.lerp(t, a, b)` (note: 3rd arg `t` is the interpolation factor). |

---

## 3. Defining Custom Functions in Datapacks (`CustomFunction` / `InputFunction`)

Modders and modpack authors can define new **composite functions (`anvillib:custom`)** or **named input variables (`anvillib:input`)** via JSON in `data/<namespace>/anvillib/function/<name>.json`:

### Example 1: Defining a Composite Function `data/my_mod/anvillib/function/logistic_curve.json`

`CustomFunction` declares a formal parameter name list `params` (e.g., `["level", "midpoint", "steepness"]`) and an inner expression `body`, where parameter names can be used directly as variables:

```json
{
  "type": "anvillib:custom",
  "id": "my_mod:logistic_curve",
  "params": ["level", "midpoint", "steepness"],
  "body": "1 / (1 + exp(-steepness * (level - midpoint)))"
}
```

Once defined, any other formula can call `"100 * my_mod:logistic_curve(x, 10, 0.5)"`.

### Example 2: Defining a New Global Input Variable `data/my_mod/anvillib/function/pollution.json`

If your formulas need an environmental parameter named `"pollution"` beyond built-in `x, y, z, w`, add an `anvillib:input` JSON in the datapack:

```json
{
  "type": "anvillib:input",
  "name": "pollution"
}
```

---

## 4. `IFunction` System & `Parameters` API Reference

### 1. `IFunction` Interface & 5 Implementations (`dev.anvilcraft.lib.v2.math.expression.function`)

| Class / Interface | Registered Type (`LibFunctionTypes`) | Key Constructors & Method Signatures | Description |
| :--- | :--- | :--- | :--- |
| **`IFunction`** | — | • `Codec<IFunction> DIRECT_CODEC`<br>• `Codec<Holder<IFunction>> CODEC`<br>• `StreamCodec<RegistryFriendlyByteBuf, Holder<IFunction>> STREAM_CODEC`<br>• `static IFunction.Type<? extends IFunction> typeOf(ResourceKey<IFunction.Type<?>> key)` (uses `LibRegistries.FUNCTION_TYPE.getOrThrow(key).value()`)<br>• `double eval(double[] resolvedArgs, Arguments inputs)`<br>• `Parameters expectedParams()`<br>• `default boolean requireInput()` (default `false`)<br>• `Type<?> type()` | Top-level function interface. |
| **`ConstantFunction`** | `anvillib:constant` | `public record ConstantFunction(double value)` | Constant function: zero-arg, always returns `value`. |
| **`InputFunction`** | `anvillib:input` | `public record InputFunction(String name)` | Input variable function: zero-arg, `requireInput()` is `true`, reads `inputs.get(name)`. |
| **`CustomFunction`** | `anvillib:custom` | `public record CustomFunction(ResourceLocation id, Parameters expectedParams, IExpression body)` | Data-driven composite function: binds `resolvedArgs` to `expectedParams` names in a local `Arguments` and evaluates `body.eval(localInputs)`. |
| **`NamedFunction`** | `anvillib:named` | `public static NamedFunction of(ResourceLocation id, Parameters params, ToDoubleFunction<double[]> impl)` | Built-in pure math function implementation (serialized by registry ID; only allowed for built-in operators in `LibBuiltInFunctions`). |
| **`LambdaFunction`** | *Not serializable* | `public record LambdaFunction(Parameters expectedParams, ToDoubleFunction<double[]> impl)` | In-memory ephemeral Lambda function: calling its `CODEC` or `STREAM_CODEC` errors; for local code evaluation only. |

### 2. `Parameter` & `Parameters` (Parameter Signature Descriptor)

| Class | Constants / Static Factories / Method Signatures | Description |
| :--- | :--- | :--- |
| `Parameter` | `public record Parameter(String name)` | Single formal parameter name record (must not be blank). |
| `Parameters` | • `public static final Parameters EMPTY`<br>• `public static Parameters of(String... names)` (fixed arity, no duplicates)<br>• `public static Parameters varargs(String prefix, int minCount)` (variadic, at least `minCount` args)<br>• `public boolean acceptsCount(int count)`<br>• `public void validateCount(int count)` (throws `IllegalArgumentException` on mismatch)<br>• `public String nameAt(int index)` | Describes expected argument count (fixed or variadic) and parameter names at each position. |
