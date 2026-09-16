---
title: Math Flat Syntax
prev: false
next: false
---

# Flat Expression Syntax

`FlatExpressionParser` parses text such as `x*2`, `2x` or `2$(cost)+1` into an expression tree, while
`FlatExpressionWriter` (package-private) handles the opposite direction, writing it back. Parsing and writing back share
the same set of rules for "what kind of name can be written out", so the two sides cannot drift apart.

## Literals and References

| Syntax                 | Meaning                                                                    |
|------------------------|----------------------------------------------------------------------------|
| `2`, `2.5`, `.5`, `1.` | Numeric constant (both a leading and a trailing dot are accepted)          |
| `1e3`, `-5.0E-4`       | Exponent notation; the exponent must be 1–8 digits                         |
| `x`, `y`, `z`          | The 0th, 1st and 2nd input value                                           |
| `x0`, `x1`, `x12`      | Input values referenced by index                                           |
| `$(name)`              | Input value referenced by name                                             |
| `$(name...)`           | The whole variadic list; only usable as an argument of a variadic function |
| `sqrt(x)`              | Function call                                                              |
| `anvillib:sqrt(x)`     | Function call with a namespace                                             |

- `$(name)` reads one number; when `name` is bound to a variadic it yields the **maximum** of the list
- `$(name...)` reads the **whole list** itself; it is not a number, so using it where a single number is required reports
  an error at evaluation time
- A whole list passed to a variadic position is **spread out**: `min($(x...), 4)` with `x = [9, 2, 7]` is
  `min(9, 2, 7, 4)`
- The payload of `$(...)` is scanned up to the **first** `)`, with no handling of nesting or escaping, and whitespace on
  either side is stripped, so `$( cost )` is equivalent to `$(cost)`
- `x` is an alias for `<input 0>`, `y` for `<input 1>` and `z` for `<input 2>`, and any other index is written
  `x<number>`; an index beyond the `int` range reports `input index is too large: '<number>'` at parse time
- `x` and `$(x)` are **not the same thing**: the former reads by index and the latter by name binding, and they only
  give the same result when the name and the position happen to coincide
- The identifier character set starts with `[A-Za-z_]` and continues with `[A-Za-z0-9_:.]`, so `a.b` and `ns:name` are
  each **one** token, and `x.y` is taken as an unknown function rather than `x` times `y`

## Operators

| Operator          | Spelling              | Precedence | Associativity |
|-------------------|-----------------------|------------|---------------|
| Lambda arrow      | `->`                  | lowest     | right         |
| Add, subtract     | `+` `-`               | 1          | left          |
| Multiply, divide  | `*` `×` `·` / `/` `÷` | 2          | left          |
| Implicit multiply | juxtaposition         | 2          | left          |
| Unary plus/minus  | `+` `-`               | 3          | right         |
| Power             | `^`                   | 4          | right         |

- **Implicit multiplication**: juxtaposition multiplies, but only when the right-hand side starts with `(`, `$` or an
  identifier — `2x`, `2(x+1)`, `2$(cost)` and `x y` are all multiplications, whereas `2 3` is not (it reports
  `unexpected character` or `expected ',' or ')'`)
- **Dot operators**: the multiplication sign may be written `·` (U+00B7) or `×` (U+00D7), and the division sign `÷`
  (U+00F7); writing back always uses `*` and `/`
- **Unary plus/minus** sits below `^` and above `*`: `-x^2` is `-(x^2)` and `-x*y` is `-(x*y)`; `-2^2` is `-(2^2)`
  (`-4`) as well, and a negative base has to be written `(-2)^2`
- A sign immediately followed by a number is absorbed into the literal (`-2`, `+1.5`, `-5.0E-4`), which is why `2^-2`
  is valid
- Whitespace may be inserted freely and is skipped; even the `-` and `>` of `->` may have whitespace between them
  (`a - > b` is a lambda)

Operators are hard-bound to built-in functions: `+`→`add`, `-`→`subtract`, `*`→`multiply`, `/`→`divide`, `^`→`pow`, and
parsing an operator does **not consult the registry**.

## Lambda

A lambda is written `parameters -> body` (a `-` immediately followed by `>`), and is passed to another function as a
value:

| Spelling               | Meaning                   |
|------------------------|---------------------------|
| `x -> $(x)*2`          | Single-parameter lambda   |
| `(a, b) -> $(a)+$(b)`  | Multi-parameter lambda    |
| `x... -> min($(x...))` | Variadic-parameter lambda |

- The parentheses may be omitted for a single parameter; the **canonical form** written back always drops them, so
  `(a) -> $(a)` is written `a -> $(a)`
- The text is only parsed as a lambda when the parameter list itself is valid, so subtraction is never mistaken for the
  arrow: `x-1` still parses as subtraction and is written back as `x-1`
- A parameter name ending in `...` is variadic, with the same rules as custom functions (at most one variadic, it need
  not be last, and its lower bound is 0); see [Custom Functions](./custom-function#variadic-parameters)
- A parameter name must be an identifier; an empty parameter string such as `()` is reported as a "missing parameter
  name", so a zero-parameter lambda can only be written in the object form
- A lambda is a **closure**: its body can read both its own parameters and the names bound at the call site
- A lambda binds the loosest, so its body needs no parentheses; a body that is itself a lambda parses right-associatively,
  and `x -> y -> $(x)+$(y)` is written back as the same text
- A lambda is a value: it can be passed as an argument to another function and serializes as the function type
  `anvillib:lambda` in the object form; when it lands in an operator's operand position it gets a pair of parentheses
  added, because `->` binds looser than every operator and dropping them would read as another tree
  (`2(x -> $(x))` is written back as `2*(x -> $(x))`)

## Function Names and Namespaces

A function name is always treated as a registry name first:

1. A name without a namespace is completed to `anvillib`, and then:
    - a hit against a built-in function name goes to the built-in function and has its argument count validated **at
      parse time**, for example `sqrt(x)`
    - otherwise the `anvillib:function` datapack registry is queried, so the datapack function `triple` is simply
      written `triple(x)` in text
2. A namespaced name queries the `anvillib:function` datapack registry first, and a function found there is used (a
   function in another namespace may therefore override a same-named built-in)
3. When the registry has nothing, the name falls back to a built-in of the same path, so `mymod:sqrt(x)` is equivalent
   to `sqrt(x)`
4. When nothing matches, `unknown function '<name>'` is thrown

Note that steps 1 and 2 have a **different order**: in the `anvillib` namespace the built-in function wins, so
registering an `anvillib:sqrt` in a datapack will not be picked up by text either (which is exactly why the write-back
side refuses to write such a function as a bare name). Names are lowercased before they are resolved, so `SQRT(x)` and
`X5` are both readable, while an entry whose registry path contains uppercase letters cannot be referenced from text.

Variables take priority over functions: `x`, `y`, `z`, `x0`… are recognised as input value references first, so
registering a function named `x` also makes it **impossible** to call it from text.

Writing back does the opposite: a function that can be written as a bare name always has its `anvillib` namespace
omitted, while other namespaces are kept as they are. The test for "can be written as a bare name" is aligned exactly
with the parser's rules (`FlatExpressionParser.isWritableFunctionName`, shared by the write-back and parse sides), and
the following names cannot be written as bare names and can only fall back to the object form:

- The same name as a built-in function (`anvillib:sqrt`): the parser prefers the built-in
- The same name as an input value (`x`, `y`, `z`, `x0`, `x12`): the parser **recognises variables before functions**, so
  `x0(5)` reads as `<input 0> * 5` and the function is never called at all
- A path containing a character outside the identifier character set (`[A-Za-z_][A-Za-z0-9_:.]*`): `collision-free`
  (`-`) and `utils/triple` (`/`) both stop being read halfway through
- A name ending in `.` (such as `x.`) or an empty name

```java
// Parsing
"sqrt(x)"           // -> anvillib:sqrt (a built-in function)
"mymod:triple(x)"   // -> mymod:triple (looked up in the datapack registry)

// Writing back
anvillib:sqrt       // -> "sqrt"
mymod:triple        // -> "mymod:triple"
```

## Arity Validation

The argument count of both built-in and datapack functions is validated **at parse time**, and the error message carries
the position:

```java
FlatExpressionParser.parseValue("sqrt(x,1)", functions);
// IllegalArgumentException: function 'anvillib:sqrt' Expected 1 arguments but got 2 at position 9 of expression "sqrt(x,1)"

FlatExpressionParser.parseValue("mymod:triple(1)", functions);
// IllegalArgumentException: function 'mymod:triple' Expected 2 arguments but got 1 at position 15 of expression "mymod:triple(1)"
```

A datapack function cannot afford to wait until evaluation time: an expression with a mismatched count would parse
cleanly and land in a saved file, until it throws deep inside a BE tick or a datapack load. The criterion is exactly the
`parameters()` the function itself declares, the same declaration `IFunction.bind` uses at evaluation time, so reporting
the error earlier does not change any spelling that already worked. The rule itself lives in
`Parameters.checkArity(List<IExpression>)`, shared by parse time, `LibBuiltInFunctions.call` and `callChecked`.

A variadic parameter follows Java's varargs semantics: its **lower bound is 0**, it may be given no argument at all, and
the function itself handles the case where it gets no value. So `min()` / `max()` are valid calls returning 0, and
`"x...": []` is an ordinary empty call as well.

```java
FlatExpressionParser.parseValue("min()", functions).evaluate(Arguments.of());       // 0.0
FlatExpressionParser.parseValue("max()", functions).evaluate(Arguments.of());       // 0.0
```

Fixed parameters are unaffected and not one of them may be missing; when fixed and variadic parameters are mixed, the
lower bound is the number of fixed parameters:

```java
// The declaration is (x..., last): last must be given a value, while x may be given none
CustomFunction.of(List.of("x...", "last"), NamedFunction.call("last")).parameters().minimumArity();   // 1
CustomFunction.of(List.of("x..."), NamedFunction.call("x")).parameters().minimumArity();              // 0
```

`$(x...)` is a **whole list** and can only land in a variadic parameter slot, so it takes part in the validation by the
following rule:

- The function **has** a variadic parameter: the list fits, and its length is only known at evaluation time, so parse
  time lets it through, while `IFunction.bind` decides against the real length whether it falls inside the range
- The function has **no** variadic parameter: not one fixed parameter slot can take a list, so the call is invalid no
  matter how long the list is, and the "count of non-spread arguments" is reported directly

Matching is counted by **argument count**: the variadic parameter first reserves the slots of the fixed parameters after
it, and only what remains belongs to it, while `$(name...)` spreads out from the variadic slot and occupies a number of
slots. So an empty list (`$(name...)` spreads out 0) takes up no argument slot and the fixed parameters after it still
get their own value; conversely, when the number spread out exceeds what the variadic slot can take, it reports
`provides N arguments but this position takes M`.

```java
// Parameters (x..., last), with x = []: the empty list takes no slot, last gets 1, and x is the empty list
FlatExpressionParser.parseValue("f($(x...), 1)", functions);
// Parameters (x..., last), with x = [5, 6]: the variadic has only one slot left, which cannot hold two
// IllegalStateException: Spread[name=x] provides 2 arguments but this position takes 1
FlatExpressionParser.parseValue("f($(x...), 1)", functions);
```

```java
FlatExpressionParser.parseValue("min($(x...))", functions);        // OK, min is a variadic function
FlatExpressionParser.parseValue("sqrt($(x...))", functions);
// IllegalArgumentException: function 'anvillib:sqrt' Expected 1 arguments but got 0 at position 13 of expression "sqrt($(x...))"
FlatExpressionParser.parseValue("mymod:triple($(x...))", functions);   // triple is (a, b)
// IllegalArgumentException: function 'mymod:triple' Expected 2 arguments but got 0 at position 21 of expression "mymod:triple($(x...))"
```

Building a call by hand follows the same rule, so it will not first build a call that only blows up at evaluation time:

```java
LibBuiltInFunctions.MIN.call(IExpression.ref("x..."));                       // OK
LibBuiltInFunctions.SQRT.call(IExpression.ref("x..."));                      // throws IllegalArgumentException
LibBuiltInFunctions.ADD.call(IExpression.ref("x..."), ConstantFunction.of(1).call());   // add is (a, b): throws
```

When a name is **not bound to a list**, evaluation names it in the error, instead of giving a baffling "argument count
mismatch":

```java
FlatExpressionParser.parseValue("min($(unbound...))", functions).evaluate(Arguments.of());
// IllegalArgumentException: $(unbound...) is not bound to a list
```

A name bound to an **empty list** is a valid empty call, distinguishable from a misspelled name:

```java
IExpression call = FlatExpressionParser.parseValue("min($(empty...))", functions);
call.evaluate(Arguments.of(List.of(), List.of("empty"), List.of(new Arguments.Value.Many(List.of()))));
// 0.0
```

## Canonical Write-Back Form

The write-back result is a **canonical form** and does not preserve the original text, but any write-back result
re-parses into the same expression tree, and **writing it once more still yields the same text**. The writer actually
tests this before returning: it reads its own text back and writes it again, falling back to the object form when the
two disagree.

| Input                                            | Write-back result                                   |
|--------------------------------------------------|-----------------------------------------------------|
| `2*x`, `2·x`, `x*2`                              | `2x`, `2x`, `x*2`                                   |
| `2*3`, `2*0.5`                                   | `2*3`, `2*0.5` (no juxtaposition between constants) |
| `2^(3^4)`                                        | `2^3^4`                                             |
| `(2^3)^4`                                        | `(2^3)^4`                                           |
| `x0+x1+x2`                                       | `x+y+z`                                             |
| `add(x,1)`                                       | `x+1`                                               |
| `pow(x,2)`                                       | `x^2`                                               |
| `2*mymod:triple(x,1)`                            | `2mymod:triple(x,1)`                                |
| `2*e1(1)`                                        | `2*e1(1)`                                           |
| `2*$(a)`                                         | `2*$(a)`                                            |
| `-x`                                             | `-x`                                                |
| `0-(x*y)`                                        | `-(x*y)`                                            |
| `x*(2+1)`                                        | `x*(2+1)`                                           |
| `-0`, `-0.0`                                     | `-0.0`                                              |
| `0.0001`                                         | `0.0001`                                            |
| `10000000`                                       | `10000000`                                          |
| `-1.0E7`                                         | `-10000000`                                         |
| `-5.0E-4`                                        | `-0.0005`                                           |
| `(a) -> $(a)`                                    | `a -> $(a)`                                         |
| `2(x -> $(x))`                                   | `2*(x -> $(x))`                                     |
| `(x -> $(x))*2`                                  | `(x -> $(x))*2`                                     |
| `(x -> $(x))^2`                                  | `(x -> $(x))^2`                                     |
| `min($(x...))`                                   | `min($(x...))`                                      |
| `mymod:max(x,1)` (`mymod:max` is not registered) | `max(x,1)` (falls back to the built-in function)    |

Parentheses are added in the minimal number of places, by the rule of "would they associate into a different tree at the
same precedence". Negating a compound expression always adds a pair, written `-(x^y)` rather than `-x^y`, because
otherwise the `-` would land on the whole power.

Juxtaposed multiplication (dropping the `*`) is only used when the right-hand side can follow directly, which means the
right-hand side has to start with an identifier, a parenthesis or `$(name)`, and the left-hand side has to be an unsigned
numeric constant. The decision does not stop at the first character but is **measured**: an `e`/`E` after a number is
taken as an exponent, so `2*e1(1)` written as `2e1(1)` reads as `multiply(20, 1)`, changing the value silently without
reporting an error, which is why such names fall back to the explicit multiplication sign.

The spelling of a number gives priority to "reading back": an integer (with an absolute value below
`9.223372036854776E18`) is written as an integer literal, `1e-4 ≤ |x| < 1e7` is written in decimal with trailing
redundant zeros removed, and the rest is left to `Double.toString` (so `1e-5` is written `1.0E-5`). Negative zero is
written `-0.0` rather than `-0`: `-0` would be read as `0-0`, turning the value into positive zero.

## Cases That Cannot Be Written Back

When writing back fails, `FlatExpressionWriter.write` returns an empty `Optional` and `IExpression.CODEC` falls back to
the object form accordingly (rather than writing text that cannot be read back), in the following cases:

- The tree contains an inlined function definition with no resolvable registry name (built-in functions, an inline
  `CustomFunction`, and directly constructed call nodes all belong to this category)
- The tree contains a non-finite constant (`NaN`, infinity) — a literal that overflows to infinity (`1e99999`) is
  rejected at parse time as well, so that nothing can be read in that cannot be written back
- A datapack registers a function with the same name as a built-in in the `anvillib` namespace (such as
  `anvillib:sqrt`): the parser considers that name to be the built-in, so writing the short name would silently
  substitute the built-in, and the object form is the only option
- A zero-parameter lambda: an empty parameter string in text is read as a "missing parameter name", while the object
  form's `parameters: []` is valid
- A by-name read's payload cannot be written as `$(name)`: the name contains a character outside the identifier
  character set such as `)` or a space, ends with `.` (such as `x.`), or is empty. A **named** reference whose name
  itself ends in `...` (`Reference.Named("x...")`, `NamedFunction("x...")`) cannot be written either — the written
  `$(x...)` would be read as a Spread, changing the meaning from "take one number" to "take a list"
- An index reference lands on a negative or extremely large index (such as `InputFunction(-1)`): the `x-1` that would be
  written cannot be read back

Negating a negative constant (`0-(-0.5)`) **can** be written back as `-(-0.5)`: the parentheses guarantee that the
invalid `--0.5` is never produced, and it reads back as the same tree. The write-back self-check also downgrades
"written out but not reading back as the same tree" to the object form, so there is no need to worry about a name
quietly changing meaning.

> Writing back is not a pure output operation: for the self-check it parses the text it wrote a second time (and
> therefore writes into the parse cache), at a cost of roughly twice the size of the tree.

## Parse Error Messages

Calling `FlatExpressionParser.parseValue` directly throws `IllegalArgumentException`, whose message always carries the
suffix `at position <position> of expression "<source text>"`:

| Situation                                                           | Message                                                                               |
|---------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| An unreadable character in the text                                 | `unexpected character '<character>'`                                                  |
| The text ends early                                                 | `unexpected end of expression`                                                        |
| `$` is not followed by `(`                                          | `expected '(' after '$'`                                                              |
| `$(...)` contains no name                                           | `expected a name between '$(' and ')'`                                                |
| `$(` is not closed                                                  | `expected ')'`                                                                        |
| A parenthesis is not closed                                         | `expected ')'`                                                                        |
| No `(` after a function name (including an unknown bare identifier) | `expected '(' after function '<name>'`                                                |
| A comma is missing between arguments                                | `expected ',' or ')'`                                                                 |
| The function name is not found                                      | `unknown function '<name>'`                                                           |
| A literal overflows to infinity                                     | `number out of range '<source text>'` (the position points at the end of the literal) |
| An invalid number spelling                                          | `invalid number '<source text>'`                                                      |
| The index after `x` exceeds `int`                                   | `input index is too large: '<number>'`                                                |
| An invalid lambda parameter name                                    | `invalid lambda parameter name '<name>'` / `expected a lambda parameter name`         |
| A mismatched argument count                                         | `function '<name>' Expected <range> arguments but got <count>`                        |
| Too deep nesting                                                    | `expression nests too deeply, the limit 512`                                          |

Going through `IExpression.CODEC` wraps these errors into `DataResult` errors: `Invalid expression: <the message
above>`; when the input is not a string it is `Not a flat expression: <input>`; and when the `DynamicOps` is not a
`RegistryOps` it is `Cannot access registry ResourceKey[minecraft:root / anvillib:function], use RegistryOps`.

## Cache

Parse results are cached in groups keyed by function registry instance, so parsing the same text repeatedly against one
registry does not re-parse it, and returns **the same instance** directly. Each group holds at most 512 entries,
evicting least-recently-used entries beyond that, with no expiry time; for the part where the weak key cannot be relied
on and for the cleanup timing, see [Cache and Lifecycle](./cache).

## Nesting Depth Limit

Parentheses, powers, function arguments and lambda bodies share one nesting counter, and going beyond 512 levels reports
`expression nests too deeply, the limit 512`. Without that limit, tens of thousands of parentheses or `2^2^2^…` would
make the recursive descent throw `StackOverflowError` — that is an `Error`, which `parseResult`'s
`catch (RuntimeException)` cannot catch, so it would pass straight through the codec into the datapack loading flow.

That 512 is a **counter** limit rather than a number of nesting levels: one level of parentheses or argument nesting
passes through the three guards `parseLambda`, `parseUnary` and `parsePower` in turn and counts once at each, so
`sqrt(sqrt(…))` can actually nest only **169** levels deep (level 170 reports the error); only a chain of unary signs
counts once per level, allowing 512 signs. Moving any one guard silently changes the usable depth, and
`FlatExpressionTest` pins both boundaries.

## API

```java
public final class FlatExpressionParser {
    // Parses; the whole text may also be just a number or one by-name read
    public static IExpression parseValue(String source, HolderGetter<IFunction> functions);

    // The codec for flat text, which only accepts RegistryOps
    public static Codec<IExpression> codec();

    // Clears the parse cache
    public static void clearCache();

    // Extracts the function registry from dynamic ops, returning null when unavailable
    public static @Nullable HolderGetter<IFunction> functionGetter(DynamicOps<?> ops);
}
```

`FlatExpressionWriter` is a package-private class, used only indirectly through the encoding path of
`FlatExpressionParser.codec()`; its two externally visible members are `write(IExpression, HolderGetter<IFunction>)`
(returning `Optional<String>`, where empty means the text cannot be written) and `input(int)` (index → `x`/`y`/`z`/`xN`).
