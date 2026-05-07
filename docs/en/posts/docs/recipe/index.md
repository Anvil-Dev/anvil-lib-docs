---
title: In-World Recipes
prev: false
next: false
---

# In-World Recipe Module <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="changed: 1.21.2 / 1.21.10 / 26.1" />

The package `dev.anvilcraft.lib.v2.recipe` provides a **world-interaction recipe system**
that allows recipes to be triggered by entity/block interactions within the world, rather than executed in a traditional crafting table. It supports conditional predicates, probabilistic outcomes, transactional caches, datapack definitions, and network synchronization.

## Architecture Overview

An in-world recipe consists of the following layers:

1. **Trigger** (`IRecipeTrigger`) -- Defines what event triggers recipe detection
2. **Predicate** (`IRecipePredicate`) -- Conditions for recipe matching, divided into conflicting (consuming) and non-conflicting (check-only)
3. **Outcome** (`IRecipeOutcome`) -- The result executed after a successful match
4. **Context** (`InWorldRecipeContext`) -- Runtime state for a single recipe execution
5. **Cache** (`BlockCache` / `ItemCache` / `TagCache`) -- Transactional world modifications
6. **Manager** (`InWorldRecipeManager`) -- Recipe registration and dispatch

## Document Index

| Document                          | Content                                                     |
|-----------------------------------|-------------------------------------------------------------|
| [Core Recipe Structure](./core)   | `InWorldRecipe`, recipe serialization, priority calculation |
| [Builder](./builder)              | `InWorldRecipeBuilder` fluent API, data generation          |
| [Predicate System](./predicate)   | `IRecipePredicate` interface, built-in predicates (HasItem / HasBlock, etc.) |
| [Outcomes & Triggers](./outcome)  | `IRecipeOutcome` interface, built-in outcomes, `IRecipeTrigger` |
| [Cache System](./cache)           | `BlockCache`, `ItemCache`, `TagCache` transactional modifications |
| [Runtime Management](./manager)   | `InWorldRecipeManager`, `InWorldRecipeContext`, events, registries |

## Module Main Class

### AnvilLibRecipe

Mod entry point, `@Mod("anvillib_recipe")`, responsible for initializing data component predicates and recipe registries.

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_recipe";

// Create an Identifier in the anvillib namespace
public static Identifier of(String path) { ... }
```

## Notes

- All recipe detection runs on the server side; `InWorldRecipeContext` is not thread-safe
- The config parameter `inWorldRecipeMaxEfficiency` provides a global efficiency upper limit
- Compatible mode (`compatible=true`) allows multiple recipes to share inputs
- Non-compatible mode (`compatible=false`) causes conflicting predicates to be consumed, preventing other recipes
