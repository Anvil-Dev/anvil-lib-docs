---
title: Math Expression
prev: false
next: false
---

# Math Expression Module <Badge type="tip" text=">=1.21.1" />

The package `dev.anvilcraft.lib.v2.math` provides a **serializable math expression system**: expressions are represented
as a tree of function calls, able to parse text such as `x*2`, `2x`, or `sqrt(x)`, able to encode to and decode from the
three JSON forms (number / text / object), and able to travel directly over the network. Functions themselves are managed
by registries: functions that are referenced by name come from datapack JSON, while code builds inline function calls
directly.

The mod id is `anvillib_math`, and the registry namespace is uniformly `anvillib` (the constant `AnvilLibMath.MAIN_ID`).

## Architecture Overview

The expression tree has only one kind of node — a function call (`FunctionExpression`) — together with references that
read a value by name (`IExpression.Reference`). Apart from `$(name)` and `$(name...)`, every syntactic construct is
reduced to a function call:

| Written form                          | Actual structure                                                        |
|---------------------------------------|-------------------------------------------------------------------------|
| `2`                                   | zero-argument call of `ConstantFunction(2)`                             |
| `x` / `y` / `z`                       | zero-argument call of `InputFunction(0/1/2)`                            |
| `x3`                                  | zero-argument call of `InputFunction(3)`                                |
| `$(cost)`                             | `IExpression.Reference.Named("cost")`, reading one number by name       |
| `$(cost...)`                          | `IExpression.Reference.Spread("cost")`, reading the whole variadic list |
| `a+b` / `a-b` / `a*b` / `a/b` / `a^b` | call of a binary function such as `LibBuiltInFunctions.ADD`             |
| `sqrt(x)` / `max(x,1)`                | call of `LibBuiltInFunctions.SQRT` / `MAX`                              |
| `triple(x)`                           | call of the datapack function `anvillib:function/triple`                |
| `x -> $(x)*2`                         | call of a `LambdaFunction`, passed as a value to another function       |
| `$(v)*3` (a function body)            | call of a `CustomFunction`                                              |

This yields four layers:

1. **Expression tree** (`IExpression` / `FunctionExpression` / `Arguments`) — nodes, evaluation, serialization entry
   points
2. **Syntax** (`FlatExpressionParser` / `FlatExpressionWriter`) — flat text ⟷ expression tree
3. **Functions** (`IFunction` and its implementations) — evaluation behaviour and codec strategy
4. **Registries** (`LibRegistries`) — the function type registry and the function datapack registry

## Quick Start

**1. Parse and evaluate a piece of text.** Parsing has to reach the function registry, so it needs `RegistryOps`:

```java
RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, registryAccess);

// All three spellings are accepted: number, flat text, object
IExpression expression = IExpression.CODEC.parse(ops, json).getOrThrow();

// x = 3, y = 5
double value = expression.evaluate(3, 5);
int rounded = expression.evaluateInt(3, 5);
```

When you only want to parse text without going through JSON, use `IExpression.of(functions, "2x+1")`, where `functions`
comes from `registryAccess.lookupOrThrow(LibRegistries.FUNCTION_KEY)`.

**2. Define a function with a datapack**, placed in `data/<namespace>/anvillib/function/triple.json`:

```json
{
  "type": "anvillib:custom",
  "parameters": ["value"],
  "body": "$(value)*3"
}
```

Afterwards any expression text can write `triple(x)`, for example `"2*triple(x)+1"`.

**3. Use functions from code.** A datapack registry cannot be registered from code, but code can build inline calls
directly, and functions can be shipped as datapack JSON in the mod's own resources (the `data/` folder inside a mod jar is
itself a datapack):

```json
// src/main/resources/data/mymod/anvillib/function/double.json
{ "type": "anvillib:custom", "parameters": ["value"], "body": "$(value)*2" }
```

```java
// An inline definition: it bypasses the registry and serializes along with the expression
FunctionExpression call = FunctionExpression.of(
    CustomFunction.of(List.of("value"), NamedFunction.call("value")),
    IExpression.of(2.0)
);
```

Details of both approaches are in [Custom Functions](./custom-function), which also covers custom `IFunction`
implementations and new function types.

## Documentation Index

| Document                                   | Content                                                                                                                       |
|--------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| [Expression API](./expression)             | `IExpression`, `FunctionExpression`, `Reference`, `Arguments`, evaluation semantics and errors                                |
| [Function System](./function)              | `IFunction`, the `Type` descriptor, `Parameter`/`Parameters`, built-in functions, generic types, inline and datapack usage |
| [Flat Expression Syntax](./flat-syntax)    | Literals, operators and precedence, lambda, namespace rules, parse-time validation, canonical write-back form                 |
| [Inlining and Codecs](./inline-expression) | The three inline forms (number / flat text / object), `Codec` and `StreamCodec` behaviour, write-back priority                |
| [Custom Functions](./custom-function)      | Datapack JSON functions, variadics and parameter binding, mod resources and inline definitions, downstream custom function types |
| [Cache and Lifecycle](./cache)             | Parse cache grouping and eviction, why weak keys are never collected, cleanup timing on datapack reload and client disconnect |

## Built-in Functions at a Glance

All built-in functions are defined in the `LibBuiltInFunctions` enum, and each constant is itself an `IFunction` that
works without being registered into any registry (see [Function System](./function#built-in-functions)).

| Name       | Parameters         | Description                                                                                                                 |
|------------|--------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `add`      | `a`, `b`           | Addition                                                                                                                    |
| `subtract` | `a`, `b`           | Subtraction                                                                                                                 |
| `multiply` | `a`, `b`           | Multiplication                                                                                                              |
| `divide`   | `a`, `b`           | Division; division by zero gives `NaN` or infinity without throwing                                                         |
| `abs`      | `value`            | Absolute value                                                                                                              |
| `floor`    | `value`            | Round down                                                                                                                  |
| `ceil`     | `value`            | Round up                                                                                                                    |
| `round`    | `value`            | Round half up (`Math.round`, `NaN` gives 0)                                                                                 |
| `sqrt`     | `value`            | Square root; a negative number gives `NaN`                                                                                  |
| `pow`      | `base`, `exponent` | Power, equivalent to `^`                                                                                                    |
| `min`      | `x...` (may be 0)  | Minimum; returns 0 when there is no value                                                                                   |
| `max`      | `x...` (may be 0)  | Maximum; returns 0 when there is no value                                                                                   |
| `foreach`  | `x...`, `function` | Iteration; the last argument must be a lambda, and the sum of the results of each call is returned (`function` is required) |

Every built-in declares its parameter names (the "Parameters" column above). Calling a function binds its parameter names
into the evaluation context, so an expression can reference them directly with `$(parameter)`: `add` declares `a` and `b`,
which is why `add($(a),$(b))` evaluates normally. The first ten functions take a fixed number of arguments; `min`/`max`
are declared variadic as `x...` and may be given no argument at all (returning 0); `foreach` likewise carries a variadic,
and its `function` is required. An invalid argument count is reported **at parse time** (the message also carries the
offending position at its end), for example `sqrt(x,1)` throws
`function 'anvillib:sqrt' Expected 1 arguments but got 2 at position 9 of expression "sqrt(x,1)"`, and `foreach()` throws
`function 'anvillib:foreach' Expected at least 1 arguments but got 0` — that lower bound of 1 comes from the required
`function`, not from the variadic (`foreach(x -> $(x))` is valid: the lambda feeds `function`, the variadic gets nothing,
and the iteration result is empty).

The mapping between operators and built-in functions is hard-coded (`+`→`add`, `-`→`subtract`, `*`→`multiply`,
`/`→`divide`, `^`→`pow`), and parsing an operator **does not consult the registry**, so registering an `anvillib:add`
cannot change the meaning of `+`.

## Module Entry Point

### AnvilLibMath

The mod entry point, `@Mod("anvillib_math")`, which also registers the function types and the built-in functions;
downstream mods do not need to call them.

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_math";

public AnvilLibMath(IEventBus modEventBus, ModContainer ignored) {
    LibFunctionTypes.register(modEventBus);
    LibBuiltInFunctions.register(modEventBus);
}

// Creates an Identifier in the anvillib namespace
public static Identifier of(String path) { ... }
```

## Registries

`LibRegistries` declares two registries, defined under the `anvillib` namespace:

| Registry                        | Key                      | Type                | Description                                                                                                         |
|---------------------------------|--------------------------|---------------------|---------------------------------------------------------------------------------------------------------------------|
| Function type registry (synced) | `anvillib:function_type` | `IFunction.Type<?>` | Determines how an `IFunction` is encoded and decoded; `RegistryBuilder` creates the registry and calls `sync(true)` |
| Function datapack registry      | `anvillib:function`      | `IFunction`         | Functions that expressions can reference by name; loaded with datapacks and synced to clients                       |

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

- The function type registry is registered in `NewRegistryEvent` with `event.register(FUNCTION_TYPE)` and synced to
  clients (a custom function type must be registered on both sides, otherwise the client cannot decode the network
  packet)
- The function datapack registry is created in `DataPackRegistryEvent.NewRegistry` with
  `event.dataPackRegistry(FUNCTION_KEY, IFunction.DIRECT_CODEC, IFunction.DIRECT_CODEC)`, so it **can only be populated
  from datapack JSON**: `RegisterEvent` only fires for the registries in `BuiltInRegistries`, so a `DeferredRegister` has
  no effect on it, and code cannot call `Registry.register` on it either (the `data/` folder inside a mod jar is itself a
  datapack)
- Entry paths follow the vanilla convention: `triple` under `anvillib:function` corresponds to
  `data/<namespace>/anvillib/function/triple.json`
- Built-in functions **do not occupy** entries here: `LibBuiltInFunctions` is a hard-coded enum lookup, and serialization
  writes them out as inline definitions

## Dependency

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-math-neoforge-26.1:2.0.0"
}
```

The aggregate module `anvillib-neoforge-26.1` already includes this module via `jarJar`; this module itself depends on
`anvillib-util-neoforge-26.1` (`IFunction.Type` inherits from its `ISerializer`), which `jarJar` brings along as well.

## Notes

- **An out-of-range index, an unbound name, division by zero, and a negative square root never throw**; each yields `0`
  or `NaN`. Exceptions are thrown only when the whole-list reference `$(name...)` lands in a position that requires a
  single number, when a name is not bound to a list, or when the argument count does not match the parameter declaration
  (see [Expression API](./expression#evaluation-semantics-and-errors))
- **Function counts and names are validated at parse time**: a datapack function with a mismatched argument count never
  makes it into a save (see [Flat Expression Syntax](./flat-syntax#arity-validation))
- **Parsing and writing back flat text have to reach the function registry**, so only `RegistryOps` is accepted; under
  any other `DynamicOps` the flat text branch returns an error, while the number and object forms remain usable
- **The write-back result is a canonical form, not the original text**: `2*x` becomes `2x`, `x0` becomes `x`, and the
  `anvillib:` prefix is always omitted, but any write-back result re-parses into the same expression tree (see
  [Flat Expression Syntax](./flat-syntax#canonical-write-back-form))
- **Names are written case-sensitively and read case-insensitively**: function names are lower-cased before parsing, so
  `SQRT(x)` reaches `sqrt(x)`, while a function whose registry path contains upper-case letters cannot be referenced
  from flat text
- **`x` / `y` / `z` are input values, not function names**: the parser recognises variables before functions, so a
  function called `x` or `x0` cannot be written as a bare name (write-back falls back to the object form)
- **Parse results are cached per function registry instance, with a capacity of 512 and no expiry time**; the weak keys
  are never collected on their own, so server start, `/reload`, and client disconnect clean up proactively — see
  [Cache and Lifecycle](./cache) for details
- **A self-referencing function body does not overflow the stack**: evaluation has a 64-level call depth guard (see
  [Function System](./function#call-depth-guard))
