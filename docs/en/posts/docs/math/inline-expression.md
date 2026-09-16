---
title: Math Inlining & Codecs
prev: false
next: false
---

# Inline Forms and Codecs

`IExpression.CODEC` accepts all three ways of writing at once, and picks by the same priority when writing back. `FunctionExpression.CODEC` is only the **object form** among them; the number and flat text branches are covered by `IExpression.CODEC`.

## The Three Inline Forms

### Number

A JSON number is a zero-argument call of `ConstantFunction`.

```json
7
```

### Flat Text

A string is the parsed call tree, and parsing it needs the function registry.

```json
"2x+1"
```

### Object Form

An explicit function plus arguments; `arguments` is treated as an empty list when omitted.

The `function` field is decided by `IFunction.HOLDER_CODEC` (`RegistryFileCodec`), and both ways of writing it are accepted:

```json
{
  "function": "anvillib:triple",
  "arguments": ["x"]
}
```

```json
{
  "function": {
    "type": "anvillib:constant",
    "value": 4
  }
}
```

```json
{
  "function": {
    "type": "anvillib:builtin",
    "builtin": "pow"
  },
  "arguments": [
    "x",
    2
  ]
}
```

- A function in the registry (defined by datapack JSON) is written as a **registry name string**, and reads back as a `Holder.Reference`
- An inline definition is written as an **object**, whose first-level field `type` is the function type (`anvillib:builtin`, `anvillib:constant`, `anvillib:custom`, `anvillib:lambda`, `anvillib:input`, `anvillib:named`, or a type registered downstream), and whose remaining fields are decided by that type's `MapCodec`
- The string form requires `RegistryOps`: without a registry the entry cannot be read, and it reports `Failed to get element ResourceKey[...]`

The three ways of writing are equivalent to each other; for example, the two JSON documents below parse into the **same expression tree**:

```json
"2x+1"
```

```json
{
  "function": { "type": "anvillib:builtin", "builtin": "add" },
  "arguments": [
    {
      "function": { "type": "anvillib:builtin", "builtin": "multiply" },
      "arguments": [2, "x"]
    },
    1
  ]
}
```

A lambda is a value and can be written in the object form too: its function type is `anvillib:lambda`, and its fields are `parameters` and `body`, the same as `anvillib:custom`. A lambda that can be expressed as flat text is written as text such as `x -> $(x)*2` in preference, and only falls back to the object form when it cannot be.

```json
{
  "function": {
    "type": "anvillib:lambda",
    "parameters": ["x"],
    "body": "$(x)*2"
  }
}
```

## Write-Back Priority

Encoding tries the following in order:

1. **Number** — the whole tree is a zero-argument `ConstantFunction` call (`ConstantFunction.value(FunctionExpression)` can extract the constant value)
2. **Flat text** — the whole tree can be expressed as flat text
3. **Object form** — everything else

In other words, as long as the function can be resolved to a name in the `anvillib:function` registry it is written as flat text; when it cannot be resolved (an inline function definition, such as a built-in function) or a node cannot be written as text, it falls back to the object form. Non-finite constants (`NaN`, infinity) cannot be written as flat text — the parser does not accept literals that overflow into infinity either — so do not treat non-finite values as serializable constants, and the various `DynamicOps` do not support them consistently.

```java
// A reference to a function in the registry -> written as flat text
DataResult<JsonElement> asText = IExpression.CODEC.encodeStart(ops, parsed);   // "2x+1"

// Inline a datapack custom function -> written as an object
DataResult<JsonElement> asObject = IExpression.CODEC.encodeStart(ops, inlineCall);
```

Write-back is not "best effort": `FlatExpressionWriter` re-parses the text it wrote and writes it once more, and when the two disagree or what reads back is not the same tree, it is judged unwritable and handed to the object form. Therefore any text written can be read back as the same tree, at the cost of encoding taking about twice the tree size (and writing the text into the parse cache, see [Caching & Lifecycle](./cache)).

## RegistryOps Requirement

Parsing and writing back flat text both consult the `anvillib:function` registry, so the branches involving text and reference strings only accept `RegistryOps`:

| Branch                                  | Behaviour without `RegistryOps`                                                                                  |
|-----------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Number                                  | Available                                                                                                        |
| Flat text (read and write)              | Returns the error `Cannot access registry ResourceKey[minecraft:root / anvillib:function], use RegistryOps`       |
| Object form + inline function definition | Available                                                                                                        |
| Object form + registry name string      | The entry cannot be read (`Failed to get element ...`)                                                           |

```java
RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, registryAccess);
IExpression expression = IExpression.CODEC.parse(ops, json).getOrThrow();
```

When parsing fails, `IExpression.CODEC` discards the error from the flat branch and reports the object branch's error instead, so to see the text errors above you have to call `FlatExpressionParser.codec()` directly. For the full error message table see [Flat Expression Syntax](./flat-syntax#parse-error-messages).

## Codec Constants Reference

On the expression side:

| Constant                            | Type                                                       | Description                                                                   |
|-------------------------------------|------------------------------------------------------------|-------------------------------------------------------------------------------|
| `IExpression.CODEC`                 | `Codec<IExpression>`                                       | The number / flat text / object branches, chosen by priority when writing back |
| `IExpression.FLAT_OR_OBJECT_CODEC`  | `Codec<IExpression>`                                       | Only the text and object branches                                             |
| `IExpression.LIST_CODEC`            | `Codec<List<IExpression>>`                                 | Argument list (`CODEC.listOf()`)                                              |
| `IExpression.STREAM_CODEC`          | `StreamCodec<RegistryFriendlyByteBuf, IExpression>`        | Network codec, bridged from `CODEC`                                           |
| `FunctionExpression.MAP_CODEC`      | `MapCodec<FunctionExpression>`                             | Object form, used as a map codec                                              |
| `FunctionExpression.CODEC`          | `Codec<FunctionExpression>`                                | Object form                                                                   |
| `FunctionExpression.STREAM_CODEC`   | `StreamCodec<RegistryFriendlyByteBuf, FunctionExpression>` | Network codec of one call                                                     |

On the function side:

| Constant                                | Description                                                                              |
|-----------------------------------------|------------------------------------------------------------------------------------------|
| `IFunction.DIRECT_CODEC`                | Inline definition, dispatched by `type()`                                                |
| `IFunction.HOLDER_CODEC`                | A registry name string or an inline object, read back as `Holder<IFunction>`              |
| `IFunction.CODEC`                       | `IFunction` itself: prefers a reference when writing, falls back to inline; decoding goes through `HOLDER_CODEC` |
| `IFunction.HOLDER_STREAM_CODEC`         | Transports a function by registry reference                                              |
| `IFunction.STREAM_CODEC`                | Inline definition, dispatched by `type()`                                                |
| `ConstantFunction.CODEC`                | `Codec<Double>`; the inline form of a constant is just a number                          |
| Each type's `MAP_CODEC` / `STREAM_CODEC` | Exposed by `Type.codec()` / `Type.streamCodec()`                                        |

## Network Codecs

`IExpression.STREAM_CODEC` is bridged from `CODEC`, goes through registry sync, and can be put into packets and data components:

```java
StreamCodec<RegistryFriendlyByteBuf, IExpression> STREAM_CODEC = IExpression.defer(
    () -> ByteBufCodecs.fromCodecWithRegistries(IExpression.CODEC).cast()
);
```

- `FunctionExpression.STREAM_CODEC` and `IFunction.HOLDER_STREAM_CODEC` are used respectively to transport a whole call node and to transport a function by reference (`ByteBufCodecs.holderRegistry(LibRegistries.FUNCTION_KEY)`)
- On the network path an inline definition is written into the byte stream in full while a registry reference writes only an id, so the registries on both ends must agree: `anvillib:function` is a datapack registry, synced by vanilla; `anvillib:function_type` is a synced registry with `sync(true)`, and function types added downstream must be registered on both ends
- Encoding the same expression twice gives the same bytes; both flat text and the object form can be read back over the network (both are within what `CODEC` accepts)
- After the client receives the new registry, the old parse cache is not collected automatically; it is cleared once on disconnect, see [Caching & Lifecycle](./cache)

```java
RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), registryAccess);
IExpression.STREAM_CODEC.encode(buf, expression);
IExpression decoded = IExpression.STREAM_CODEC.decode(buf);
```

## The Built-in Function Type

Built-in functions are carried by the `anvillib:builtin` type that `LibBuiltInFunctions` ships, and the specific function is distinguished by the `builtin` field:

```json
{ "type": "anvillib:builtin", "builtin": "sqrt" }
```

The value of the `builtin` field is the lowercased form of a `LibBuiltInFunctions` enum name (`ADD` → `add`), so `{"type": "anvillib:builtin", "builtin": "add"}` is the same function as `+` in flat text. Built-in functions do not belong to the `anvillib:function` registry, so in JSON they always appear as inline definitions and are never written as a reference string such as `"anvillib:sqrt"`.
