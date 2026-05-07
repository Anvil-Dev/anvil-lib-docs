---
title: Recipe Core Recipe Structure
prev: false
next: false
---

# Core Recipe Structure

## InWorldRecipe

The core recipe class, implementing `Recipe<InWorldRecipeContext>` and `IPrioritized`.

### Constructor Parameters

| Parameter      | Type                        | Description                                                                 |
|----------------|-----------------------------|-----------------------------------------------------------------------------|
| icon           | `ItemStackTemplate`         | Recipe icon (displayed in JEI / recipe book)                                |
| trigger        | `IRecipeTrigger`            | Trigger condition                                                            |
| conflicting    | `List<IRecipePredicate<?>>` | Conflicting predicates (consuming match; prevents other recipes after consumption) |
| nonConflicting | `List<IRecipePredicate<?>>` | Non-conflicting predicates (check only, no consumption)                     |
| outcomes       | `List<IRecipeOutcome<?>>`   | Outcome list                                                                 |
| priority       | `int`                       | Priority (lower number = higher priority), can be auto-calculated           |
| compatible     | `boolean`                   | Compatible mode (`true` allows multiple recipes to share inputs)            |
| maxEfficiency  | `int`                       | Maximum executions per trigger; default `Integer.MAX_VALUE`                 |

### Constructor Overloads

```java
// Full constructor
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible, maxEfficiency);

// Omit maxEfficiency (default Integer.MAX_VALUE)
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, priority, compatible);

// Auto-calculate priority
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible, maxEfficiency);
new InWorldRecipe(icon, trigger, conflicting, nonConflicting, outcomes, compatible);
```

### Core Methods

| Method                                 | Description                                                                                                                                    |
|----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `matches(InWorldRecipeContext, Level)` | First checks non-conflicting predicates (`ShapelessMatcher.compatible`), then conflicting predicates (compatible mode uses `compatible`, non-compatible uses `incompatible`). On failure, clears the predicate stack. |
| `assemble(InWorldRecipeContext)`       | Pops and consumes conflicting predicates in order, executes all outcomes by probability, returns the icon `ItemStack`                          |
| `getSerializer()`                      | Returns `LibRecipeTypes.IN_WORLD_RECIPE_SERIALIZER`                                                                                            |
| `getType()`                            | Returns `LibRecipeTypes.IN_WORLD_RECIPE`                                                                                                       |

### Automatic Priority Calculation

`calcPriority(trigger, conflicting, nonConflicting, outcomes)` sums the priority values of the trigger, all predicates, and all outcomes.

### Serialization

`InWorldRecipe.Serializer` provides `CODEC` (`MapCodec<InWorldRecipe>`) and `STREAM_CODEC`.

**JSON Fields:**

| Field             | Type                 | Default           | Description          |
|-------------------|----------------------|-------------------|----------------------|
| `icon`            | `ItemStackTemplate`  | `minecraft:anvil` | Recipe icon          |
| `trigger`         | `Identifier`         | --                | Trigger registry ID  |
| `conflicting`     | `IRecipePredicate[]` | --                | Conflicting predicate list |
| `non_conflicting` | `IRecipePredicate[]` | --                | Non-conflicting predicate list |
| `outcomes`        | `IRecipeOutcome[]`   | --                | Outcome list         |
| `priority`        | `int`                | `1`               | Priority             |
| `compatible`      | `bool`               | `true`            | Compatible mode      |
| `max_efficiency`  | `int`                | `2147483647`      | Max efficiency       |

### Getters

```java
public ItemStackTemplate icon();
public IRecipeTrigger trigger();
public List<IRecipePredicate<?>> conflicting();
public List<IRecipePredicate<?>> nonConflicting();
public List<IRecipeOutcome<?>> outcomes();
public int priority();
public boolean compatible();
public int maxEfficiency();
```

## Usage Example

```java
InWorldRecipe recipe = new InWorldRecipe(
    new ItemStackTemplate(Items.CRAFTING_TABLE),
    trigger,
    List.of(hasItemPredicate),
    List.of(hasBlockPredicate),
    List.of(spawnItemOutcome),
    true  // compatible
);
```
