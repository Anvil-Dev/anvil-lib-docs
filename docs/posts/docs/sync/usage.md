---
title: Sync 使用指南
prev: false
next: false
---

# 使用指南 <Badge type="tip" text=">=26.1" />

## 内置同步目标类型

AnvilLib Sync 框架内置了 3 种常见的同步目标。如果你的 `@Sync` 字段所属对象是以下之一，**无需额外注册**：

| 目标类型 | 标识 | 查找方式 | 维度分发 |
|---------|------|---------|---------|
| 静态字段 (`Class<?>`) | 类全限定名 `String` | `Class.forName(className)` | 否（全局广播） |
| `Entity` 实例 | `UUID` | 根据 flow 在对应端的 Level 中查找 | 是（仅追踪实体的玩家） |
| `BlockEntity` 实例 | `BlockPos` | 根据 flow 在对应端的 Level 中查找 | 是（仅追踪该 chunk 的玩家） |

> 这些内置类型的 `SyncRegisterEntry` 在 `AnvilLibSyncEntries` 中已预注册。

## 基本用法

### 步骤 1：定义可同步类

```java
@Sync(SyncDirection.BOTH)
public class PlayerData {
    public final SyncProxy<Integer> score = new SyncProxy<>(0);
    public final SyncProxy<String> displayName = new SyncProxy<>("");
    public final SyncProxy<Boolean> isActive = new SyncProxy<>(true);
}
```

`@Sync` 注解的方向由字节码注入自动应用到所有 `SyncProxy` 字段上，无需手动设置。

### 步骤 2：在 Entity / BlockEntity 中使用

```java
public class MyBlockEntity extends BlockEntity {
    // 这些字段会自动同步 — MyBlockEntity 匹配内置的 BLOCK_ENTITY 策略
    public final SyncProxy<Integer> counter = new SyncProxy<>(0);
    public final SyncProxy<BlockPos> target = new SyncProxy<>(BlockPos.ZERO);
    public final SyncProxy<String> label = new SyncProxy<>("");

    // 仅服务端→客户端
    public final SyncProxy<Integer> remoteValue = new SyncProxy<>(0)
        .direction(SyncDirection.S2C);

    public MyBlockEntity(BlockPos pos, BlockState state) {
        super(MyBlockEntities.MY_TYPE, pos, state);
    }
}
```

因为 `BlockEntity` 是内置同步目标，框架已知道如何通过 `BlockPos` 定位它，无需额外注册。

### 步骤 3：读写字段

```java
// 写入（自动触发同步）
blockEntity.counter.setValue(42);

// 读取
int current = blockEntity.counter.getValue();
```

## 自定义同步目标

如果你的 `SyncProxy` 字段所属的对象**不是** `Class`、`Entity` 或 `BlockEntity`（例如自定义的 Manager 类、Capability 对象等），需要通过 NeoForge 的注册机制向 `SYNC_ENTRY_REGISTRY` 注册一个自定义的 `SyncRegisterEntry`。

### 注册流程

```java
// 1. 创建 DeferredRegister
public static final DeferredRegister<SyncRegisterEntry<?, ?>> SYNC_ENTRIES =
    DeferredRegister.create(AnvilLibSyncRegistries.SYNC_ENTRY, "mymod");

// 2. 注册自定义 SyncRegisterEntry
//    以 "Team" 为例：每个 Team 有唯一的 String id，通过 id 在服务端查找
public static final DeferredHolder<SyncRegisterEntry<?, ?>, SyncRegisterEntry<Team, String>> TEAM_SYNC =
    SYNC_ENTRIES.register("team", () ->
        SyncRegisterEntry.create(
            Team.class,              // 承载 SyncProxy 的对象类型
            ByteBufCodecs.STRING_UTF8, // Team 标识的编解码器
            Team::getId,              // 从 Team 拿到 String id
            (ctx, id) -> {            // Finder: 收到包后如何找回 Team
                MinecraftServer server = ctx.player().getServer();
                if (server == null) return null;
                return server.getScoreboard().getPlayerTeam(id);
            }
        )
    );

// 3. 在模组构造中注册
public MyMod(IEventBus modBus) {
    SYNC_ENTRIES.register(modBus);
}
```

### 各参数含义

`SyncRegisterEntry.create()` 的每个参数都有明确意义：

| 参数 | 含义 | Team 示例中的值 |
|------|------|---------------|
| `type` | 承载字段的对象类型 | `Team.class` |
| `idCodec` | 标识如何在网络上编解码 | `ByteBufCodecs.STRING_UTF8` |
| `idGetter` | 如何从对象提取唯一标识 | `Team::getId` |
| `finder` | 收到同步包后，如何根据标识 + 上下文找到对象 | 通过 Scoreboard 按 id 查找 Team |

### 维度感知的自定义目标

如果对象与特定维度关联，可以启用维度分发来减少不必要的网络流量：

```java
SYNC_ENTRIES.register("my_dimension_object", () ->
    SyncRegisterEntry.create(
        MyObject.class,
        MyObject.ID_CODEC,
        MyObject::getId,
        (ctx, id) -> MyObjectManager.get(id),  // Finder
        MyObject::getLevel                      // 维度提取器
    )
);
```

## 字节码注入（自动，无需用户操作）

当你在类上添加 `@Sync` 注解后，框架在类加载阶段自动完成以下工作（对用户**完全透明**）：

1. `SyncTargetIndex` 扫描所有模组的 `@Sync` 注解，建立目标类索引
2. `SyncClassProcessorProvider` 对索引中的类触发注入
3. `SyncBytecodeInjector` 使用 ASM 在构造函数/静态初始化器末尾注入：
   - `proxy.setParent(this / Owner.class)` — 让代理知道所属对象
   - `proxy.setFieldName("fieldName")` — 让代理知道字段名（网络同步时用于反射定位）
   - `proxy.setDirection(SyncDirection.XXX)` — 应用 `@Sync` 注解中定义的方向

用户无需做任何额外操作，只需声明字段为 `public final SyncProxy<T>` 并加 `@Sync` 注解即可。

## 完整示例：自定义同步

### 场景：同步游戏规则管理器中的值

```java
// 1. 定义同步类（不是 Entity/BlockEntity/static）
@Sync(SyncDirection.S2C)  // 服务端→客户端单向同步
public class GameRuleData {
    public final SyncProxy<Integer> maxPlayers = new SyncProxy<>(10);
    public final SyncProxy<Boolean> pvpEnabled = new SyncProxy<>(true);
}

// 2. 管理器中持有同步数据
public class GameRuleManager {
    private static final Map<String, GameRuleData> rules = new HashMap<>();

    public GameRuleData get(String key) { return rules.get(key); }
}

// 3. 注册自定义 SyncRegisterEntry
public static final DeferredRegister<SyncRegisterEntry<?, ?>> ENTRIES =
    DeferredRegister.create(AnvilLibSyncRegistries.SYNC_ENTRY, "mymod");

public static final DeferredHolder<SyncRegisterEntry<?, ?>, SyncRegisterEntry<GameRuleData, String>>
    GAMERULE_SYNC = ENTRIES.register("game_rule", () ->
        SyncRegisterEntry.create(
            GameRuleData.class,
            ByteBufCodecs.STRING_UTF8,          // 用 String key 作为标识
            rule -> rule.name,                   // ID getter（假设 GameRuleData 有 name 字段）
            (ctx, id) -> GameRuleManager.get(id) // Finder: 按名称查找
        )
    );
```

## 注意事项

- `SyncProxy` 字段必须为 `public final`
- 字段所属对象必须是内置类型（static/Entity/BlockEntity）或已注册了 `SyncRegisterEntry`
- 字节码注入对用户透明，不要手动调用 `proxy.setParent()` / `setFieldName()` / `setDirection()`
- 自定义类型的 StreamCodec 不能为 null
- `SyncPayload` 使用 `Class.forName()` 动态加载类，确保类在类路径中
- `finder` 可能返回 null（对象不存在时），此时同步包被忽略
