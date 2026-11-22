# Math Expression Model, Flat Syntax & Codec (`module.math`)

<BranchContextCard branch="26.3" />

`module.math` (artifact `anvillib-math-neoforge-26.3`, package `dev.anvilcraft.lib.v2.math`) provides a math expression tree system supporting **datapack JSON serialization, network sync, human-readable Flat text parsing, and self-verified round-trip writing**.

When mods let datapack authors configure dynamic formulas in JSON (e.g., energy, damage, or cooldown formulas scaling with machine tier, multiblock size, or distance), hardcoded coefficients lack flexibility while exposing a scripting engine introduces security and network sync issues. `module.math` represents all formulas uniformly as immutable `IExpression` function-call trees with three automatically convertible forms: **plain numbers**, **Flat expression text** (e.g. `"2x + sqrt($(tier)) * 1.5"`), and **structured JSON objects**.

This module is split into 2 sub-documents by functionality:
- **This page (Expression Model, Flat Syntax & Codec)**: Covers `AnvilLibMath`, `IExpression`, `FunctionExpression`, `Arguments`, `FlatExpressionParser`, and `FlatExpressionWriter`.
- **[Functions, Varargs, Built-ins & Registries](./functions-and-registries)**: Covers `IFunction`, `ConstantFunction`, `InputFunction`, `NamedFunction`, `LambdaFunction`, `CustomFunction`, `Parameter` / `Parameters`, `LibBuiltInFunctions`, `LibFunctionTypes`, `LibRegistries`, and cache cleanup handlers.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.3`, this module is included automatically. To depend on `math` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-math-neoforge-26.3:2.0.0")
}
```

---

## 2. Complete Guide to Flat Expression Syntax

`FlatExpressionParser` parses compact math formula text directly into `IExpression` trees with the following syntax rules:

| Syntax Feature | Examples | Parsed Semantics |
| :--- | :--- | :--- |
| **Numeric Literals** | `42`, `-3.5`, `1.5E-4` | Parsed as `ConstantFunction.of(value).call()`. Non-finite values (overflowing to `Infinity`) fail immediately at parse time. |
| **Positional Variables** | `x`, `y`, `z`, `x0`, `x1`, `x12` | Case-insensitive: `x` ≡ `x0` (index 0), `y` ≡ `x1` (index 1), `z` ≡ `x2` (index 2), `xN` (index N), all parsed as `InputFunction.call(index)`. Fails at parse time if the number after `x` exceeds `int` range. |
| **Named Variables** | `$(cost)`, `$(tier)` | Parsed as `IExpression.Reference.Named("cost")`. Reads from `Arguments`'s named bindings on evaluation; if bound to a variadic list, returns the maximum value in that list. |
| **Variadic Spread Reference** | `$(items...)` | Parsed as `IExpression.Reference.Spread("items")`. Passes the entire variadic `List<Double>` as-is to another variadic parameter slot (e.g., `min($(items...))` or `foreach($(items...), v -> $(v)*2)`). **Cannot be evaluated directly as a single-value expression**. |
| **Arithmetic & Exponentiation** | `a + b`, `a - b`, `a * b`, `a × b`, `a · b`, `a / b`, `a ÷ b`, `a ^ b` | Multiplication accepts `*`, `×`, `·`; division accepts `/`, `÷`; exponentiation `^` is **right-associative** (`2^3^4` ≡ `2^(3^4)`). Unary minus has lower precedence than `^` (`-2^2` parses as `-(2^2) = -4`; write `(-2)^2` for `4`). |
| **Implicit Juxtaposition Multiplication** | `2x`, `2(x + 1)`, `3sqrt(x)`, `2$(cost)` | Automatically inserts a `multiply` call when a left operand is immediately followed by `(`, `$`, or an identifier start character. |
| **Function Calls** | `sqrt(x)`, `max(1, x, y)`, `mymod:triple(x)` | Unqualified names default to `anvillib:<name>`. Under `anvillib`, matches `LibBuiltInFunctions` first then datapack registry `anvillib:function`; under other namespaces, checks the datapack registry first then falls back to built-ins of the same name. **Argument count is validated at parse time**. |
| **Anonymous Functions (Lambda)** | `x -> $(x) * 2`<br>`(a, b) -> $(a) + $(b)`<br>`x... -> max($(x...))` | Single parameter may omit parentheses; multiple use `(a, b) -> ...`; variadic ends with `...`. Parsed as `FunctionExpression.of(LambdaFunction.of(params, body))` (e.g., passed as the last argument to `foreach`). |

---

## 3. Three Inline Encoding Forms & Self-Verified Round-Trip Writing

When serializing with `IExpression.CODEC` in datapack JSON, decoding accepts all three forms while encoding automatically picks the simplest valid form in priority order:

1. **Plain number (highest priority)**: If the root is a zero-arg `ConstantFunction` call (e.g., `IExpression.of(5.0)`), encodes directly as JSON number `5.0`.
2. **Flat text (second priority)**: `FlatExpressionWriter` attempts to serialize the tree as a canonical Flat string (e.g., implicit multiplication written as `2x`, `anvillib:` namespace omitted).
   - **Round-trip verification**: Before returning text, `FlatExpressionWriter.write` re-parses the output via `FlatExpressionParser.parseValue`, writes it again, and checks `sameMeaning(original, reparsed)` and text identity.
   - If the tree contains an unregistered inline `CustomFunction`, zero-arg Lambda, `anvillib` function colliding with a built-in name, variable names with special characters, or ambiguous juxtaposition (e.g., `2 * e1(x)` written as `2e1(x)` would be misread as scientific notation `20 * x`, so preflight falls back to explicit `"2*e1(x)"`), the writer never emits corrupt text and safely falls back to form 3.
3. **Function call object (fallback)**: Written as `{"function": ..., "arguments": [...]}`.

---

## 4. Full Code Example

The example below demonstrates parsing Flat expressions, evaluating with positional and named/variadic `Arguments`, and converting to/from JSON via `RegistryOps`:

```java
package com.example.mymod.math;

import com.google.gson.JsonElement;
import com.mojang.serialization.JsonOps;
import dev.anvilcraft.lib.v2.math.expression.Arguments;
import dev.anvilcraft.lib.v2.math.expression.IExpression;
import dev.anvilcraft.lib.v2.math.expression.function.IFunction;
import dev.anvilcraft.lib.v2.math.init.LibBuiltInFunctions;
import dev.anvilcraft.lib.v2.math.init.LibRegistries;
import net.minecraft.core.HolderGetter;
import net.minecraft.core.HolderLookup;
import net.minecraft.resources.RegistryOps;

import java.util.List;

public final class MachineFormulaExample {
    private MachineFormulaExample() {
    }

    public static void evaluateExamples(HolderLookup.Provider registries) {
        HolderGetter<IFunction> functions = registries.lookupOrThrow(LibRegistries.FUNCTION_KEY);

        // 1. Parse a flat expression with implicit multiplication, power, built-in, and positional x, y
        IExpression energyExpr = IExpression.of(functions, "2x^2 + 10y + sqrt(x)");
        // x = 4.0, y = 3.0 -> 2*(16) + 30 + 2 = 64.0
        double energy = energyExpr.evaluate(4.0, 3.0);
        int roundedEnergy = energyExpr.evaluateInt(4.0, 3.0);

        // 2. Parse an expression with named $(base), variadic $(bonuses...), and Lambda
        IExpression totalScoreExpr = IExpression.of(
            functions,
            "$(base) + foreach($(bonuses...), v -> $(v) * 1.5)"
        );
        Arguments args = Arguments.of(
            List.of(), // No positional arguments
            List.of("base", "bonuses"),
            List.of(
                new Arguments.Value.Single(100.0),
                new Arguments.Value.Many(List.of(10.0, 20.0, 30.0))
            )
        );
        // 100 + (15 + 30 + 45) = 190.0
        double score = totalScoreExpr.evaluate(args);

        // 3. Build an expression tree in code and serialize to JSON via IExpression.CODEC
        IExpression codeBuilt = LibBuiltInFunctions.ADD.call(
            LibBuiltInFunctions.MULTIPLY.call(IExpression.of(2.0), IExpression.of(functions, "x")),
            IExpression.of(1.0)
        );
        RegistryOps<JsonElement> registryJsonOps = RegistryOps.create(JsonOps.INSTANCE, registries);
        // Automatically writes back as JSON string: "2x+1"
        JsonElement json = IExpression.CODEC.encodeStart(registryJsonOps, codeBuilt).getOrThrow();
    }
}
```

---

## 5. Public Classes & Interfaces API Reference

### 1. `IExpression` (Root Expression Node Interface)

Located in `dev.anvilcraft.lib.v2.math.expression.IExpression`.

| Constant / Method / Inner Interface Signature | Return Type | Description & Boundary Behavior |
| :--- | :--- | :--- |
| `IExpression.CODEC` | `Codec<IExpression>` | Full 3-in-1 Codec (number / Flat text / function call object). **Note**: because the Flat text branch queries `LibRegistries.FUNCTION_KEY`, `DynamicOps` passed on encode/decode must be `RegistryOps`. |
| `IExpression.FLAT_OR_OBJECT_CODEC` | `Codec<IExpression>` | Flat text or `FunctionExpression` object Codec (tries Flat text first on encode, falls back to object form if not round-trip-safe). |
| `IExpression.LIST_CODEC` | `Codec<List<IExpression>>` | `IExpression.CODEC.listOf()`. |
| `IExpression.STREAM_CODEC` | `StreamCodec<RegistryFriendlyByteBuf, IExpression>` | Lazily initialized registry-aware network stream codec. |
| `double evaluate(Arguments inputs)` | `double` | Evaluates in the given `Arguments` context. Division by zero (`NaN` or `±Infinity`), negative `sqrt` (`NaN`), out-of-bounds index (`0`), and unbound named variables (`0`) do not throw exceptions. |
| `default double evaluate(double... inputs)` | `double` | Convenience overload taking only positional arguments (equivalent to `evaluate(Arguments.of(inputs))`). |
| `default int evaluateInt(Arguments inputs)` / `evaluateInt(double... inputs)` | `int` | Calls `(int) Math.round(this.evaluate(...))`.<br>**Boundary**: `Math.round(NaN)` returns `0`; values outside `long` clamp to `Long.MIN_VALUE / MAX_VALUE` and cast to `(int)` with 32-bit wrap-around (e.g., `3e9` becomes negative). Call `evaluate` first if handling infinities or huge numbers. |
| `static Reference ref(String name)` | `IExpression.Reference` | Creates a named reference node: returns `Reference.Spread(baseName)` if `name` ends with `"..."`, otherwise `Reference.Named(name)`. |
| `static FunctionExpression of(double value)` | `FunctionExpression` | Creates a numeric constant expression node (`ConstantFunction.of(value).call()`). |
| `static IExpression of(HolderGetter<IFunction> functions, String source)` | `IExpression` | Parses a Flat expression string; throws `IllegalArgumentException` on syntax error. |
| `static FunctionExpression of(IFunction function, IExpression... arguments)` | `FunctionExpression` | Creates an inline function call node. |
| `sealed interface Reference extends IExpression` | `Named` / `Spread` | • `Reference.Named(String name)`: calls `inputs.value(name)` on evaluation;<br>• `Reference.Spread(String name)`: represents `$(name...)` variadic list, only valid in variadic parameter slots; calling `evaluate(inputs)` directly throws `IllegalStateException`. |

### 2. `FunctionExpression` (Function Call Node Record)

```java
public record FunctionExpression(Holder<IFunction> function, List<IExpression> arguments) implements IExpression
```

| Constant / Method Signature | Description |
| :--- | :--- |
| `FunctionExpression.MAP_CODEC` / `CODEC` / `STREAM_CODEC` | Codecs and stream codecs for structured objects `{"function": ..., "arguments": [...]}` (`"arguments"` is optional, defaulting to empty list). |
| `public static FunctionExpression of(IFunction function, IExpression... arguments)` | Wraps an inline function with `Holder.direct(function)` and constructs a call node. |
| `public static FunctionExpression of(Holder<IFunction> function, IExpression... arguments)` | Constructs a call node using a registry reference `Holder<IFunction>`. |
| `public double evaluate(Arguments inputs)` | Delegates to `this.function.value().apply(this.arguments, inputs)`. |

### 3. `Arguments` (Evaluation Argument Context Record)

```java
public record Arguments(List<Double> values, Map<String, Value> named)
```

| Inner Type / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `Arguments.Value` (`sealed interface`) | `Single` / `Many` | • `record Single(double value)`: single numeric binding;<br>• `record Many(List<Double> values)`: variadic list of numbers (immutable copy, may be empty). |
| `public static Arguments of(double... values)` | `Arguments` | Constructs an `Arguments` with only positional values and no named bindings. |
| `public static Arguments of(List<Double> values, List<String> names, List<Value> bound)` | `Arguments` | Binds both positional `values` and named parameters (`names` and `bound` paired by index). |
| `public Arguments withAll(List<String> names, List<Value> bound)` | `Arguments` | Overlays new named bindings onto existing `values` and `named` (new values overwrite same-named old ones), returning a new `Arguments`. |
| `public double value(int index)` | `double` | Reads positional argument by index; safely returns `0.0` if `index < 0` or `index >= values.size()`. |
| `public double value(String name)` | `double` | Reads a single number by name: returns `0.0` if unbound, the value if `Single`, or the **maximum value in the list** if `Many` (`0.0` if empty). |
| `public List<Double> list(String name)` | `List<Double>` | Reads the variadic list (`Value.Many`) bound to `name`; returns `List.of()` if unbound or bound to `Single`. |
| `public boolean isList(String name)` | `boolean` | Checks whether `name` is explicitly bound to `Value.Many` (distinguishes "valid empty variadic list `Many([])`" from "unbound due to typo"). |

### 4. `FlatExpressionParser` & `AnvilLibMath`

| Class / Method Signature | Description |
| :--- | :--- |
| `AnvilLibMath.MAIN_ID` / `MOD_ID` / `of(String path)` | `MAIN_ID = "anvillib"`, `MOD_ID = "anvillib_math"`, `of(path)` returns `anvillib:<path>`. |
| `public static Codec<IExpression> FlatExpressionParser.codec()` | `Codec<IExpression>` for plain Flat text strings (accepts `RegistryOps` only). |
| `public static IExpression FlatExpressionParser.parseValue(String source, HolderGetter<IFunction> functions)` | Parses Flat text and caches results (LRU cache up to `512` entries per `HolderGetter`). Nesting guard is `MAX_NESTING_DEPTH = 512` (functions like `sqrt(sqrt(...))` pass 3 guards—`parseLambda`, `parseUnary`, `parsePower`—per level, supporting up to `169` nested calls; unary sign chains up to `512`), throwing a readable `IllegalArgumentException` instead of stack overflow. |
| `public static void FlatExpressionParser.clearCache()` | Clears the global parse cache (called automatically on server start, `/reload` datapack sync, and client disconnect; call manually if creating custom registries in unit tests). |
| `public static @Nullable HolderGetter<IFunction> FlatExpressionParser.functionGetter(DynamicOps<?> ops)` | Extracts the `HolderGetter` for `LibRegistries.FUNCTION_KEY` from `RegistryOps`. |
