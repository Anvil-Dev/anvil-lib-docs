---
title: Math Function System
prev: false
next: false
---

# Function System

The package `dev.anvilcraft.lib.v2.math.expression.function` provides function definitions, evaluation and codecs. A
function is a **typed object**: the `Type` descriptor decides how it is encoded and decoded first, and then the
`IFunction` itself decides how it evaluates.

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

| Method                         | Description                                                                                                                                                                                                                                         |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `apply(arguments, inputs)`     | Produces the result of this call; `arguments` holds the **unevaluated** argument expressions, and the function itself decides in which context to evaluate them                                                                                     |
| `apply(call)`                  | Convenience overload: the arguments are already bound to the parameters, `call.valueAt(int)` reads the number in one slot and `call.bound()` the bound context                                                                                      |
| `applyBound(arguments, bound)` | An entry point that only sees numbers and a context: a fixed parameter slot is the number it was bound to and a variadic slot the maximum of the list; function types that only care about "every parameter is bound to one number" may override it |
| `parameters()`                 | The parameter declaration, `Parameters.EMPTY` by default, which suits zero-parameter function types                                                                                                                                                 |
| `type()`                       | Returns the `Type` descriptor that decides how this function is encoded and decoded                                                                                                                                                                 |
| `guarded(description, body)`   | Evaluates inside the call depth guard and throws a readable exception when the depth is exceeded (see [Call Depth Guard](#call-depth-guard))                                                                                                        |

The default `apply(arguments, inputs)` validates the argument count against `parameters()`, evaluates every argument in
the call-site context, and then binds them into names by position and hands them to `apply(Call)`; a function type with no
parameter declaration, or one that wants to control when its arguments are evaluated, should override it. The default
implementation of `applyBound` throws `IllegalStateException` outright, reminding implementers to pick one of the two.

`IFunction.Type` is both an `ISerializer` (`dev.anvilcraft.lib.v2.util.ISerializer`, from the util module) and a
`StringRepresentable`: `getSerializedName()` is exactly its path in the `anvillib:function_type` registry, `codec()` is
the `MapCodec` on the JSON side, and `streamCodec()` the `StreamCodec` on the network side.

### Codec Constants

| Constant              | Description                                                                                                           |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------|
| `DIRECT_CODEC`        | The inline form, dispatched through `type()` to the matching `Type.codec()`                                           |
| `HOLDER_CODEC`        | A reference to an `anvillib:function` entry, also used for inline definitions (`RegistryFileCodec`)                   |
| `HOLDER_STREAM_CODEC` | Transports a function by reference (`ByteBufCodecs.holderRegistry`)                                                   |
| `STREAM_CODEC`        | The inline form, dispatched through `type()` to `Type.streamCodec()`                                                  |
| `CODEC`               | Prefers an existing reference in the registry and degrades to an inline definition when no referable entry is found   |
| `getter(DynamicOps)`  | Extracts the function registry from dynamic ops, returning `null` when unavailable (only `RegistryOps` is recognised) |

The two spellings of `HOLDER_CODEC` are decided by `RegistryFileCodec`: when the function is a registry entry it is
written as a **registry name string**, and when it is an inline definition it is written as an **object**:

```json
"anvillib:triple"
```

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

`CODEC` only overrides the encoder: it looks for the same entry in the registry by value, writing a reference when it
finds one and an inline definition when it does not; decoding always goes through `HOLDER_CODEC`, so reading the reference
form needs `RegistryOps`.

### Parameter and Parameters

The parameter declaration returned by `parameters()` is a set of value objects:

```java
public record Parameter(String name, boolean variadic) {
    public static final String VARIADIC_SUFFIX = "...";
    public static Parameter parse(String declaration) { ... }   // "x..." is variadic
    public String declaration() { ... }                        // a variadic carries ...
    public int minimumCount() { ... }                          // 1 for a fixed parameter, 0 for a variadic
    public static @Nullable Parameter variadicOf(List<Parameter> parameters) { ... }
}

public record Parameters(List<Parameter> parameters) {
    public static final Parameters EMPTY = new Parameters(List.of());
    public static Parameters parse(List<String> declarations) { ... }   // one ending in "..." is variadic
    public static Parameters of(List<String> names) { ... }             // every one taken as fixed
    public boolean isEmpty() { ... }
    public int size() { ... }
    public List<String> names() { ... }            // variadic names without ...
    public List<String> declarations() { ... }     // variadic names with ...
    public @Nullable Parameter variadic() { ... }  // null when there is no variadic
    public boolean variadicExists() { ... }
    public int fixedCount() { ... }                // the number of parameters that are not variadic
    public int minimumArity() { ... }
    public int maximumArity() { ... }              // Integer.MAX_VALUE when there is a variadic
    public void checkArity(int size) { ... }
    public void checkArity(List<IExpression> arguments) { ... }
    public String range() { ... }                  // "2", "at least 1", "1 to 3"
}
```

Rules:

- A parameter name must be an identifier: the first character is a letter or an underscore, and the rest are letters,
  digits or underscores. A name containing a space or a character such as `)` is rejected **at construction time**,
  instead of the failure only surfacing when the text cannot be written back
- A name ending in `...` is variadic (`Parameter.VARIADIC_SUFFIX`); the suffix is stripped when storing, so a variadic
  name in `names()` carries no `...`
- A signature allows **at most one** variadic parameter; a second one throws
  `IllegalArgumentException: At most one variadic parameter is allowed` outright
- A variadic may appear at **any position**, not only last: it takes "the total number of arguments minus the number of
  fixed parameters" arguments, and the fixed parameters before and after it still get their values
- A variadic follows Java's varargs semantics with a **lower bound of 0** (`minimumCount()` returns 0), so `min()` is
  valid; not one fixed parameter may be missing
- A duplicate name throws `IllegalArgumentException: Duplicate parameter name '<name>'`; an empty name throws
  `Parameter name cannot be empty`

`checkArity(int)` is for the case where "the argument count is known", and `checkArity(List<IExpression>)` for the case
where "the arguments are still expressions": the latter treats a whole-list reference such as `$(name...)` as a range that
may be spread out, and only reports an error when "even after spreading out it cannot possibly be valid" (when the
function has no variadic parameter, not one fixed parameter slot can take a list). The parser,
`LibBuiltInFunctions.call`/`callChecked` and `IFunction.bind` share these two checks, so the error wording never ends up
with two versions.

### Call Depth Guard

A function body can reference any function in the registry by name, including itself, so self-references and mutual
references must be stopped at evaluation time, or the outcome is a `StackOverflowError`:

- `MAX_CALL_DEPTH = 64`: the maximum call depth allowed on the current thread
- `CALL_DEPTH`: a `ThreadLocal<Integer>` recording the current depth of the same thread
- `guarded(description, body)`: throws `IllegalStateException: Function call depth exceeded 64 at <description>` when the
  depth has already reached the limit; otherwise it increments the depth, runs `body`, and restores it in a `finally`
  (the exceptional path does not pollute later calls either)

`CustomFunction` and `LambdaFunction` both go through the same guard (their descriptions are `parameters [...]` and
`lambda [...]` respectively), so two lambdas that are **registered in the registry and call each other by name** are
stopped as well, not only a cycle that passes through `CustomFunction`. A normal function body comes nowhere near 64
levels, so the cost is negligible.

### Argument Binding

`bind(arguments, inputs, parameters)` is the "argument → parameter" matching logic, and can be used directly when
overriding `apply`:

1. Evaluate the arguments one by one: a reference to a whole variadic list (`IExpression.Reference.Spread`) is not
   evaluated and has the list bound to it directly, and a name that is not bound to a list first reports
   `$(name...) is not bound to a list`
2. Match by **argument count**: the variadic first reserves a slot for every fixed parameter after it, and only what
   remains belongs to it; `$(name...)` then spreads out from the variadic slot and occupies a number of slots
3. When the spread-out elements exceed what that slot can take, it throws
   `IllegalStateException: <argument> provides N arguments but this position takes M`; when a whole list lands in a fixed
   parameter slot, it throws `<argument> is a list and can only be passed to a variadic parameter`

The matching result is packaged as `Call(references, values, bound)`: `references` are the original argument expressions,
`values` are the numbers each parameter was bound to (a variadic slot holds the maximum of the list), and `bound` is the
new context of "call-site input values + this call's parameter bindings", which is where `$(name)` in a function body
reads its value from.

## Built-in Functions

Built-in functions are defined by `LibBuiltInFunctions`, which is itself an `IFunction` enum: every enum constant both
carries parameter names and evaluation behaviour and is a node in the expression tree, with no intermediate
representation. Lookup goes through the hardcoded enum matching in `byName` and takes up **no** entry in the
`anvillib:function` registry — that is a datapack registry, filled from JSON only when a datapack loads; built-in
functions are therefore always written as inline definitions when serializing.

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

    public static void register(IEventBus modEventBus) { ... }   // called by AnvilLibMath
    public static @Nullable LibBuiltInFunctions byName(String name) { ... }   // case-insensitive
    public Parameters parameters() { ... }
    public int minimumArity() { ... }
    public int maximumArity() { ... }
    public Identifier id() { ... }                                 // anvillib:<lowercased enum name>
    public FunctionExpression call(IExpression... arguments) { ... }
    public FunctionExpression call(List<IExpression> arguments) { ... }
    public DataResult<FunctionExpression> callChecked(List<IExpression> arguments) { ... }
}
```

### All Constants

| Constant   | Parameters         | Argument count | Evaluation behaviour                                                      |
|------------|--------------------|----------------|---------------------------------------------------------------------------|
| `ADD`      | `a`, `b`           | 2              | `a + b`                                                                   |
| `SUBTRACT` | `a`, `b`           | 2              | `a - b`                                                                   |
| `MULTIPLY` | `a`, `b`           | 2              | `a * b`                                                                   |
| `DIVIDE`   | `a`, `b`           | 2              | `a / b`, without checking for division by zero                            |
| `ABS`      | `value`            | 1              | `Math.abs`                                                                |
| `FLOOR`    | `value`            | 1              | `Math.floor`                                                              |
| `CEIL`     | `value`            | 1              | `Math.ceil`                                                               |
| `ROUND`    | `value`            | 1              | `Math.round`; `NaN` gives 0, values beyond the `long` range saturate      |
| `SQRT`     | `value`            | 1              | `Math.sqrt`; a negative number gives `NaN`                                |
| `POW`      | `base`, `exponent` | 2              | `Math.pow`, equivalent to `^`                                             |
| `MIN`      | `x...`             | ≥ 0            | The minimum of the variadic list; an empty list returns 0                 |
| `MAX`      | `x...`             | ≥ 0            | The maximum of the variadic list; an empty list returns 0                 |
| `FOREACH`  | `x...`, `function` | ≥ 1            | The last slot is a lambda; returns the sum of the individual call results |

The registry name (`id()`) is the lowercased enum name (`ADD` → `anvillib:add`), and `byName` lookup is
case-insensitive. `MIN`/`MAX` fetch the whole variadic list by name (`call.bound().list("x")`), so an empty list is
distinguishable from "a single 0".

### foreach

`foreach` is the only built-in that takes a lambda: the last argument must be a lambda, the arguments before it form the
list being iterated over, and the return value is the sum of the individual call results.

```java
// Equivalent to the flat text "foreach(1,2,3,x -> $(x)*2)", evaluating to 12.0
LibBuiltInFunctions.FOREACH.call(
    IExpression.of(1), IExpression.of(2), IExpression.of(3),
    LambdaFunction.call("x", LibBuiltInFunctions.MULTIPLY.call(IExpression.ref("x"), IExpression.of(2)))
);
```

- When a variadic slot holds `$(x...)` it receives the whole list, so a variadic custom function can write
  `foreach($(x...), item -> $(item)*2)` to iterate over the variadic it cannot unpack itself
- The whole list is **spread out** into the iterated list: `$(x...)` with `x = [1, 2, 3]` contributes three values
- A name that is not bound to a list is named in the error: `$(typo...)` throws
  `IllegalArgumentException: $(typo...) is not bound to a list`, instead of silently being taken as an empty list and
  returning 0
- The lambda is fed one value at a time, so a lambda whose parameter list starts with a variadic is rejected
  (`IllegalArgumentException`)
- When the last slot is not a lambda it throws
  `IllegalArgumentException: forEach expects a lambda as its last argument but got <argument>`
- These rules all run **at evaluation time**: the parser and the writer have no special handling for `foreach`, and the
  parameter declaration `["x...", "function"]` of `foreach` only keeps the arity validation consistent

### Invocation

```java
// Builds a call node; throws IllegalArgumentException on an invalid argument count
FunctionExpression call = LibBuiltInFunctions.SQRT.call(IExpression.of(9.0));

// Use the DataResult variant when you want to handle the error yourself
DataResult<FunctionExpression> result = LibBuiltInFunctions.POW.callChecked(List.of(
    IExpression.of(2.0),
    IExpression.of(3.0)
));
```

| Method                           | On an invalid argument count                                                |
|----------------------------------|-----------------------------------------------------------------------------|
| `call(IExpression...)`           | Throws `IllegalArgumentException`                                           |
| `call(List<IExpression>)`        | Throws `IllegalArgumentException`                                           |
| `callChecked(List<IExpression>)` | Returns `DataResult.error`, with the message prefixed by `Function <name> ` |

Arity validation goes through `Parameters.checkArity(List<IExpression>)`, the same set of rules as parsing: `$(x...)`
may only land in a variadic parameter slot, and a built-in without a variadic parameter (such as `sqrt`) stops `$(x...)`
right here, instead of building a call that only blows up at evaluation time.

The type `LibBuiltInFunctions` ships with is `anvillib:builtin`, and JSON distinguishes the specific function with the
`builtin` field:

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

## Common Types

The types of everything that is not a built-in are registered by `LibFunctionTypes` (namespace `anvillib`):

| Field      | Registry name       | Implementation     | JSON field                       |
|------------|---------------------|--------------------|----------------------------------|
| `INPUT`    | `anvillib:input`    | `InputFunction`    | `index` (a non-negative integer) |
| `NAMED`    | `anvillib:named`    | `NamedFunction`    | `name`                           |
| `CONSTANT` | `anvillib:constant` | `ConstantFunction` | `value`                          |
| `CUSTOM`   | `anvillib:custom`   | `CustomFunction`   | `parameters`, `body`             |
| `LAMBDA`   | `anvillib:lambda`   | `LambdaFunction`   | `parameters`, `body`             |

```java
public static final DeferredHolder<IFunction.Type<?>, InputFunction.Type> INPUT = DF
    .register("input", InputFunction.Type::new);
// ... NAMED / CONSTANT / CUSTOM / LAMBDA
public static void register(IEventBus bus) { DF.register(bus); }
```

Every type implements `IFunction.Type<F>` (`codec()` + `streamCodec()` + `getSerializedName()`). To add a brand-new type
downstream, register your own `Type` following the same pattern; see
[Custom Functions](./custom-function#custom-function-types).

### InputFunction

An input value referenced by index at evaluation time, with the JSON field `index`, which must be a non-negative integer;
an out-of-range index gives 0. The `x` / `y` / `z` in an expression are the zero-argument calls with an `index` of 0 / 1 /
2, and `x3` is the zero-argument call with an `index` of 3.

```json
{ "type": "anvillib:input", "index": 0 }
```

```java
IExpression x = InputFunction.call(0);        // x
IExpression third = InputFunction.call(3);    // x3
```

### NamedFunction

An input value referenced by name at evaluation time, `record NamedFunction(String name)`, with the JSON field `name`. It
gives 0 when unbound and the maximum of the list when bound to a list.

```json
{ "type": "anvillib:named", "name": "cost" }
```

```java
// Zero-argument call: $(name)
FunctionExpression call = NamedFunction.call("cost");
```

The `$(name)` in flat text parses into the reference node `IExpression.Reference.Named` (constructed with
`IExpression.ref("cost")`), and `$(name...)` into `IExpression.Reference.Spread`; neither is the zero-argument call here
— the difference is that a reference node reads its value purely through name bindings, whereas `NamedFunction` is an
ordinary function call (see [Expression API](./expression#iexpression)).

### ConstantFunction

Takes no arguments and always evaluates to a fixed number, with the JSON field `value`. A numeric literal in an
expression tree is its zero-argument call.

```json
{ "type": "anvillib:constant", "value": 2 }
```

```java
// These two spellings are equivalent
IExpression a = IExpression.of(2.0);
IExpression b = ConstantFunction.of(2).call();

// Checks whether a call is a constant and reads the constant value
Optional<Double> value = ConstantFunction.value(someCall);
```

The type of `ConstantFunction.CODEC` is exactly `Codec<Double>`, which is why a constant inlines as a bare number in an
expression; `value(FunctionExpression)` only returns `Optional.of(...)` when "there are zero arguments + the single
argument is a `ConstantFunction`", and encoding relies on exactly that to decide whether to write a number.

### CustomFunction

`record CustomFunction(Parameters parameters, IExpression body)`, with the JSON fields `parameters` and `body`. At
evaluation time the arguments are evaluated in the call-site context and the body in the context after the parameter
bindings, so the body can read both the parameters and the names of the call site. See
[Custom Functions](./custom-function).

```java
CustomFunction.of(List.of("a", "x..."), body);   // By declaration text; "x..." is variadic
CustomFunction.named(List.of("a", "b"), body);   // By parameter name, every one taken as fixed
```

### LambdaFunction

A lambda is a function type too: `record LambdaFunction(Parameters parameters, IExpression body)`, registry name
`anvillib:lambda`, with the same JSON fields `parameters` and `body`, written as `x -> $(x)*2` in flat text.

```java
LambdaFunction.of(List.of("x"), body);        // By declaration text; one ending in "x..." is variadic
LambdaFunction.named(List.of("x"), body);     // By parameter name, every one taken as fixed
LambdaFunction.call("x", body);               // One call of a single-parameter lambda
```

```json
{
  "type": "anvillib:lambda",
  "parameters": ["x"],
  "body": "$(x)*2"
}
```

A lambda is a **closure**: the body reuses the input values from the evaluation site, and the parameter bindings only
shadow same-named input values. It can only be passed as an argument to another function (such as the built-in
`foreach`); evaluating one on its own has no arguments to bind. A zero-parameter lambda (`parameters: []`) is valid in
the object form but cannot be written as flat text — an empty parameter string in text is read as a "missing parameter
name", so it can only fall back to the object form.

## Using Functions from Code

`anvillib:function` is a **datapack registry** and cannot be registered from code: NeoForge's `RegisterEvent` only fires
for the registries in `BuiltInRegistries` (`GameData.postRegisterEvents` iterates exactly that set), and a datapack
registry is not among them. Entries of `DeferredRegister.create(LibRegistries.FUNCTION_KEY, …)` are therefore never
registered, and only throw an unresolved-holder exception once `DeferredHolder.get()` is called. Code has two ways to use
functions:

**1. Ship the function as datapack JSON in the mod's own resources** — the `data/` folder inside a mod jar is itself a
datapack:

```json
// src/main/resources/data/mymod/anvillib/function/double.json
{ "type": "anvillib:custom", "parameters": ["value"], "body": "$(value)*2" }
```

**2. Build an inline call directly** — it bypasses the registry, and the function definition serializes along with the
expression:

```java
// An inline definition of a custom function
FunctionExpression call = FunctionExpression.of(
    CustomFunction.of(List.of("value"), NamedFunction.call("value")),
    IExpression.of(2.0)
);

// Ready-made implementations can be inlined just as well
FunctionExpression sqrt = LibBuiltInFunctions.SQRT.call(IExpression.of(9.0));
```

- An inline definition is a `Holder.direct` while a registry entry is a `Holder.Reference`; the two are written
  differently in the object form (`{"function": {…}}` versus `{"function": "namespace:name"}`), see
  [Inlining and Codecs](./inline-expression#object-form)
- An inline definition has **no registry name**, so the whole expression cannot be written as flat text and falls back to
  the object form; to have the expression spell it as text such as `double(x)`, it has to come from datapack JSON
- The namespace the datapack JSON sits in decides how it is referenced: under `data/anvillib/anvillib/function/` the bare
  name `double(x)` works, while under your own mod's namespace the full name (`mymod:double(x)`) is required
- An entry whose name contains uppercase letters **cannot be referenced** in flat text (names are lowercased before
  parsing), but the object-form reference still works

For the full story on writing a custom `IFunction` implementation and a custom function type, see
[Custom Functions](./custom-function).
