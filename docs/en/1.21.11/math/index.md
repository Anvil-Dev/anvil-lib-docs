# Math Serializable Expression System (`module.math`)

<BranchContextCard branch="1.21.11" />

`module.math` (artifact `anvillib-math-neoforge-1.21.11`, package `dev.anvilcraft.lib.v2.math`) provides a **math expression evaluation engine supporting datapack JSON definitions, network stream sync, bidirectional human-readable Flat formula parsing/writing, and custom multi-arg functions**.

When writing complex machine energy formulas, dynamic attribute multipliers, or data-driven skill values, `module.math` abstracts all formulas as immutable **`IExpression`s (backed by `FunctionExpression`)**—allowing single-line formula strings like `"sin(x)^2 + cos(x)^2"` or structured JSON objects, with automatic arity validation and constant-folding (`tryCollapse`) before evaluation.

This module is split into 2 sub-documents by functionality:
- **This page (Expression Syntax, Parsing/Writing & Evaluation)**: Covers `AnvilLibMath`, `IExpression`, `FunctionExpression`, `Arguments`, `FlatExpressionParser`, and `FlatExpressionWriter`.
- **[Function System, Built-ins & Dual Registries](./functions-and-registries)**: Covers `IFunction` and its 5 implementations, `Parameter`/`Parameters`, `LibBuiltInFunctions`, `LibFunctionTypes`, and `LibRegistries`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-1.21.11`, this module is included automatically. To depend on `math` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-math-neoforge-1.21.11:2.0.0")
}
```

---

## 2. Flat Expression Syntax Quick Reference (`FlatExpressionParser`)

`IExpression.CODEC` tries parsing strings as Flat expression syntax first by default (and can serialize back to minimal-parenthesis strings via `FlatExpressionWriter`):

| Syntax Element | Examples | Precedence (Low to High) & Associativity | Built-in Function ID (`anvillib:<name>`) |
| :--- | :--- | :--- | :--- |
| **Add / Subtract** | `a + b`, `a - b` | Precedence `1`, left-associative | `anvillib:add`, `anvillib:subtract` |
| **Mul / Div / Mod** | `a * b`, `a / b`, `a % b` | Precedence `2`, left-associative | `anvillib:multiply`, `anvillib:divide`, `anvillib:modulo` |
| **Unary Plus / Minus** | `+x`, `-x` | Precedence `3` (higher than `*`/`/`, lower than `^`, so `-x^2` parses as `-(x^2)`) | `+x` unwraps to `x`; `-x` maps to `anvillib:negate` |
| **Exponentiation** | `x ^ y` | Precedence `4`, **right-associative** (`a ^ b ^ c` parses as `a ^ (b ^ c)`) | `anvillib:power` |
| **Parentheses** | `(a + b) * c` | Highest precedence | — |
| **Numeric Literals** | `3.14`, `.5`, `1e-3` | Leaf node | Constructs inline `ConstantFunction` |
| **Function Calls** | `sin(x)`, `max(a, b, 10)`, `my_mod:custom(x)` | Leaf node (unqualified names default to `anvillib:<name>`) | Looked up from `LibRegistries.FUNCTION_KEY` datapack registry |
| **Named Variable Refs** | `x`, `temperature`, `my_mod:env_temp` | Leaf node (bare identifier without parens, equivalent to 0-arg call) | Looks up matching `InputFunction` or 0-arg constant function (`pi`, `e`) in `LibRegistries.FUNCTION_KEY` |

---

## 3. Full Code Example: Constructing, Parsing & Evaluating Math Expressions in Code

```java
package com.example.mymod.math;

import com.mojang.serialization.DynamicOps;
import dev.anvilcraft.lib.v2.math.expression.Arguments;
import dev.anvilcraft.lib.v2.math.expression.FunctionExpression;
import dev.anvilcraft.lib.v2.math.expression.IExpression;
import dev.anvilcraft.lib.v2.math.expression.function.ConstantFunction;
import dev.anvilcraft.lib.v2.math.expression.function.IFunction;
import dev.anvilcraft.lib.v2.math.expression.function.InputFunction;
import dev.anvilcraft.lib.v2.math.init.LibBuiltInFunctions;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.RegistryOps;

import java.util.List;

public final class MathExpressionExample {
    private MathExpressionExample() {
    }

    /**
     * Approach 1: Decode IExpression directly from a Flat formula string via RegistryOps and evaluate
     * Note: x, y, z, w, pi, e are already preset by LibBuiltInFunctions in the datapack!
     */
    public static double parseAndEvalFromFormula(HolderLookup.Provider registries, double xVal, double yVal) {
        DynamicOps<Tag> ops = RegistryOps.create(NbtOps.INSTANCE, registries);

        // Decode "clamp(x ^ 2 + 2 * y, 0, 100) + sin(pi / 2)"
        // Automatically calls tryCollapse() after decoding to pre-fold constant branch sin(pi / 2) into 1.0!
        IExpression expr = IExpression.CODEC.parse(
            ops,
            StringTag.valueOf("clamp(x ^ 2 + 2 * y, 0, 100) + sin(pi / 2)")
        ).getOrThrow();

        // Build input argument table and evaluate
        Arguments args = Arguments.builder()
            .with("x", xVal)
            .with("y", yVal)
            .build();

        return expr.eval(args);
    }

    /**
     * Approach 2: Assemble expressions directly in pure Java with Holder.direct without datapack registries
     */
    public static double buildProgrammaticExpression(double inputTemp) {
        Holder<IFunction> tempVar = Holder.direct(new InputFunction("temp"));
        Holder<IFunction> factorConst = Holder.direct(new ConstantFunction(2.5));

        // Build temp * 2.5
        IExpression expr = FunctionExpression.of(
            LibBuiltInFunctions.MULTIPLY,
            List.of(
                FunctionExpression.leaf(tempVar),
                FunctionExpression.leaf(factorConst)
            )
        );

        return expr.eval(Arguments.builder().with("temp", inputTemp).build());
    }
}
```

---

## 4. Core Interfaces & Classes API Reference (`dev.anvilcraft.lib.v2.math.expression`)

### 1. `IExpression` & `FunctionExpression`

| Interface / Class | Constants / Method Signatures | Description |
| :--- | :--- | :--- |
| **`IExpression`** | • `Codec<IExpression> CODEC`<br>• `StreamCodec<RegistryFriendlyByteBuf, IExpression> STREAM_CODEC`<br>• `double eval(Arguments args)`<br>• `Holder<IFunction> function()`<br>• `List<IExpression> subExpressions()`<br>• `IExpression tryCollapse()` | Top-level math expression interface. `CODEC` reads Flat strings or `FunctionExpression` objects; on encode, outputs a concise Flat string if `FlatExpressionWriter` round-trips cleanly and passes structural equivalence, otherwise falls back to object form. |
| **`FunctionExpression`** | • `MapCodec<FunctionExpression> CODEC`<br>• `StreamCodec<RegistryFriendlyByteBuf, FunctionExpression> STREAM_CODEC`<br>• `public static FunctionExpression of(Holder<IFunction> function, List<IExpression> subExpressions)`<br>• `public static FunctionExpression leaf(Holder<IFunction> function)`<br>• `public static FunctionExpression constant(double value)` | Standard `IExpression` record implementation. `of(...)` validates arity via `function.value().expectedParams().validateCount(subExpressions.size())` and throws `IllegalArgumentException` on mismatch.<br>`tryCollapse()` folds bottom-up: if a node and all subexpressions have no input dependency (`!function.requireInput()` and all children are inline `ConstantFunction`), evaluates and replaces with `FunctionExpression.constant(val)`. |

---

### 2. `Arguments` (Named Input Variable Table)

Passes runtime numeric values to `InputFunction`s (`x`, `y`, `z`, `w`, or custom variable names) in an expression.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static final Arguments EMPTY` | `Arguments` | Empty arguments constant (pass `Arguments.EMPTY` when an expression has no `InputFunction`s). |
| `public static Arguments.Builder builder()` | `Builder` | Creates an arguments builder (populate via `with(String name, double value)` and call `build()`). |
| `public double get(String name)` | `double` | Reads variable `name`; throws `IllegalArgumentException("Missing input argument: " + name)` if missing. |

---

### 3. `FlatExpressionParser` & `FlatExpressionWriter`

| Class | Public Method Signatures | Description |
| :--- | :--- | :--- |
| **`FlatExpressionParser`** | `public static DataResult<IExpression> parse(String input, HolderGetter<IFunction> functions)` | Parses an infix math formula string into `IExpression`. Lexical/syntax errors, mismatched parens, unknown function names, or arity mismatches return `DataResult.error` with position details (never throws uncaught exceptions). |
| **`FlatExpressionWriter`** | `public static DataResult<String> write(IExpression expression, HolderGetter<IFunction> functions)` | Formats an `IExpression` tree back into minimal-parenthesis infix string and automatically re-runs `FlatExpressionParser.parse` for structural equivalence self-checking (preventing ambiguity from shadowed function names). |
