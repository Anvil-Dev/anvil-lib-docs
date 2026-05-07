---
title: Recipe Builder
prev: false
next: false
---

# Builder (InWorldRecipeBuilder)

`InWorldRecipeBuilder` provides a fluent API for constructing `InWorldRecipe` instances, with built-in support for data generation and advancement integration.

## Creating a Builder

```java
// Compatible mode: allows multiple recipes to share inputs; predicates are not consumed
InWorldRecipeBuilder.compatible(trigger)

// Non-compatible mode: matched predicates are consumed, preventing subsequent recipes from matching again
InWorldRecipeBuilder.incompatible(trigger)

// Supplier form supported
InWorldRecipeBuilder.compatible(() -> trigger)
InWorldRecipeBuilder.incompatible(() -> trigger)
```

## Offset Control

The builder maintains a current offset (default `Vec3.ZERO`) used to set relative positions for subsequent predicates/outcomes.

### Direct Offset

```java
builder.offset(new Vec3(x, y, z));
builder.offset(x, y, z);
```

### Quick Offsets

```java
builder.below();      // 1 block below
builder.below(2);     // 2 blocks below
builder.above();      // 1 block above
builder.above(2);     // 2 blocks above
```

## Icon

```java
builder.icon(new ItemStackTemplate(Items.ANVIL));
```

## Adding Predicates

### Generic Method

```java
// Add a predicate instance directly (automatically categorized into conflicting/nonConflicting based on Type.conflict())
builder.with(predicate);
```

### Item Predicate (hasItem)

All methods support `(Vec3)`, `(double,double,double)`, or the current offset.

```java
// Consumer form (fully customizable)
builder.hasItem(consumer -> consumer
    .of(Items.IRON_INGOT, Items.GOLD_INGOT)
    .offset(0, 1, 0));

// Specify items
builder.hasItem(Items.IRON_INGOT);
builder.hasItem(offset, Items.IRON_INGOT, Items.DIAMOND);
builder.hasItem(x, y, z, Items.IRON_INGOT);

// Specify Tag
builder.hasItem(TagKey<Item> items);
builder.hasItem(offset, TagKey<Item> items);
builder.hasItem(x, y, z, TagKey<Item> items);
```

### Item Ingredient Predicate (hasItemIngredient)

Methods share the same parameter forms as `hasItem`, internally using the `HasItemIngredient` predicate.

```java
builder.hasItemIngredient(consumer -> consumer.of(Items.COAL).offset(0, 0, 0));
builder.hasItemIngredient(Items.COAL);
builder.hasItemIngredient(offset, Items.COAL);
builder.hasItemIngredient(TagKey<Item> items);
```

### Block Predicate (hasBlock)

```java
// Specify blocks
builder.hasBlock(Blocks.STONE, Blocks.DIRT);
builder.hasBlock(offset, Blocks.STONE);
builder.hasBlock(collectionOfBlocks);

// Specify Tag
builder.hasBlock(BlockTag tag);
builder.hasBlock(offset, BlockTag tag);

// Specify BlockState (non-default properties are automatically extracted as conditions)
builder.hasBlock(state);
builder.hasBlock(x, y, z, state);

// Consumer form
builder.hasBlock(consumer -> consumer
    .of(Blocks.OAK_LOG)
    .with(BlockStateProperties.AXIS, Direction.Axis.Y));
```

### Block Ingredient Predicate (hasBlockIngredient)

```java
builder.hasBlockIngredient(consumer -> consumer.of(Blocks.STONE));
builder.hasBlockIngredient(Blocks.STONE);
builder.hasBlockIngredient(tag);
builder.hasBlockIngredient(state);
```

## Adding Outcomes

### Generic Method

```java
builder.out(outcome);
```

### Spawn Item (spawnItem)

```java
// Consumer form
builder.spawnItem(consumer -> consumer.item(stack).offset(0, 1, 0).count(0.5f));

// Quick form
builder.spawnItem(offset, chance, stack);
builder.spawnItem(offset, stack);           // chance = 1.0
builder.spawnItem(x, y, z, chance, stack);
builder.spawnItem(x, y, z, stack);
builder.spawnItem(stack);                   // uses current offset
```

### Set Block (setBlock)

```java
// Consumer form
builder.setBlock(consumer -> consumer.block(state).offset(0, 0, 0).chance(0.8f));

// Quick form
builder.setBlock(offset, chance, state);
builder.setBlock(offset, state);            // chance = 1.0
builder.setBlock(x, y, z, chance, state);
builder.setBlock(x, y, z, state);
builder.setBlock(state);                    // uses current offset
```

### Choose One (chooseOne)

```java
builder.chooseOne(choose -> choose
    .outcome(spawnItemOutcome)
    .outcome(setBlockOutcome));
```

## Configuration Properties

```java
builder.priority(10);          // Manually set priority (otherwise auto-calculated)
builder.maxEfficiency(64);     // Maximum executions per trigger
builder.group("my_group");     // Recipe group
```

## Data Generation

Implements the `RecipeBuilder` interface and integrates with Minecraft's data generation system:

```java
// Add unlock condition
builder.unlockedBy("has_iron", InventoryChangeTrigger.TriggerInstance.hasItems(Items.IRON_INGOT));

// Save recipe JSON + advancement
builder.save(recipeOutput, resourceKey);
builder.save(recipeOutput, identifier);
```

## Build

```java
InWorldRecipe recipe = builder.build();
```

This method converts stored predicate/outcome lists into an `ImmutableList`. If priority was not manually set, it is automatically calculated.

## Complete Example

```java
InWorldRecipe recipe = InWorldRecipeBuilder.compatible(trigger)
    .icon(new ItemStackTemplate(Items.ANVIL))
    .offset(0, 0, 0)
    .hasItem(Items.IRON_INGOT)
    .hasBlock(block -> block
        .of(Blocks.STONE)
        .offset(0, -1, 0))
    .spawnItem(0, 1, 0, 1.0, new ItemStackTemplate(Items.DIAMOND))
    .priority(5)
    .maxEfficiency(32)
    .unlockedBy("has_iron", hasIronCriterion)
    .build();
```
