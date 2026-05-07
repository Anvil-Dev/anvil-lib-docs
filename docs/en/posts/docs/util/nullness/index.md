# Nullness Safety Utilities (nullness package)

Located at `dev.anvilcraft.lib.v2.util.nullness`, providing non-null/nullable type annotations and corresponding functional interfaces.

## Annotations

- `@NonnullType` – can be used on type parameters to declare non-null (replacement for `javax.annotation.Nonnull`)
- `@NullableType` – same as above, for nullable types
- `@FieldsAreNonnullByDefault` – applied to a package or class, declares fields as non-null by default

## Functional Interfaces

| Interface                   | Corresponding Java Type | Description               |
|----------------------------|------------------------|---------------------------|
| `NonNullSupplier<T>`       | `Supplier<T>`          | Must not return null      |
| `NonNullConsumer<T>`       | `Consumer<T>`          | Parameter is non-null     |
| `NonNullBiConsumer<T,U>`   | `BiConsumer<T,U>`      | Both parameters are non-null |
| `NonNullFunction<T,R>`     | `Function<T,R>`        | Parameter and return value are non-null |
| `NonNullBiFunction<T,U,R>` | `BiFunction<T,U,R>`    | Parameters and return value are non-null |
| `NonNullUnaryOperator<T>`  | `UnaryOperator<T>`     | Parameter and return value are non-null |

All interfaces support composition (`andThen`) and a static `noop()` factory (no-op). `NonNullSupplier` additionally provides `lazy()` and `of(Supplier)` conversion.

## Import Paths Across Versions

Since `module.util` was not released as a standalone module in some versions, the import path for the `nullness` package varies by version:

| Version Range | Import Path |
|--------------|-------------|
| 1.21.1 | `import dev.anvilcraft.lib.v2.util.nullness.NonNullSupplier;` |
| 1.21.2–1.21.11 | `import dev.anvilcraft.lib.v2.registrum.util.nullness.NonNullSupplier;` |
| 26.1 | `import dev.anvilcraft.lib.v2.util.nullness.NonNullSupplier;` (restored) |

> In versions 1.21.2–1.21.11, `module.util` was not synchronized due to capacity constraints. The nullness functional interfaces were embedded into `module.registrum` to ensure Registrum could compile independently. In 26.1, `module.util` synchronization was restored and the import path returned to its original location.

## Deprecated Interfaces

- `NullableSupplier<T>` – please use `Supplier<T>` directly annotated with `@Nullable`.
