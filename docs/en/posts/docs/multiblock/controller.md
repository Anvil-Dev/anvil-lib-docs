---
title: Multiblock Controller
prev: false
next: false
---

# Controller

## IController

Controller interface, defining multiblock detection and lifecycle behavior.

```java
public interface IController {
    Block getBlock();           // The controller block
    Identifier getDefinitionId(); // The associated definition ID

    // Lifecycle callbacks
    default void onFormed(Level level, MultiblockState state) { }
    default void onUnformed(Level level, MultiblockState state) { }

    // Correct the controller position (multiblock component adjustment)
    default BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state) {
        return pos;
    }
}
```

### correctPos Use Cases

When the controller detects that the block is not exactly at the `ZERO` position in the definition, you can correct it
via this method. For example: a multiblock component acts as a "controller marker" but the actual controller block is at
an adjacent position.

```java
@Override
public BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state) {
    // The actual controller is 1 block above the detected position
    return pos.above();
}
```

## SimpleController

A convenient abstract base class that stores Block and DefinitionId as final fields.

```java
@Getter
public abstract class SimpleController implements IController {
    private final Block block;
    private final Identifier definitionId;

    protected SimpleController(Block block, Identifier definitionId) {
        this.block = block;
        this.definitionId = definitionId;
    }
}
```

### Usage

```java
public class MyMultiblockController extends SimpleController {
    public MyMultiblockController() {
        super(
            MyBlocks.CONTROLLER,
            ResourceLocation.fromNamespaceAndPath("mymod", "my_multiblock")
        );
    }

    @Override
    public void onFormed(Level level, MultiblockState state) {
        // When formed: update textures, start particles, play sounds, etc.
        if (level instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.END_ROD, ...);
        }
    }

    @Override
    public void onUnformed(Level level, MultiblockState state) {
        // When unformed: restore default state
    }

    @Override
    public BlockPos correctPos(ServerLevel level, BlockPos pos, BlockState state) {
        // Optional: correct the controller position
        return pos;
    }
}
```

**Directly implementing IController** on a block is also recognized:

```java
public class ControllerBlock extends Block implements IController {
    @Override
    public Block getBlock() { return this; }

    @Override
    public Identifier getDefinitionId() {
        return ResourceLocation.fromNamespaceAndPath("mymod", "definition_id");
    }
}
```

## ControllerRecord

A static registry that maintains a `(Block, Identifier)` → `IController` mapping.

```java
public class ControllerRecord {
    // Register a SimpleController
    public static void register(SimpleController controller);

    // Look up a controller (throws IllegalArgumentException if not found and block does not implement IController)
    public static IController get(Block block, Identifier definitionId);
}
```

### Lookup Logic

1. Search the `CONTROLLERS` map for an exact `(Block, DefinitionId)` match
2. If not found, check whether Block is `instanceof IController`
3. If so, auto-register it in the map (cache) and return
4. If neither, throw `IllegalArgumentException`

### Registration

```java
// Register during mod construction (e.g., in @Mod constructor or common setup)
ControllerRecord.register(new MyMultiblockController());
```

### ControllerInfo (Internal)

```java
// package-private key record
record ControllerInfo(Block block, Identifier definitionId) { }
```

## Lifecycle

### Formed Flow (onFormed)

1. Block placed → `DynamicMultiblockManager.onPlace()` synchronous detection
2. All predicates match → `updateFormed(level, state, true)`
3. `ControllerRecord.get(block, definitionId)` retrieves the controller
4. Calls `controller.onFormed(level, state)`
5. Broadcasts `MultiblockFormPacket` to all clients
6. Clients receive and call local `controller.onFormed(level, state)`

### Unformed Flow (onUnformed)

1. Block broken or async detection fails → `updateFormed(level, state, false)`
2. Calls `controller.onUnformed(level, state)`
3. Broadcasts `MultiblockUnformPacket` to all clients
4. Clients receive and call local `controller.onUnformed(level, state)`

### Notes

- `onFormed`/`onUnformed` are called on both server and client (synced to clients via network packets)
- Controller callbacks verify that the controller block is still valid before execution (`isController()` check)
- If the controller block is destroyed or replaced with a non-controller block, the callback will not execute
