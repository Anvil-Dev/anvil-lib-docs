---
title: Recipe Outcomes & Triggers
prev: false
next: false
---

# Outcomes and Triggers

## IRecipeOutcome

The outcome interface, defining the result executed after a recipe successfully matches. Extends `Consumer<InWorldRecipeContext>` and `IPrioritized`.

```java
public interface IRecipeOutcome<O extends IRecipeOutcome<O>>
        extends Consumer<InWorldRecipeContext>, IPrioritized {
    // ... methods
}
```

### Core Methods

| Method                                     | Description                                                                                      |
|--------------------------------------------|--------------------------------------------------------------------------------------------------|
| `accept(InWorldRecipeContext)`             | Executes the outcome logic                                                                       |
| `acceptWithChance(InWorldRecipeContext)`   | Decides randomly based on probability whether to execute; calls `accept()` on success            |
| `chance()`                                 | Returns the probability `NumberProvider`, default `ConstantValue.exactly(1.0f)`                  |
| `getType()`                                | Returns the `Type<O>` descriptor                                                                 |

### Type Descriptor

```java
interface Type<O extends IRecipeOutcome<O>> {
    Identifier getId();
    MapCodec<O> codec();
    StreamCodec<? super RegistryFriendlyByteBuf, O> streamCodec();
}
```

Outcome types are registered in the `anvillib:outcome` registry.

## Built-in Outcomes

### SpawnItem

Spawns an item entity at the specified position.

```java
SpawnItem.builder()
    .item(new ItemStackTemplate(Items.DIAMOND, 3))
    .offset(0, 1, 0)              // Spawn position offset
    .count(0.5f)                   // Probability 50%
    .build();
```

### SetBlock

Places a block at the specified position.

```java
SetBlock.builder()
    .block(Blocks.DIAMOND_BLOCK.defaultBlockState())
    .offset(0, 0, 0)
    .chance(1.0f)
    .build();
```

### ChooseOneOutcome

Randomly selects and executes one of multiple sub-outcomes.

```java
ChooseOneOutcome.builder()
    .outcome(spawnItemOutcome)
    .outcome(setBlockOutcome)
    .outcome(anotherOutcome)
    .build();
```

### ProduceExplosion

Produces an explosion at the recipe execution position.

```java
ProduceExplosion create(float radius, boolean fire, Level.ExplosionInteraction interaction);
```

## IRecipeTrigger

The trigger interface, defining the trigger condition for a recipe.

```java
public interface IRecipeTrigger extends IPrioritized {
    Identifier getId();
}
```

Triggers are registered in the `anvillib:trigger` registry. Built-in implementation:

```java
// Simple implementation
new IRecipeTrigger.Impl(ResourceLocation.fromNamespaceAndPath("mymod", "item_enter_block"));
```

### Trigger Flow

1. A game event fires (e.g., entity collision, block update)
2. Calls `InWorldRecipeManager.trigger(trigger, context)`
3. Manager iterates over all registered recipes for that trigger
4. Checks `matches()` for each recipe, sorted by priority
5. The first successfully matched recipe executes `assemble()`
6. If in compatible mode and efficiency cap not reached, repeats detection for the next recipe
