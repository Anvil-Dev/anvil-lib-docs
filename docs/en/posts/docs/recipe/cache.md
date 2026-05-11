---
title: Recipe Cache System
prev: false
next: false
---

# Cache System <Badge type="info" text="API renamed in 1.21.10" />

::: tip Note
In version 1.21.10, `IItemHandlerCache` (interface) became `ItemResourceHandlerCache` (concrete class), and
`ItemHandlerCacheElement` became `ItemResourceHandlerCacheElement`. Internal methods were also adapted: `getStackInSlot`
to `extract`, `getSlotLimit` to `getCapacityAsInt`, etc.
`ItemResourceHandlerCacheElement`. See the [version diff documentation](../version-diff) for details.
:::

The Recipe module uses **transactional caches** for world modifications: modifications are simulated first, and upon
recipe success, they are committed atomically via an acceptor. This ensures the world state remains intact when a recipe
fails.

## BlockCache

Manages and simulates block state changes. All modifications are first recorded in the cache and atomically committed
via `accept()`.

### Getting an Instance

```java
BlockCache cache = context.get(BlockCache.BLOCK_CACHE);
```

### Core Methods

| Method                                  | Description                                                          |
|-----------------------------------------|----------------------------------------------------------------------|
| `getBlockState(BlockPos)`               | Returns the simulated or real block state (cache takes priority)     |
| `getBlockEntity(BlockPos)`              | Returns the simulated or real block entity                           |
| `setBlock(BlockPos, BlockState)`        | Simulates placing a block                                            |
| `setBlock(BlockPos, Block)`             | Simulates placing a block (using default BlockState)                 |
| `setBlockEntity(BlockPos, BlockEntity)` | Simulates setting a block entity                                     |
| `removeBlock(BlockPos)`                 | Simulates removing a block (sets to air, cleans up entity)           |
| `accept()`                              | Commits all modifications to the world (writes only changed entries) |

### How It Works

1. First call to `getBlockState(pos)` reads the real state from the Level and caches it
2. `setBlock(pos, state)` overwrites the cached value
3. `accept()` iterates the cache and only writes entries differing from the cached real state into the world
4. Block entity NBT follows the same approach, comparing differences via `saveWithFullMetadata`

### Default Acceptor

`BlockCache.DEFAULT_ACCEPTOR` is registered via `context.putAcceptor()` and automatically calls `accept()` when recipe
execution ends.

## ItemCache <Badge type="info" text="changed in 26.1" />

Manages item input/output, supporting item extraction from and insertion into item entities and block entity
inventories.

### Getting an Instance

```java
ItemCache cache = context.get(ItemCache.ITEM_CACHE);
```

### Core Methods

| Method                                       | Description                                                          |
|----------------------------------------------|----------------------------------------------------------------------|
| `grow(Vec3 center, Vec3 range)`              | Expands the cache scan range                                         |
| `inRange(Vec3 pos, Vec3 range)`              | Checks whether a position is already within the scan range           |
| `getInput(ItemLike, Vec3 pos)`               | Gets input matching a given item type                                |
| `getInput(ItemLike, Vec3 pos, Vec3 range)`   | Gets input with range scanning                                       |
| `getInput(ItemStack, Vec3 pos)`              | Gets input by exact match                                            |
| `getInput(Predicate<ItemStack>, Vec3 pos)`   | Gets input by custom predicate                                       |
| `getOutput(ItemStack, Vec3 pos)`             | Gets the output target position                                      |
| `getOutput(ItemStack, Vec3 pos, Vec3 range)` | Output target with range                                             |
| `pushSpawnList(Collection<SpawnOperation>)`  | Adds item spawn operations to the queue                              |
| `endCache()`                                 | Ends the cache: synchronizes all inputs/outputs, spawns queued items |

### Mechanism

- **Input**: Matches item entities or items in block entity inventories, marks them, and can deduct from inventories
- **Output**: Attempts to place items into existing item entities or block entity inventories; otherwise adds to the
  spawn list
- **Spawning**: On `endCache()`, merges item stacks at the same position and type, splits by max stack size, and spawns

The default Acceptor (`ItemCache.DEFAULT_ACCEPTOR`) automatically calls `endCache()`.

## TagCache

A simple NBT tag cache for sharing temporary data between predicates/outcomes.

### Getting an Instance

```java
TagCache cache = context.get(TagCache.TAG_CACHE);
```

### Methods

| Method                                  | Description                                               |
|-----------------------------------------|-----------------------------------------------------------|
| `getTag(Identifier)`                    | Gets a cached NBT Tag by ID (returns null if not present) |
| `putTag(Identifier, Tag)`               | Stores an NBT Tag                                         |
| `computeIfAbsent(Identifier, Function)` | Lazily computes and caches                                |

## Usage Example

```java
// In a predicate
public void accept(InWorldRecipeContext ctx) {
    BlockCache blocks = ctx.get(BlockCache.BLOCK_CACHE);
    blocks.removeBlock(pos);  // Simulate breaking a block

    ItemCache items = ctx.get(ItemCache.ITEM_CACHE);
    items.getInput(Items.IRON_INGOT, pos);

    TagCache tags = ctx.get(TagCache.TAG_CACHE);
    tags.putTag(someId, new CompoundTag());
}
// accept() / endCache() are automatically called by default acceptors when the recipe ends
```

## Notes

- Cache modifications only truly affect the world after `accept()`/`endCache()`
- When a recipe match fails, `context.getStack().clear()` triggers `clearStack()` to clean up caches
- `BlockCache.DEFAULT_ACCEPTOR` and `ItemCache.DEFAULT_ACCEPTOR` are automatically registered via
  `context.putAcceptor()`
