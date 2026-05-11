---
title: Recipe Runtime Management
prev: false
next: false
---

# Runtime Management

## InWorldRecipeManager

The core runtime manager, responsible for storing and dispatching in-world recipes.

### Structure

```java
public class InWorldRecipeManager {
    // Trigger -> sorted recipes (by Comparator on RecipeHolder.value())
    public final Multimap<IRecipeTrigger, RecipeHolder<InWorldRecipe>> recipeHolders;
}
```

### Methods

| Method                                                    | Description                                |
|-----------------------------------------------------------|--------------------------------------------|
| `register(RecipeHolder<InWorldRecipe>)`                   | Registers a recipe, categorized by trigger |
| `trigger(IRecipeTrigger, InWorldRecipeContext)`           | Triggers recipe detection and execution    |
| `trigger(Supplier<IRecipeTrigger>, InWorldRecipeContext)` | Supplier form                              |

### Trigger Logic

```java
public void trigger(IRecipeTrigger trigger, InWorldRecipeContext ctx) {
    if (ctx.getLevel().isClientSide()) return;  // Server-side only
    for (RecipeHolder<InWorldRecipe> holder : recipeHolders.get(trigger)) {
        InWorldRecipe recipe = holder.value();
        boolean accept = false;
        for (int i = 0; i < AnvilLibRecipe.CONFIG.inWorldRecipeMaxEfficiency; i++) {
            if (i >= recipe.maxEfficiency()) break;
            if (!recipe.matches(ctx, ctx.getLevel())) {
                if (!accept) break;
                return;
            }
            accept = true;
            recipe.assemble(ctx);
            NeoForge.EVENT_BUS.post(new InWorldRecipeEvent(
                recipe.getType(), holder.id().identifier(), recipe, ctx
            ));
        }
        if (accept) break;  // Stop after the first matched recipe executes
    }
}
```

Key behaviors:

1. Looks up all registered recipes by trigger
2. Sorted by priority (TreeSet ordering within Multimap)
3. Loops `matches()` -> `assemble()` until no longer matching or efficiency cap is reached
4. Posts `InWorldRecipeEvent` after each successful assembly
5. Immediately breaks on the first successful match in non-compatible mode

### Integration with Vanilla RecipeManager

Integrated into Minecraft's `RecipeManager` via the `IRecipeManagerExtension` interface (Mixin injection):

```java
public interface IRecipeManagerExtension {
    void anvillib$setInWorldRecipeManager(InWorldRecipeManager manager);
    InWorldRecipeManager anvillib$getInWorldRecipeManager();
    void anvillib$addRecipes(List<RecipeHolder<InWorldRecipe>> recipes);
}
```

## InWorldRecipeContext

Carries the runtime state for a single recipe execution, implementing `RecipeInput`.

### Construction

```java
new InWorldRecipeContext(ServerLevel level, Vec3 pos, @Nullable Entity entity)
```

### Core Methods

| Method                                                    | Description                                                     |
|-----------------------------------------------------------|-----------------------------------------------------------------|
| `getLevel()`                                              | Gets the `ServerLevel`                                          |
| `getPos()`                                                | Gets the execution center position                              |
| `getEntity()`                                             | Gets the associated entity (can be null)                        |
| `getStack()`                                              | Gets the thread-safe predicate operation stack                  |
| `push(IRecipePredicate)` / `pop(IRecipePredicate)`        | Push/pop predicate stack (with snapshot/rollback)               |
| `put(InWorldRecipeData<T>, T)`                            | Stores type-safe key-value data                                 |
| `get(InWorldRecipeData<T>)`                               | Gets data by key (uses the Data's default supplier when absent) |
| `computeIfAbsent(InWorldRecipeData<T>)`                   | Lazily computes and caches                                      |
| `putAcceptor(Identifier, Consumer<InWorldRecipeContext>)` | Registers a completion callback                                 |
| `accept()`                                                | Invokes all registered acceptors                                |
| `getFloat(NumberProvider)` / `getInt(NumberProvider)`     | Evaluates a NumberProvider                                      |
| `emptyLootContext()`                                      | Creates an empty loot context                                   |

### Predefined Data Keys

| Key                      | Type                            | Description              |
|--------------------------|---------------------------------|--------------------------|
| `BlockCache.BLOCK_CACHE` | `InWorldRecipeData<BlockCache>` | Block modification cache |
| `ItemCache.ITEM_CACHE`   | `InWorldRecipeData<ItemCache>`  | Item input/output cache  |
| `TagCache.TAG_CACHE`     | `InWorldRecipeData<TagCache>`   | NBT tag cache            |

## Custom Registries

`LibRegistries` registers 5 NeoForge registries (all capped at 512 entries):

| Registry                           | Key                           | Registered Type              |
|------------------------------------|-------------------------------|------------------------------|
| `TRIGGER_REGISTRY`                 | `anvillib:trigger`            | `IRecipeTrigger`             |
| `PREDICATE_TYPE_REGISTRY`          | `anvillib:predicate`          | `IRecipePredicate.Type<?>`   |
| `PREDICATE_FUNCTION_TYPE_REGISTRY` | `anvillib:predicate_function` | `IPredicateFunction.Type<?>` |
| `OUTCOME_TYPE_REGISTRY`            | `anvillib:outcome`            | `IRecipeOutcome.Type<?>`     |
| `OUTCOME_FUNCTION_TYPE_REGISTRY`   | `anvillib:outcome_function`   | `IOutcomeFunction.Type<?>`   |

All registries are synced to the client; registration is handled via the `registerRegistries(NewRegistryEvent)` event.

## Event System

### InWorldRecipeEvent

Posted after successful recipe execution. Carries the recipe type, ID, instance, and context.

```java
public class InWorldRecipeEvent extends Event {
    public RecipeType<?> recipeType;
    public Identifier id;
    public InWorldRecipe recipe;
    public InWorldRecipeContext context;
}
```

### InWorldRecipeManagerEvent.Init

Posted when `InWorldRecipeManager` initializes. Provides access to the vanilla `RecipeManager`:

```java
event.getManager();      // InWorldRecipeManager
event.getRecipeManager(); // Minecraft RecipeManager
```

### ItemCacheEvent.SpawnItemEntity

Posted just before an item entity is spawned. Can modify or cancel the spawn:

```java
event.getEntity();  // The ItemEntity to be spawned
event.getCache();   // ItemCache instance
```

### ItemEntityEvent.InToBlock

Posted when an item entity enters/collides with a block:

```java
event.getLevel();     // World
event.getEntity();    // The item entity
event.getBlockPos();  // The block position entered
event.getPos();       // Exact position
event.getMotion();    // Motion vector
```

## Notes

- `InWorldRecipeManager.trigger()` runs server-side only
- The config `inWorldRecipeMaxEfficiency` provides a global efficiency cap to prevent infinite loops
- All registries are automatically synced to the client via NeoForge's sync registry system
- `InWorldRecipeContext` instances have a lifetime scoped to a single recipe trigger; do not share across recipes
