# 空值安全工具（nullness 包）

位于 `dev.anvilcraft.lib.v2.util.nullness`，提供非空/可空类型注解与对应的函数式接口。

## 注解

- `@NonnullType` – 可用于类型参数的非空声明（`javax.annotation.Nonnull` 的替代）
- `@NullableType` – 同上，用于可空类型
- `@FieldsAreNonnullByDefault` – 应用于包或类，声明字段默认为非空

## 函数式接口

| 接口                         | 对应 Java 类型          | 描述         |
|----------------------------|---------------------|------------|
| `NonNullSupplier<T>`       | `Supplier<T>`       | 不允许返回 null |
| `NonNullConsumer<T>`       | `Consumer<T>`       | 参数非空       |
| `NonNullBiConsumer<T,U>`   | `BiConsumer<T,U>`   | 两个参数均非空    |
| `NonNullFunction<T,R>`     | `Function<T,R>`     | 参数和返回值均非空  |
| `NonNullBiFunction<T,U,R>` | `BiFunction<T,U,R>` | 参数和返回值均非空  |
| `NonNullUnaryOperator<T>`  | `UnaryOperator<T>`  | 参数和返回值均非空  |

所有接口均支持组合（`andThen`）和静态工厂 `noop()`（空操作），`NonNullSupplier` 额外提供 `lazy()` 与 `of(Supplier)` 转换。

## 已废弃接口

- `NullableSupplier<T>` – 请使用 `Supplier<T>` 直接标注 `@Nullable`。
