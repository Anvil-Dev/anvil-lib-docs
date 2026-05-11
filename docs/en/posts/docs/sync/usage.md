---
title: Sync Usage Guide
prev: false
next: false
---

# Usage Guide <Badge type="tip" text=">=26.1" />

## Built-in Sync Target Types

AnvilLib Sync has 3 built-in target types. If your `@Sync` field's parent object is one of the following, **no extra
registration is needed**:

| Target Type               | Identifier    | Lookup Strategy                               | Dimension                  |
|---------------------------|---------------|-----------------------------------------------|----------------------------|
| Static field (`Class<?>`) | FQCN `String` | `Class.forName(className)`                    | No (global broadcast)      |
| `Entity` instance         | `UUID`        | Find in Level on the appropriate side by flow | Yes (entity trackers only) |
| `BlockEntity` instance    | `BlockPos`    | Find in Level on the appropriate side by flow | Yes (chunk trackers only)  |

> These built-in `SyncRegisterEntry` instances are pre-registered in `AnvilLibSyncEntries`.

## Basic Usage

### Step 1: Define a Synchronizable Class

```java
@Sync(SyncDirection.BOTH)
public class PlayerData {
    public final SyncProxy<Integer> score = new SyncProxy<>(0);
    public final SyncProxy<String> displayName = new SyncProxy<>("");
    public final SyncProxy<Boolean> isActive = new SyncProxy<>(true);
}
```

The `@Sync` direction is auto-applied to all fields by bytecode injection.

### Step 2: Use in Entity / BlockEntity

```java
public class MyBlockEntity extends BlockEntity {
    // These fields auto-sync — MyBlockEntity matches the built-in BLOCK_ENTITY strategy
    public final SyncProxy<Integer> counter = new SyncProxy<>(0);
    public final SyncProxy<String> label = new SyncProxy<>("");

    // Server → Client only
    public final SyncProxy<Integer> remoteValue = new SyncProxy<>(0)
        .direction(SyncDirection.S2C);

    public MyBlockEntity(BlockPos pos, BlockState state) {
        super(MyBlockEntities.MY_TYPE, pos, state);
    }
}
```

`BlockEntity` is a built-in target — the framework already knows how to locate it via `BlockPos`.

### Step 3: Read and Write

```java
blockEntity.counter.setValue(42);   // Write (auto-syncs)
int current = blockEntity.counter.getValue(); // Read
```

## Custom Sync Targets

If your `SyncProxy` field's parent object is **NOT** a `Class`, `Entity`, or `BlockEntity` (e.g., custom managers,
capabilities), you must register a custom `SyncRegisterEntry` via NeoForge's registry mechanism.

### Registration

```java
// 1. Create DeferredRegister
public static final DeferredRegister<SyncRegisterEntry<?, ?>> SYNC_ENTRIES =
    DeferredRegister.create(AnvilLibSyncRegistries.SYNC_ENTRY, "mymod");

// 2. Register a custom strategy — e.g., for a "Team" object
public static final DeferredHolder<SyncRegisterEntry<?, ?>, SyncRegisterEntry<Team, String>> TEAM_SYNC =
    SYNC_ENTRIES.register("team", () ->
        SyncRegisterEntry.create(
            Team.class,
            ByteBufCodecs.STRING_UTF8,
            Team::getId,
            (ctx, id) -> {
                MinecraftServer server = ctx.player().getServer();
                if (server == null) return null;
                return server.getScoreboard().getPlayerTeam(id);
            }
        )
    );

// 3. Register in mod constructor
public MyMod(IEventBus modBus) {
    SYNC_ENTRIES.register(modBus);
}
```

### Parameter Meanings

Each parameter of `SyncRegisterEntry.create()` has a clear meaning:

| Parameter  | Meaning                                              | Team Example                |
|------------|------------------------------------------------------|-----------------------------|
| `type`     | Object type carrying sync fields                     | `Team.class`                |
| `idCodec`  | How to codec the identifier on the network           | `ByteBufCodecs.STRING_UTF8` |
| `idGetter` | How to extract the identifier from the object        | `Team::getId`               |
| `finder`   | How to find the object from the identifier + context | Lookup via Scoreboard       |

### Dimension-Aware Custom Target

```java
SYNC_ENTRIES.register("my_object", () ->
    SyncRegisterEntry.create(
        MyObject.class,
        MyObject.ID_CODEC,
        MyObject::getId,
        (ctx, id) -> MyObjectManager.get(id),
        MyObject::getLevel   // Dimension getter
    )
);
```

## Bytecode Injection (Automatic)

With a `@Sync` annotation on the class, the framework auto-injects at class-load time (completely transparent):

1. `SyncTargetIndex` scans all mod annotations for `@Sync`
2. `SyncClassProcessorProvider` triggers injection only for indexed classes
3. `SyncBytecodeInjector` uses ASM to inject at end of constructors: `setParent`, `setFieldName`, `setDirection`

No user action needed.

## Complete Example: Custom Sync

```java
// 1. Define sync class (not Entity/BlockEntity/static)
@Sync(SyncDirection.S2C)
public class GameRuleData {
    public final SyncProxy<Integer> maxPlayers = new SyncProxy<>(10);
    public final SyncProxy<Boolean> pvpEnabled = new SyncProxy<>(true);
}

// 2. Manager holds sync data
public class GameRuleManager {
    private static final Map<String, GameRuleData> rules = new HashMap<>();
    public GameRuleData get(String key) { return rules.get(key); }
}

// 3. Register custom SyncRegisterEntry
public static final DeferredRegister<SyncRegisterEntry<?, ?>> ENTRIES =
    DeferredRegister.create(AnvilLibSyncRegistries.SYNC_ENTRY, "mymod");

public static final DeferredHolder<SyncRegisterEntry<?, ?>, SyncRegisterEntry<GameRuleData, String>>
    GAMERULE_SYNC = ENTRIES.register("game_rule", () ->
        SyncRegisterEntry.create(
            GameRuleData.class,
            ByteBufCodecs.STRING_UTF8,
            rule -> rule.name,
            (ctx, id) -> GameRuleManager.get(id)
        )
    );
```

## Notes

- `SyncProxy` fields must be `public final`
- Parent object must be a built-in type (static/Entity/BlockEntity) or have a registered `SyncRegisterEntry`
- Do not manually call `proxy.setParent()` / `setFieldName()` / `setDirection()` — bytecode injection handles it
- Custom type StreamCodec must not be null
- `SyncPayload` uses `Class.forName()` — ensure classes are on the classpath
- `finder` may return null (object gone); the sync packet is simply ignored
