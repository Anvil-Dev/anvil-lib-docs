---
title: Multiblock Runtime Management
prev: false
next: false
---

# Runtime Management

## MultiblockState

Represents the runtime state of a multiblock instance.

```java
@Getter @Setter
public class MultiblockState {
    private final BlockPos controllerPos;                        // Controller absolute position
    private final ResourceKey<MultiblockDefinition> definitionKey; // Definition registry key
    private Holder.Reference<MultiblockDefinition> definition;    // Lazily resolved definition reference
    private boolean formed;                                      // Whether currently formed

    public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey);
    public MultiblockState(BlockPos controllerPos, ResourceKey<MultiblockDefinition> definitionKey, boolean formed);

    // Lazy resolve the definition (retrieve from registry and cache)
    public Holder.Reference<MultiblockDefinition> getDefinition(HolderLookup.Provider registries);
}
```

### Serialization

| Field            | Codec                                | StreamCodec                                |
|-----------------|--------------------------------------|--------------------------------------------|
| `controllerPos` | `BlockPos.CODEC`                     | `StreamCodecUtil.VAR_INT_BLOCK_POS`        |
| `definitionKey` | `ResourceKey.codec(DEFINITIONS_KEY)` | `ResourceKey.streamCodec(DEFINITIONS_KEY)` |

## DynamicMultiblockManager

Per-dimension global manager, extending `SavedData` for persistence.

### Getting an Instance

```java
// Server: read from SavedData, create if not present
// Client: use WeakHashMap in-memory cache
DynamicMultiblockManager manager = DynamicMultiblockManager.get(level);
```

### Query Methods

| Method                                              | Description                                               |
|-----------------------------------------------------|-----------------------------------------------------------|
| `getAt(BlockPos pos)`                               | Get the multiblock state at the specified position (returns null if not present) |
| `containsAt(BlockPos pos)`                          | Check whether a controller is registered at the position  |
| `add(MultiblockState state)`                        | Register a new multiblock, mark as dirty                  |
| `removeAt(BlockPos pos)`                            | Remove and return the multiblock state, mark as dirty     |
| `updateFormed(Level, MultiblockState, boolean)`     | Update the formed status (triggers callbacks and network sync on state change) |

### updateFormed Details

```java
public void updateFormed(Level level, MultiblockState cur, boolean formed) {
    if (cur.isFormed() == formed) return;  // State unchanged, ignore
    cur.setFormed(formed);
    if (level.isClientSide()) return;

    // 1. Verify the controller block is still valid
    BlockState state = level.getBlockState(controllerPos);
    if (def.isController(level, state, level.getBlockEntity(controllerPos))) {
        IController controller = ControllerRecord.get(state.getBlock(), definitionId);
        if (formed) controller.onFormed(level, cur);
        else controller.onUnformed(level, cur);
    }

    // 2. Broadcast network packet to all players
    for (ServerPlayer player : players) {
        if (formed)
            PacketDistributor.sendToPlayer(player, new MultiblockFormPacket(cur));
        else
            PacketDistributor.sendToPlayer(player, new MultiblockUnformPacket(cur));
    }

    // 3. Mark for saving
    this.setDirty();
}
```

### Event Triggers

#### Block Placement (onPlace)

```java
DynamicMultiblockManager.onPlace(level, pos, state);

// Internal flow:
// 1. Iterate over all registered definitions
// 2. Attempt correctPos() position correction
// 3. Call definition.isController() to evaluate
// 4. Match successful → create MultiblockState → add() → sync detection
```

#### Block Break (onBreak)

```java
DynamicMultiblockManager.onBreak(level, pos);

// Break position is controller → updateFormed(false) → removeAt(pos)
// Break position is a component of a formed multiblock → updateFormed(false) (mark as unformed)
```

## Async Detection

### Trigger Timing

`BlockEventListener` calls `checkMultiblockFormed(level)` on each `LevelTickEvent.Post` (server side).

### Detection Frequency

Controlled by `AnvilLibMultiblockConfig`:

| Configuration                     | Default | Range  | Description                                    |
|----------------------------------|---------|--------|------------------------------------------------|
| `unformedMultiblockCheckInterval` | 10      | 5-100  | Check interval for unformed multiblocks (ticks) |
| `formedMultiblockCheckInterval`   | 20      | 5-100  | Check interval for formed multiblocks (ticks)   |
| `asyncThreadPoolSize`             | 4       | 1-16   | Async thread pool size                          |
| `maxChecksPerTick`                | 128     | 1-512  | Maximum checks per tick (limited by dedup set)  |

### Detection Flow

```
1. tickCounter increments, proceeds when interval threshold is met
2. Collect candidate MultiblockStates (skip those already in pendingChecks, limit by maxChecksPerTick)
3. Main thread builds MultiblockCheckSnapshot (immutable snapshot):
   - Retrieve block state → BlockState
   - If predicate depends on block entity → saveWithFullMetadata() serialize NBT
4. Submit to async thread pool for snapshot.test() execution
5. Result callback on main thread: updateFormed(level, state, formed)
```

### Thread-Safety Design

- `asyncExecutor`: `volatile` + `synchronized` double-checked locking for creation
- `pendingChecks`: `ConcurrentHashMap.newKeySet()` to prevent re-entrance
- `MultiblockCheckSnapshot`: fully immutable, containing copies of all required data
- Async threads only access snapshot data, never touching `Level`
- Result callback returns to main thread via `level.getServer().execute()`

### Executor Lifecycle

```java
// Lazy creation (on first detection)
getOrCreateExecutor();

// Shutdown on server stop
DynamicMultiblockManager.shutdownExecutor();
// → shutdownNow(), awaitTermination(5s)
```

### Synchronous Detection (onPlace)

Synchronous detection is used when placing a block for immediate feedback (not via the async thread pool):

```java
private void checkMultiblockFormedSync(Level level, MultiblockState state) {
    // Main thread directly iterates all predicates, calling test(level, blockState, blockEntity)
}
```

## Persistence

```java
// SavedDataType key
public static final SavedDataType<DynamicMultiblockManager> TYPE = new SavedDataType<>(
    AnvilLibMultiblock.of("multiblocks"),
    DynamicMultiblockManager::new,  // default factory
    DynamicMultiblockManager.CODEC,
    null                            // no stream codec needed (server-only)
);
```

Serialized as JSON `List<MultiblockState>`, stored in world data.

## Network Sync

On state change, broadcasts `IClientboundPacket` packets (under `anvillib:multiblock_form`/`anvillib:multiblock_unform`):

- **On client receive**: Adds the state to the local `DynamicMultiblockManager`, updates the formed flag
- **If the controller block is still valid**: Calls the corresponding `onFormed`/`onUnformed` to trigger client-side rendering/sounds, etc.

Network packets are auto-registered via `NetworkRegistrar.register(registrar, MOD_ID)` (inside `AnvilLibMultiblock.onNetwork()`).

## Configuration

```java
@Config(name = "anvillib_multiblock")
public class AnvilLibMultiblockConfig {
    @BoundedDiscrete(min = 5, max = 100)
    public int unformedMultiblockCheckInterval = 10;

    @BoundedDiscrete(min = 5, max = 100)
    public int formedMultiblockCheckInterval = 20;

    @BoundedDiscrete(min = 1, max = 16)
    public int asyncThreadPoolSize = 4;

    @BoundedDiscrete(min = 1, max = 512)
    public int maxChecksPerTick = 128;
}
```

Registered via `ConfigManager.register(MOD_ID, AnvilLibMultiblockConfig::new)`, supports TOML configuration files and GUI configuration interface.

## Complete Usage Example

### Step 1: Define the Multiblock (Datapack JSON)

```json
{
  "grid": [
    [["0"]],
    [["G"]]
  ],
  "mapping": {
    "0": { "block": "mymod:controller" },
    "G": { "block": "minecraft:gold_block" }
  }
}
```

### Step 2: Implement the Controller

```java
public class MyController extends SimpleController {
    public MyController() {
        super(MyBlocks.CONTROLLER,
            ResourceLocation.fromNamespaceAndPath("mymod", "my_multiblock"));
    }

    @Override
    public void onFormed(Level level, MultiblockState state) {
        if (!level.isClientSide()) {
            // Server-side logic
        }
    }
}
```

### Step 3: Register

```java
// During mod initialization
ControllerRecord.register(new MyController());
```

### Step 4: Place the Block

After placing blocks in-game according to the definition, the system automatically detects and triggers callbacks.
