---
title: Math Expression API
prev: false
next: false
---

# Expression API

The package `dev.anvilcraft.lib.v2.math.expression` provides the expression tree itself. The nodes of the tree fall into
two categories: a single function call (`FunctionExpression`), and a reference that reads a value by name
(`IExpression.Reference`).

## IExpression

The expression node interface, and the main entry point for using this module.

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

### Evaluation

| Method                          | Description                                                     |
|---------------------------------|-----------------------------------------------------------------|
| `evaluate(Arguments inputs)`    | Evaluates against the given inputs; both names and indices work |
| `evaluate(double... inputs)`    | Input values can only be referenced by index                    |
| `evaluateInt(Arguments inputs)` | Evaluates and rounds via `Math.round`                           |
| `evaluateInt(double... inputs)` | The combination of the two above                                |

`evaluate(double...)` is a convenience shorthand for `evaluate(Arguments.of(inputs))`, equivalent to binding a batch of
input values by index only.

```java
IExpression expression = IExpression.of(functions, "2x+1");
expression.evaluate(3);        // 7.0
expression.evaluateInt(3);     // 7
```

### Evaluation Semantics and Errors

This module deliberately lets "cannot be computed" degrade silently; only **structural errors** throw:

| Situation                                                                  | Result                                   |
|----------------------------------------------------------------------------|------------------------------------------|
| Division by zero `x/0`                                                     | `Infinity` / `-Infinity`; `0/0` is `NaN` |
| Negative square root `sqrt(-1)`                                            | `NaN`                                    |
| Index out of range `x9`                                                    | `0`                                      |
| Name not bound `$(nothing)`                                                | `0`                                      |
| Name bound to a variadic list, then read as a single value `$(x)`          | The **maximum** of the list              |
| Name bound to an empty list, then read as a single value `$(x)`            | `0`                                      |
| `$(name...)` in a position requiring a single number                       | Throws `IllegalStateException`           |
| The name in `$(name...)` is not bound to a list                            | Throws `IllegalArgumentException`        |
| Argument count does not match the parameter declaration (`IFunction.bind`) | Throws `IllegalArgumentException`        |
| A function body recursing more than 64 levels deep                         | Throws `IllegalStateException`           |

The boundary behaviour of the first three rows comes from Java's floating-point semantics and from the fallback in
`Arguments.value(int)`, and `NaN` keeps propagating through subsequent operations. To tell "missing" apart from "genuinely
0", you have no choice but to ensure the input values are complete yourself.

```java
IExpression.of(functions, "1/x").evaluate(0);          // Infinity
IExpression.of(functions, "sqrt(x)").evaluate(-1);     // NaN
IExpression.of(functions, "x9").evaluate(3);           // 0.0 (index 9 is out of range)
IExpression.of(functions, "$(cost)").evaluate(3);      // 0.0 (cost is not bound)
```

### evaluateInt Boundaries

`evaluateInt` follows the boundaries of `Math.round(double)`, unlike the functions above that preserve `NaN`: `NaN`
gives `0`, values beyond the `long` range saturate to `Long.MIN_VALUE`/`Long.MAX_VALUE`, and the final `(int)` cast still
wraps around in two's complement. So `evaluateInt(sqrt(-1))` is `0`, `round(1e300)` is `Long.MAX_VALUE`, and
`evaluateInt(3e9)` is negative; to tell these cases apart, look at the raw value from `evaluate` directly. Likewise, the
built-in `round` function has this boundary itself (`round(sqrt(-1))` is `0`, not `NaN`).

### Static Factories

```java
// Inline a number
FunctionExpression two = IExpression.of(2.0);

// Parse a piece of flat text (needs the function registry)
IExpression parsed = IExpression.of(functions, "2x+1");

// Inline a function call
FunctionExpression call = IExpression.of(LibBuiltInFunctions.SQRT, IExpression.of(9.0));
call.evaluate();   // 3.0

// A reference that reads a value by name; a name ending in "..." reads the whole list
IExpression named = IExpression.ref("cost");     // $(cost)
IExpression spread = IExpression.ref("x...");    // $(x...)
```

`IExpression.of(HolderGetter<IFunction>, String)` forwards directly to `FlatExpressionParser.parseValue`; invalid text
throws `IllegalArgumentException`, and on success the result enters the parse cache (see
[Cache and Lifecycle](./cache)).

### Codec Constants

| Constant               | Type                                                | Description                                                                                      |
|------------------------|-----------------------------------------------------|--------------------------------------------------------------------------------------------------|
| `CODEC`                | `Codec<IExpression>`                                | The three inline forms (number / flat text / object); write-back prefers the most concise branch |
| `FLAT_OR_OBJECT_CODEC` | `Codec<IExpression>`                                | Only the flat text and object branches; falls back to the object when text cannot be written     |
| `STREAM_CODEC`         | `StreamCodec<RegistryFriendlyByteBuf, IExpression>` | Network codec, bridged from `CODEC`                                                              |
| `LIST_CODEC`           | `Codec<List<IExpression>>`                          | A list of expressions (`CODEC.listOf()`)                                                         |

`FLAT_OR_OBJECT_CODEC` cannot be implemented with `Codec.xor`: the encoder of `xor` commits to a single branch and fails
outright when the text cannot be written, with no fallback to the object. Its decode order tries flat text first and
falls back to the object form on failure; `CODEC` has one more branch, the number, in front. See
[Inlining and Codecs](./inline-expression) for the three forms and the write-back priority.

## FunctionExpression

The call node of the expression tree: a function plus its arguments.

```java
public record FunctionExpression(Holder<IFunction> function, List<IExpression> arguments)
        implements IExpression {
    public static FunctionExpression of(IFunction function, IExpression... arguments) { ... }
    public static FunctionExpression of(Holder<IFunction> function, IExpression... arguments) { ... }
    public double evaluate(Arguments inputs) { ... }
}
```

- `function` is a `Holder<IFunction>`: a **registry reference** (`Holder.Reference`) denotes a function defined by
  datapack JSON, while an **inline `Holder.direct`** denotes a function serialized together with the expression
  (built-in functions, constants, `x`, lambdas, function bodies)
- `arguments` is copied into an immutable list on construction
- Evaluation hands the **unevaluated** argument expressions together with the current context to `IFunction.apply`, and
  the function itself decides when and in which context to evaluate them: an ordinary function evaluates its arguments in
  the call-site context and binds them by parameter name, while a lambda first switches to its own parameter bindings and
  then evaluates the body

```java
// A reference to a datapack function
Holder<IFunction> triple = functions.get(ResourceKey.create(LibRegistries.FUNCTION_KEY, AnvilLibMath.of("triple")))
    .orElseThrow();

// Inline a built-in function
FunctionExpression call = FunctionExpression.of(
    LibBuiltInFunctions.MULTIPLY,
    IExpression.of(2.0),
    InputFunction.call(0)
);
call.evaluate(3); // 6.0
```

`FunctionExpression` carries three sets of codecs of its own: `MAP_CODEC` (the object form
`{"function": …, "arguments": […]}`), `CODEC` (the same, as a `Codec`), and `STREAM_CODEC` (network). The `function`
field of the object form is determined by `IFunction.HOLDER_CODEC`: a function from the registry is written as a
**registry name string**, an inline definition as an **object**:

```json
{ "function": "anvillib:triple", "arguments": ["x"] }
```

```json
{ "function": { "type": "anvillib:builtin", "builtin": "sqrt" }, "arguments": [9] }
```

## IExpression.Reference

An argument that reads a value by name is not a function call but a separate reference node:

```java
public sealed interface Reference extends IExpression permits Reference.Named, Reference.Spread {
    String name();

    record Named(String name) implements Reference { ... }    // $(name)
    record Spread(String name) implements Reference { ... }   // $(name...)
}
```

- `$(name)` (`Reference.Named`) reads a single number; when `name` is bound to a variadic it yields the **maximum** of
  the list
- `$(name...)` (`Reference.Spread`) reads the **whole list** itself, and `name()` carries no `...` (the suffix is
  stripped inside `IExpression.ref`). It is not a number, so it can only be passed to a variadic parameter position;
  using it where a single number is required throws `IllegalStateException` at evaluation time
- A whole list handed to a variadic position is **spread out**: `min($(x...), 4)` with `x = [9, 2, 7]` is
  `min(9, 2, 7, 4)`
- A reference node reads values by **name** only, and the name binding is provided by the calling context (the input
  values at the call site, or the parameter bindings of the current call)

```java
// The two kinds of reference
IExpression named = IExpression.ref("cost");     // Reference.Named
IExpression spread = IExpression.ref("x...");    // Reference.Spread (when the name ends in ...; the suffix is stripped on construction, so name() is "x")

// Evaluate directly: a $() reference depends on the name binding in the context
named.evaluate(Arguments.of(List.of(3.0), List.of("cost"), List.of(new Arguments.Value.Single(42)))); // 42.0
```

`$(x)` and `x` are **not equivalent** at evaluation time: `x` is `InputFunction(0)` and reads by input index, while
`$(x)` is `Reference.Named("x")` and reads by name binding. The two give the same result only when `x` is not bound as a
name and happens to be the 0th input value (both are 0, or both are that value). In flat text the two are written
differently, and write-back emits each in its own form.

## Arguments

The set of input values for an evaluation, addressable both by index and by name. A name binding holds one of two kinds
of value: a single number, or the sequence of numbers from a variadic binding.

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

| Method                  | Description                                                                                                                                                                            |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `value(int index)`      | Reads a number by index; returns `0` when `index < 0` or out of range                                                                                                                  |
| `value(String name)`    | Reads a number by name: returns `0` when unbound, the **maximum** of the list when bound to a list, and `0` when bound to an empty list                                                |
| `list(String name)`     | Reads the whole list by name; returns an **empty list** when unbound or bound to a single number                                                                                       |
| `isList(String name)`   | Whether the name is bound to a list. `list` cannot tell a misspelled name from a binding to an empty list; this distinguishes them: the former means the name in `$(name...)` is wrong |
| `withAll(names, bound)` | Adds a batch of bindings on top of the existing ones, the new value winning for the same name, and returns a new instance (the original is unchanged)                                  |

Names come from two kinds of binding: the **input values provided at the call site**, and the **name bindings the call
currently being evaluated establishes for its parameters** (`IFunction.bind` calls `withAll` internally). Parameter
bindings override call-site input values of the same name.

```java
// Index only
double a = expression.evaluate(3, 5, 7);

// Index and named values mixed
Arguments inputs = Arguments.of(List.of(3.0), List.of("cost"), List.of(new Arguments.Value.Single(10)));
double b = expression.evaluate(inputs);

// Variadic binding: the name is bound to a list
Arguments spread = Arguments.of(List.of(), List.of("xs"), List.of(new Arguments.Value.Many(List.of(1.0, 2.0, 3.0))));
spread.value("xs");   // 3.0, the maximum of the list
spread.list("xs");    // [1.0, 2.0, 3.0]
spread.isList("xs");  // true
spread.isList("typo");// false
```

`Arguments` is itself an immutable record (construction copies `values`, `named`, and the lists inside `Value.Many`), so
the same instance can safely be reused across multiple evaluations.
