---
title: Recipe Predicate System
prev: false
next: false
---

# Predicate System

## IRecipePredicate

The predicate interface, extending `Predicate<InWorldRecipeContext>`, `Consumer<InWorldRecipeContext>`, and `IPrioritized`.

```java
public interface IRecipePredicate<P extends IRecipePredicate<P>>
        extends Predicate<InWorldRecipeContext>, Consumer<InWorldRecipeContext>, IPrioritized {
    // ... methods
}
```

### Core Methods

| Method                              | Description                                                                                |
|-------------------------------------|--------------------------------------------------------------------------------------------|
| `test(InWorldRecipeContext)`        | Determines whether the context matches the condition                                       |
| `accept(InWorldRecipeContext)`      | Consumes the resource after a successful match (default no-op; only conflicting predicates need to implement) |
| `snapshot(InWorldRecipeContext)`    | Creates a snapshot of the context (for rollback)                                           |
| `rollback(InWorldRecipeContext)`    | Rolls back to the snapshot state                                                           |
| `clearStack(InWorldRecipeContext)`  | Clears the predicate operation stack                                                      |
| `getType()`                         | Returns the `Type<P>` descriptor for this predicate                                        |

### Type Descriptor

```java
interface Type<P extends IRecipePredicate<P>> {
    Identifier getId();           // Unique registry ID
    default boolean conflict() {  // true = conflicting (consuming), false = non-conflicting
        return false;
    }
    MapCodec<P> codec();
    StreamCodec<? super RegistryFriendlyByteBuf, P> streamCodec();
}
```

Each predicate type is registered in the `anvillib:predicate` registry. Predicates where `conflict()` returns `true` are automatically classified into the `conflicting` list.

## Built-in Predicates

### HasItem

Detects whether specific item entities exist at a given position.

```java
HasItem.builder()
    .of(Items.IRON_INGOT, Items.GOLD_INGOT)  // Item list
    .of(TagKey<Item> items)                   // or item Tag
    .offset(0, 1, 0)                          // Relative offset
    .count(1, 64)                             // Count range
    .consumption(ConsumptionType.CONSUME)      // Consumption mode
    .build();
```

| Builder Method                    | Description                                       |
|-----------------------------------|---------------------------------------------------|
| `of(ItemLike...)`                 | Items to match                                    |
| `of(TagKey<Item>)`                | Item tag to match                                 |
| `offset(Vec3)` / `offset(x,y,z)` | Relative offset position                          |
| `count(int min, int max)`         | Count range                                       |
| `consumption(ConsumptionType)`    | Consumption mode: `CONSUME` / `OPTIONAL`          |
| `strict(boolean)`                 | Strict mode (requires exact component match)      |

**Conflicting** (`Type.conflict() = true`): consumes the matching item entity.

### HasItemIngredient

Detects whether item entities satisfying ingredient conditions exist at a given position. Similar to `HasItem` but semantically closer to "ingredient consumption"; the count indicates "at least required."

```java
HasItemIngredient.builder()
    .of(Items.COAL, Items.CHARCOAL)
    .offset(0, 0, 0)
    .build();
```

**Non-conflicting** (check only, no consumption).

### HasBlock

Detects whether specific blocks exist at a given position.

```java
HasBlock.builder()
    .of(Blocks.STONE, Blocks.DIRT)             // Block list
    .of(TagKey<Block> tag)                      // or block Tag
    .with(property, value)                      // BlockState property condition
    .with("facing", "north")                    // String key form
    .offset(0, -1, 0)                           // Relative offset
    .nbt(compoundTag)                           // NBT condition (optional)
    .build();
```

| Builder Method                    | Description                              |
|-----------------------------------|------------------------------------------|
| `of(Block...)`                    | Block list to match                      |
| `of(Collection<Block>)`           | Block collection to match                |
| `of(TagKey<Block>)`               | Block tag to match                       |
| `offset(Vec3)` / `offset(x,y,z)` | Relative offset                          |
| `with(Property<C>, C)`            | Exact BlockState property match          |
| `with(String, String)`            | String-form property match               |
| `nbt(CompoundTag)`                | NBT condition                            |

**Non-conflicting** (checks block state only, does not modify the world).

### HasBlockIngredient

Detects whether a block satisfying ingredient conditions exists at a given position. Same API as `HasBlock`, semantically meaning "consumed as ingredient."

```java
HasBlockIngredient.builder()
    .of(Blocks.STONE)
    .offset(0, 0, 0)
    .build();
```

**Non-conflicting**.

## Custom Predicates

Implement `IRecipePredicate<P>` and register in `LibRegistries.PREDICATE_TYPE_REGISTRY`:

```java
public class MyPredicate implements IRecipePredicate<MyPredicate> {
    public static final Type<MyPredicate> TYPE = ...;

    @Override
    public boolean test(InWorldRecipeContext ctx) {
        // Matching logic
    }

    @Override
    public Type<MyPredicate> getType() {
        return TYPE;
    }
}
```
