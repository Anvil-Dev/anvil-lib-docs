---
title: Math Custom Functions
prev: false
next: false
---

# Custom Functions

Functions that expressions reference by name live in the `anvillib:function` datapack registry, and a downstream mod only
has to put JSON into its own datapack (the `data/` folder inside a mod jar is itself a datapack); when code needs a
function it builds an inline call directly. When an entirely new codec form is needed, register your own function type
into `anvillib:function_type` as well.

## Datapack JSON

Entry paths follow the vanilla convention: `triple` under `anvillib:function` corresponds to `data/<namespace>/anvillib/function/triple.json`.

### Expression Functions

The most common form uses `anvillib:custom` to declare a number of parameters and an expression as the function body. Inside the body, `$(parameter name)` references a parameter.

```json
{
  "type": "anvillib:custom",
  "parameters": ["value"],
  "body": "$(value)*3"
}
```

On a call, the parameters are bound in declaration order to the evaluated results of the arguments, so the call site no longer has to provide identically named input values:

```java
IExpression triple = FlatExpressionParser.parseValue("triple(x)", functions);
triple.evaluate(4); // 12.0
```

| Field        | Type           | Description                                                                                                                                                                                    |
|--------------|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `type`       | `String`       | The function type; for an expression function it is fixed to `anvillib:custom`                                                                                                                 |
| `parameters` | `List<String>` | Parameter names, bound to arguments in declaration order; they may not be repeated, may not be an empty name, and must be identifiers (starting with a letter or underscore, the rest being letters, digits or underscores); one ending in `...` is a variadic parameter |
| `body`       | `IExpression`  | The function body; it may be a number, flat text, or the object form                                                                                                                           |

The argument count must fall within the range allowed by the parameter declaration: when calling from flat text it reports an error **at parse time**, and when calling directly with the object form (`FunctionExpression.of(...)`) it throws `IllegalArgumentException` during the binding stage (for example `Expected 2 to 3 arguments but got 1`).

The type of `body` is exactly `IExpression.CODEC`, so the function body can also be written as a nested object form:

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

Write `$(value)` rather than `value` in the function body: the former reads a value by name binding, while the latter is `InputFunction(0)`, which reads the 0th input value of the call site and has nothing to do with the parameter.

### Variadic Parameters

A parameter name ending in `...` is variadic, written as `"parameters": ["a", "x..."]`; the `...` is a suffix on the name.

- At most **one** variadic parameter per signature
- The variadic parameter may appear at **any position**, not only last; the fixed parameters before and after it each keep their original positions, and the variadic parameter soaks up the remaining arguments
- The variadic parameter is Java-style varargs: its **lower bound is 0**, so giving it no argument at all is legal (`min()` is legal and returns 0), and the upper bound is unlimited. `"x...": []` is just an ordinary empty call
- The zero lower bound applies only to the variadic parameter; not a single fixed parameter may be missing, so `(x..., last)` has a lower bound of 1

There are two ways to read a variadic parameter in the function body:

| Syntax    | Meaning                                                                                        |
|-----------|------------------------------------------------------------------------------------------------|
| `$(x)`    | Reads a single number; when `x` is bound to a variadic parameter, this gives the **maximum** of the list |
| `$(x...)` | Reads the **whole list** itself                                                                |

`$(x...)` is not a number, so it can only be passed to a variadic parameter position; using it where a single number is required reports an error at evaluation time. A whole list passed to a variadic position is **spread out**: `min($(x...), 4)` with `x = [9, 2, 7]` is `min(9, 2, 7, 4)`.

Slot allocation is computed by **argument count**: the variadic parameter first reserves a slot for every fixed parameter after it, and only the remainder goes to it, after which `$(name...)` spreads out from the variadic slot and occupies a number of slots. When the variadic parameter is not last, argument indices and parameter indices do not line up in the first place, so the criterion is "which parameter this argument is actually fed to", not the parameter index: when `(x..., last)` is called with `($(xs...), 1)`, `$(xs...)` lands exactly on the variadic slot and evaluates normally.

An empty list spreads out into **zero** values, so it does not occupy an argument slot: when `(x..., last)` is called with `($(xs...), 1)` and `xs = []`, `last` still gets that `1`, and the variadic parameter is empty. Conversely, when the list spreads out into more values than the variadic slot can take, what is reported is an exception carrying the counts rather than an index out of bounds: when `(x..., last)` is called with `($(xs...), 1)` and `xs = [5, 6]`, only one slot is left for the variadic parameter, and it throws `Spread[name=xs] provides 2 arguments but this position takes 1`.

When a name is not bound to a list it likewise reports an error naming it, rather than quietly treating it as an empty list: `min($(typo...))` throws `IllegalArgumentException: $(typo...) is not bound to a list`.

A custom function **cannot unpack** its own variadic parameter: in the function body there is no way to iterate it other than forwarding `$(x...)` to a variadic function such as `min`, `max`, or `foreach`. `foreach($(x...), item -> $(item)*2)` hands the whole variadic list to the lambda one by one.

```json
{
  "type": "anvillib:custom",
  "parameters": ["a", "x..."],
  "body": "min($(x...))"
}
```

When `f(9, 5, 2, 7)` is called, `a` is 9 and `x` is `[5, 2, 7]`, giving 2; if the body were written as `$(x)` it would give 7 (the maximum of the list).

```java
// The corresponding constructs in code: of parses declaration text, where "x..." is variadic; named creates from parameter names and treats them all as fixed parameters
CustomFunction.of(List.of("a", "x..."), body);
CustomFunction.named(List.of("a", "b"), body);
```

A lambda uses the same parameter declaration: `LambdaFunction.of(List<String>, IExpression)` creates from declaration text, `LambdaFunction.named(List<String>, IExpression)` creates from parameter names, and a single-parameter call uses `LambdaFunction.call(String, IExpression)`; it is registered under the `anvillib:lambda` type.

A function body may reference functions in the datapack registry, including itself: self-references and mutual references are stopped at evaluation time by the call depth limit (`MAX_CALL_DEPTH = 64`) rather than a stack overflow, see [Function System](./function#call-depth-guard).

### Other Function Types

A registry entry may also be an inline form such as a constant or an input reference, as long as it conforms to `IFunction.DIRECT_CODEC`:

```json
{ "type": "anvillib:constant", "value": 3 }
```

That way a name such as `pi` can be written directly into expression text. Likewise you can put `anvillib:input`, `anvillib:named`, `anvillib:lambda`, or even hang a `builtin` on a name:

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

### Datapack Functions Shadowing Built-ins

The order in which a name is resolved depends on the namespace (see [Flat Expression Syntax](./flat-syntax#function-names-and-namespaces)):

- Registered under the `anvillib` namespace and sharing a name with a built-in function (such as `anvillib:sqrt`): `sqrt(x)` in text is **always** the built-in function, and this datapack entry cannot be referenced
- Registered under another namespace and sharing a name with a built-in function (such as `mymod:sqrt`): `mymod:sqrt(x)` uses the copy in the registry, while the bare name `sqrt(x)` uses the built-in function

## Providing Functions in a Mod

`anvillib:function` is a datapack registry and **cannot be registered from code**: `RegisterEvent` only fires for the
registries in `BuiltInRegistries`, so a `DeferredRegister`'s entries are never registered here. To provide functions that
are referenced by name, put JSON into the mod's resources — the `data/` folder inside a mod jar is itself a datapack:

```
src/main/resources/data/mymod/anvillib/function/double.json
```

```json
{ "type": "anvillib:custom", "parameters": ["value"], "body": "$(value)*2" }
```

- When it sits under `data/<your own mod namespace>/anvillib/function/`, expressions must spell out the full name
  (`mymod:double(x)`); to use a bare name it has to live in the shared `anvillib` namespace
  (`data/anvillib/anvillib/function/`)
- The entry must be an `IFunction` that can be JSON-encoded: a custom implementation has to provide `Type.codec()`,
  otherwise fields will be missing when the datapack is loaded
- This JSON is synced to clients along with the datapack, so both `/reload` and joining a server pick it up

When code does not need to reference a function by name, building an inline call is enough and no datapack is needed:

```java
FunctionExpression call = FunctionExpression.of(
    CustomFunction.of(List.of("value"), NamedFunction.call("value")),
    IExpression.of(2.0)
);
```

An inline definition (`Holder.direct`) serializes along with the expression, but it has **no registry name**, so the whole
expression cannot be written as flat text and only the object form is available; referencing by name and spelling it as
text still require datapack JSON.

## Custom Function Types

When an entirely new codec form is needed, implement `IFunction` and its `Type`, then register the `Type` into `anvillib:function_type`:

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

- When using `apply(Call)` you must also override `parameters()` to declare the parameters, otherwise the argument count is validated against the default `Parameters.EMPTY` and `double(x)` reports an error on a count mismatch
- `Call.valueAt(int)` reads the number each parameter is bound to (for a variadic slot, the maximum of the list); to take the whole variadic list, use `call.bound().list("x")`
- If all you care about is "each parameter is bound to one number", you can override `applyBound(List<Double> arguments, Arguments bound)` instead; to control when arguments are evaluated yourself, override `apply(List<IExpression> arguments, Arguments inputs)`, which receives the **unevaluated** argument expressions
- When a function body recursively calls itself (or references another function mutually), evaluation has to go through `guarded(...)`, otherwise it ends in a `StackOverflowError`; `CustomFunction` and `LambdaFunction` already do this
- `Type` must provide `codec()`, `streamCodec()` and `getSerializedName()` together (`ISerializer` + `StringRepresentable`); both the network packet and the datapack side rely on them

When registering the type, point the `DeferredRegister` at `LibRegistries.FUNCTION_TYPE`; the namespace can simply be your own mod's:

```java
private static final DeferredRegister<IFunction.Type<?>> TYPES = DeferredRegister.create(
    LibRegistries.FUNCTION_TYPE,
    MyMod.MOD_ID
);

public static final DeferredHolder<IFunction.Type<?>, MyFunction.Type> DOUBLE =
    MyFunctionTypes.TYPES.register("double", MyFunction.Type::new);
```

`anvillib:function_type` is a **synced registry** (`RegistryBuilder.sync(true)`), so a type must be registered on both the client and the server, otherwise the other side cannot decode the network packet; the type name is exactly the `type` field in JSON, and after that you can write datapack entries under the new type:

```json
{ "type": "mymod:double" }
```

## Relation to Flat Text

- When parsing text, a name without a namespace is completed to `anvillib`, so **a function that should be referenced by a short name has to live in the `anvillib` namespace** (`data/anvillib/anvillib/function/`); functions under your own mod's namespace must be written in full (such as `mymod:double(x)`)
- Names are lowercased before parsing, so an entry whose registry path contains uppercase letters cannot be referenced
- Variables take priority over functions: a function named `x`, `y`, `z`, or `x0` cannot be referenced from text (and write-back falls back to the object form as well)
- A namespaced name queries the datapack registry first, then falls back by path to a built-in function of the same name, so `mymod:sqrt(x)` is equivalent to `sqrt(x)` when no `mymod:sqrt` is registered
- When writing text back, the function must be resolvable to a name from the registry (that is, a registry reference rather than an inline definition), otherwise the whole expression falls back to the object form
