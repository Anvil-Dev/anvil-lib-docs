# Function System, Varargs, Built-ins & Registries (`dev.anvilcraft.lib.v2.math.expression.function` / `init`)

<BranchContextCard branch="26.2" />

In `module.math`, every computation in an expression tree—whether a constant, variable lookup, arithmetic, aggregation, or datapack custom formula—is fundamentally an invocation of `IFunction`. This page details the function interface, parameter binding and arbitrary-position variadic parameters, 13 built-in functions, 5 general function implementations, and the dual-registry extension architecture.

---

## 1. Core Design: Arbitrary-Position Variadic Parameters & Closure Evaluation

### 1. Parameter Declarations & Variadic Binding (`Parameter` & `Parameters`)

In `CustomFunction` or `LambdaFunction`, formal parameters are declared as a string list (e.g. `["a", "x...", "b"]`):

- **Identifier constraints**: parameter base names must start with a letter or underscore, followed only by letters, digits, or underscores (matching Flat text identifier rules), and **duplicate names are disallowed** within the same parameter list.
- **Single variadic parameter at any position (`...`)**: a parameter ending with `"..."` (`Parameter.VARIADIC_SUFFIX`) marks it as variadic. A function signature may declare **at most 1 variadic parameter**, and it **does not have to be the last parameter** (e.g., `["prefix", "middle...", "suffix"]` is completely valid).
- **Variadic binding algorithm (`IFunction.bind`)**:
  Given $F$ fixed parameters and 1 variadic parameter, if $N$ arguments are passed after expanding all `$(name...)` spreads (requiring $N \ge F$, with the variadic parameter consuming at least $0$ arguments):
  - Each fixed parameter receives $1$ argument;
  - The variadic parameter automatically consumes the remaining $N - F$ arguments in the middle, packed as `Arguments.Value.Many(List<Double>)` and bound to its parameter name.
- **Using variadic parameters in the function body**:
  - Writing `$(x)` (single-value reference) evaluates to the **maximum value** in the variadic list (`0` if empty);
  - Writing `$(x...)` (`Reference.Spread`) forwards the entire list as-is to another variadic-accepting function (such as `min($(x...))`, `max($(x...))`, or `foreach($(x...), item -> $(item) * 2)`).

### 2. Call Depth Guard (Preventing Self-Recursive Infinite Loops)

Datapack `CustomFunction`s or registry `LambdaFunction`s can call any function in the registry by name (including themselves or mutually). To prevent infinite recursion from blowing the JVM call stack, `IFunction` has a built-in thread-local depth guard `IFunction.MAX_CALL_DEPTH = 64`. Once a single evaluation reaches depth `64`, `IFunction#guarded` immediately throws a readable `IllegalStateException("Function call depth exceeded 64 at ...")` and safely restores the thread depth counter.

---

## 2. Full Code Examples

### 1. Defining Custom Functions in Datapack JSON (`data/<namespace>/anvillib/function/*.json`)

Datapack functions live under `data/<namespace>/anvillib/function/<name>.json`. If `<namespace>` is `anvillib`, the namespace can be omitted in Flat text; for other namespaces (such as `my_mod`), call it as `my_mod:<name>(...)`:

```json
// File path: data/my_mod/anvillib/function/weighted_sum.json
{
  "type": "anvillib:custom",
  "parameters": ["scale", "items...", "bias"],
  "body": "$(bias) + $(scale) * foreach($(items...), v -> $(v)^2)"
}
```

Parsing and calling the datapack function above (note that variadic `items...` is in the middle, while `scale` and `bias` are fixed parameters at the ends):

```java
// 1.0 is scale, 2.0, 3.0, 4.0 go into items..., and 10.0 goes into bias
// Result: 10.0 + 1.0 * (4 + 9 + 16) = 39.0
IExpression expr = IExpression.of(functions, "my_mod:weighted_sum(1.0, 2.0, 3.0, 4.0, 10.0)");
double result = expr.evaluate();
```

### 2. Constructing Variadic `CustomFunction` or Registering `IFunction.Type` in Java

```java
package com.example.mymod.math;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import dev.anvilcraft.lib.v2.math.expression.IExpression;
import dev.anvilcraft.lib.v2.math.expression.function.CustomFunction;
import dev.anvilcraft.lib.v2.math.expression.function.IFunction;
import dev.anvilcraft.lib.v2.math.expression.function.Parameters;
import dev.anvilcraft.lib.v2.math.init.LibBuiltInFunctions;
import dev.anvilcraft.lib.v2.math.init.LibRegistries;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.List;

public final class ModMathExtensions {
    // 1. Construct an inline CustomFunction that computes an average
    public static CustomFunction createAverageFunction(
        net.minecraft.core.HolderGetter<IFunction> functions
    ) {
        // foreach($(x...), n -> $(n)) for sum, divided by foreach($(x...), n -> 1) for count
        IExpression body = IExpression.of(
            functions,
            "foreach($(x...), n -> $(n)) / max(1, foreach($(x...), n -> 1))"
        );
        return CustomFunction.of(List.of("x..."), body);
    }

    // 2. Register a custom IFunction.Type to LibRegistries.FUNCTION_TYPE
    public static final DeferredRegister<IFunction.Type<?>> FUNCTION_TYPES =
        DeferredRegister.create(LibRegistries.FUNCTION_TYPE, "my_mod");

    public static final DeferredHolder<IFunction.Type<?>, ClampFunction.Type> CLAMP_TYPE =
        FUNCTION_TYPES.register("clamp", ClampFunction.Type::new);

    public static void register(IEventBus modEventBus) {
        FUNCTION_TYPES.register(modEventBus);
    }

    public record ClampFunction(double min, double max) implements IFunction {
        private static final Parameters PARAMS = Parameters.of(List.of("value"));

        @Override
        public Parameters parameters() {
            return PARAMS;
        }

        @Override
        public double apply(Call call) {
            return Math.clamp(call.valueAt(0), this.min, this.max);
        }

        @Override
        public IFunction.Type<? extends IFunction> type() {
            return IFunction.typeOf(CLAMP_TYPE.getKey());
        }

        public static class Type implements IFunction.Type<ClampFunction> {
            public static final MapCodec<ClampFunction> CODEC =
                com.mojang.serialization.codecs.RecordCodecBuilder.mapCodec(inst -> inst.group(
                    Codec.DOUBLE.fieldOf("min").forGetter(ClampFunction::min),
                    Codec.DOUBLE.fieldOf("max").forGetter(ClampFunction::max)
                ).apply(inst, ClampFunction::new));

            public static final StreamCodec<RegistryFriendlyByteBuf, ClampFunction> STREAM_CODEC =
                StreamCodec.composite(
                    ByteBufCodecs.DOUBLE, ClampFunction::min,
                    ByteBufCodecs.DOUBLE, ClampFunction::max,
                    ClampFunction::new
                );

            @Override
            public MapCodec<ClampFunction> codec() {
                return CODEC;
            }

            @Override
            public StreamCodec<RegistryFriendlyByteBuf, ClampFunction> streamCodec() {
                return STREAM_CODEC;
            }

            @Override
            public String getSerializedName() {
                return "clamp";
            }
        }
    }
}
```

---

## 3. Overview of the 13 Built-in Functions (`LibBuiltInFunctions`)

The `LibBuiltInFunctions` enum implements `IFunction` and `StringRepresentable`, registered under function type `anvillib:builtin`. Detailed signatures and boundary behaviors of all built-in functions:

| Enum Constant | Serialized / Flat Name | Parameters | Evaluation Semantics & Boundary Conditions |
| :--- | :--- | :--- | :--- |
| `ADD` | `add` | `["a", "b"]` | `a + b` (infix `+`) |
| `SUBTRACT` | `subtract` | `["a", "b"]` | `a - b` (infix `-`; unary `-x` is represented as `subtract(0, x)`) |
| `MULTIPLY` | `multiply` | `["a", "b"]` | `a * b` (infix `*`, `×`, `·`, and implicit juxtaposition multiplication) |
| `DIVIDE` | `divide` | `["a", "b"]` | `a / b` (infix `/`, `÷`; division by zero returns `NaN` or `±Infinity`, no exception) |
| `ABS` | `abs` | `["value"]` | `Math.abs(value)` |
| `FLOOR` | `floor` | `["value"]` | `Math.floor(value)` |
| `CEIL` | `ceil` | `["value"]` | `Math.ceil(value)` |
| `ROUND` | `round` | `["value"]` | `Math.round(value)` (note: `NaN` returns `0`, values outside `long` clamp to `Long.MIN_VALUE / MAX_VALUE`) |
| `SQRT` | `sqrt` | `["value"]` | `Math.sqrt(value)` (negative values return `NaN`, no exception) |
| `POW` | `pow` | `["base", "exponent"]` | `Math.pow(base, exponent)` (right-associative infix `^`) |
| `MIN` | `min` | `["x..."]` | Variadic minimum; returns `0.0` when passed 0 arguments or an empty variadic list |
| `MAX` | `max` | `["x..."]` | Variadic maximum; returns `0.0` when passed 0 arguments or an empty variadic list |
| `FOREACH` | `foreach` | `["x...", "function"]` | Iterates over the first `N - 1` arguments (supporting `$(list...)` spread), passes each element to the last argument (**must be a single-fixed-parameter `LambdaFunction`**), and returns the sum of results. Throws `IllegalArgumentException` if the last argument is not a 1-fixed-param Lambda. |

### Common Methods on `LibBuiltInFunctions`

| Method Signature | Description |
| :--- | :--- |
| `public static @Nullable LibBuiltInFunctions byName(String name)` | Case-insensitive lookup of built-in function enum by name; returns `null` if absent. |
| `public FunctionExpression call(IExpression... arguments)` / `call(List<IExpression> arguments)` | Constructs a call node for this built-in function and immediately validates arity and `Spread` positions via `Parameters#checkArity(List)`; throws `IllegalArgumentException` if invalid. |
| `public DataResult<FunctionExpression> callChecked(List<IExpression> arguments)` | Same as above, but returns `DataResult.error(...)` on invalid arguments. |
| `public int minimumArity()` / `public int maximumArity()` / `public Identifier id()` | Returns minimum arity, maximum arity, and `anvillib:<name>` identifier. |

---

## 4. `IFunction` & 5 General Function Implementations

### 1. Core Members of `IFunction`

| Constant / Method / Inner Type Signature | Description |
| :--- | :--- |
| `IFunction.DIRECT_CODEC` / `HOLDER_CODEC` / `CODEC` | • `DIRECT_CODEC`: inline object Codec dispatched by `LibRegistries.FUNCTION_TYPE`;<br>• `HOLDER_CODEC`: `RegistryFileCodec.create(FUNCTION_KEY, DIRECT_CODEC)`, supporting datapack registry name references or inline objects;<br>• `CODEC`: on encode, prefers looking up an equal registered `Holder.Reference` in `RegistryOps` to write its registry name, falling back to `Holder.direct(input)` inline definition if not found. |
| `IFunction.HOLDER_STREAM_CODEC` / `STREAM_CODEC` | Corresponding `RegistryFriendlyByteBuf` network stream codecs. |
| `default double apply(List<IExpression> arguments, Arguments inputs)` | Default implementation calls `IFunction.bind(arguments, inputs, this.parameters())` for argument evaluation and parameter binding, then delegates to `apply(Call)`. |
| `default double apply(Call call)` / `default double applyBound(List<Double> arguments, Arguments bound)` | Subclasses may override `apply(Call)` (with access to `call.bound().list(name)` variadic lists and `call.valueAt(i)`) or `applyBound`. |
| `default Parameters parameters()` | Returns the parameter declaration list (defaults to `Parameters.EMPTY`). |
| `default double guarded(String description, Supplier<Double> body)` | Executes `body.get()` under the `MAX_CALL_DEPTH = 64` recursion depth guard. |
| `static IFunction.Type<? extends IFunction> typeOf(ResourceKey<IFunction.Type<?>> key)` | Fetches a registered `Type` instance from `LibRegistries.FUNCTION_TYPE` (avoids throwing when calling `DeferredHolder#get` without built-in registries). |
| `static Call bind(List<IExpression> arguments, Arguments inputs, Parameters parameters)` | Evaluates, spreads, and binds fixed and arbitrary-position variadic parameters, returning `IFunction.Call(List<IExpression> references, List<Double> values, Arguments bound)`. |

### 2. 5 General Function Implementations (in `dev.anvilcraft.lib.v2.math.expression.function`)

| Class | Function Type ID (`LibFunctionTypes`) | Factory Methods & Core Details |
| :--- | :--- | :--- |
| `ConstantFunction(double value)` | `anvillib:constant` | • `ConstantFunction.of(double value)`: constructs a constant function;<br>• `call()`: constructs a zero-arg `FunctionExpression`;<br>• `ConstantFunction.value(FunctionExpression)`: returns `Optional<Double>` if the call is a zero-arg constant call. |
| `InputFunction(int index)` | `anvillib:input` | • `InputFunction.of(int index)` / `InputFunction.call(int index)`: reads `Arguments#value(index)` by non-negative `index` (corresponding to `x`, `y`, `z`, `xN` in Flat syntax). |
| `NamedFunction(String name)` | `anvillib:named` | • `NamedFunction.of(String name)` / `NamedFunction.call(String name)`: reads `Arguments#value(name)` by `name`. |
| `CustomFunction(Parameters parameters, IExpression body)` | `anvillib:custom` | • `CustomFunction.of(List<String> declarations, IExpression body)`: supports `"x..."` variadic declarations;<br>• `CustomFunction.named(List<String> names, IExpression body)`: all fixed parameters;<br>• Evaluates `body` under the `guarded` depth guard. |
| `LambdaFunction(Parameters parameters, IExpression body)` | `anvillib:lambda` | • `LambdaFunction.of(List<String> declarations, IExpression body)`;<br>• `LambdaFunction.named(List<String> names, IExpression body)`;<br>• `LambdaFunction.call(String parameter, IExpression body)`: constructs a single-param Lambda node. Supports lexical closures (retaining outer `inputs` named bindings). |

---

## 5. Dual Registries & Cache Lifecycle (`dev.anvilcraft.lib.v2.math.init`)

| Class | Public Constants / Method Signatures | Description & Important Notes |
| :--- | :--- | :--- |
| `LibRegistries` | `FUNCTION_TYPE_KEY` (`anvillib:function_type`)<br>`FUNCTION_TYPE` (`Registry<IFunction.Type<?>>`)<br>`FUNCTION_KEY` (`anvillib:function`) | • `FUNCTION_TYPE` is a synced code registry (max ID `512`); downstream mods can register new function types via `DeferredRegister`.<br>• `FUNCTION_KEY` is a **Datapack Registry**; entries can only be registered via JSON under `data/<namespace>/anvillib/function/*.json` and **cannot be registered in code via `DeferredRegister`** (NeoForge does not fire `RegisterEvent` for datapack registries). To use custom functions in code, construct them inline via `Holder.direct(function)` or `FunctionExpression.of(function, ...)`. |
| `LibFunctionTypes` | `INPUT`, `NAMED`, `CONSTANT`, `CUSTOM`, `LAMBDA`<br>`public static void register(IEventBus bus)` | Registers the 5 core `IFunction.Type`s other than `builtin`. |
| `LibCacheReloadHandler` | `onServerStarted(ServerStartedEvent)`<br>`onDatapackSync(OnDatapackSyncEvent)` | Automatically calls `FlatExpressionParser.clearCache()` on server start and `/reload` (`event.getPlayer() == null`), preventing `Holder.Reference`s in parsed trees from leaking old registries. |
| `LibClientCacheHandler` | `onLoggingOut(ClientPlayerNetworkEvent.LoggingOut)` | Automatically calls `FlatExpressionParser.clearCache()` when the physical client disconnects from a server, releasing the previous connection's datapack function registry cache. |
