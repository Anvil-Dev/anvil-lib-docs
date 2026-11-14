# Processor 字节码转换与网络同步机制

本篇解释 `module.sync` 与子模块 `module.sync:processor` 在 NeoForge 1.21.1 下的底层实现机制，帮助开发者理解零手动登记是如何实现的，以及如何在复杂继承、跨维度传输或自定义网络环境下排查问题。

## Processor 与字节码注入（ICoreMod 模式）

在 Maven/Gradle 中引入 `anvillib-sync-neoforge-1.21.1` 时，子模块 `anvillib-sync-processor-neoforge-1.21.1` 会通过 `slimJarJar` **自动打包嵌套传递**到游戏运行环境中，无需开发者手动声明处理器依赖。

在 NeoForge 1.21.1（FML Loader 4.0.x）环境下，由于尚不存在高版本的 `ClassProcessor` SPI，`module.sync:processor` 通过标准 SPI 文件：

`META-INF/services/net.neoforged.neoforgespi.coremod.ICoreMod` -> `dev.anvilcraft.lib.v2.sync.transform.SyncClassProcessor`

向 ModLauncher 注册 ASM `ITransformer<ClassNode>` 类转换器。

### 启动时序与字节码改写内容

1. **Mod 发现阶段（早于目标类加载）**：
   - `SyncTargetIndex` 静态扫描 `LoadingModList` 中所有带 `@Sync` 类注解的目标类内部名与 `SyncDirection` 方向值。
   - `LazySyncTargetIndex` 静态扫描所有带 `@LazySync` 字段注解的所属类内部名。
2. **类加载转化阶段 (`SyncTransformer.transform`)**：
   - 若类在 `SyncTargetIndex` 中：`SyncBytecodeInjector` 检查所有 **`final SyncProxy`** 字段，并在所有构造器 `<init>` 返回前注入 `proxy.setParent(this)`、`proxy.setFieldName(name)`、`proxy.setDirection(classDir)`；对于 `static final` 字段则在 `<clinit>`（无则自动新建）末尾注入 `proxy.setParent(Owner.class)` 等调用。
   - 若类在 `LazySyncTargetIndex` 中：`LazySyncBytecodeInjector` 在所有 `<init>` 返回前注入 `AnvilLibSync.LAZY_SYNC_MANAGER.track(this)`；对于静态 `@LazySync` 字段在 `<clinit>` 末尾注入 `AnvilLibSync.LAZY_SYNC_MANAGER.trackStatic(Owner.class)`。

::: tip 自动 GC 与继承支持
- `LazySyncManager` 内部使用基于 Guava `MapMaker().weakKeys()` 的弱引用集合与快照表保存实例目标；当 `Entity` 或 `BlockEntity` 被卸载且无外界强引用时可被自动垃圾回收，**无需显式反注册**。
- `LazySyncManager` 收集元数据时沿父类链向上递归（`clazz -> superclass -> ...`），因此子类实例也会自动继承并同步父类中声明的 `@LazySync` 字段（条件是客户端与服务端对宿主类的识别与 `SyncRegisterEntry` 一致）。
:::

## 配置同步与分包转发规则

### 1. Configuration 阶段统一字段索引表

为了不在每次字段变动时传输冗长的 `"com.example.MyTile#manaPool"` 字符串，模块采用了与 RPC 相同的配置压缩表：
- 模组初始化完毕（`FMLCommonSetupEvent`）后，`SyncConfigManager.compileContent()` 扫描全部 `@Sync` 类的 `final SyncProxy` 字段与 `@LazySync` 字段并分配自增 `int` 索引 `syncConfigId`。
- 玩家进入服务端处于 Configuration 阶段时，`AnvilLibSync.SyncConfig` 任务下发 `SyncConfigurationPayload(syncMap)`；客户端将映射写入 `AnvilLibSyncClient.SYNC_CONFIG_MANAGER` 并回复 `SyncConfigurationFinishPayload` 完成握手。

### 2. 分维度、分追踪玩家定向广播 (`SideUtil`)

当服务端发送同步包时，`SideUtil.serverSend(...)` 会根据宿主 `SyncRegisterEntry` 决定广播范围，避免无谓的全服发包：

| 宿主条件 (`entry.dimension()` & ID/对象类型) | NeoForge 发送目标 |
| --- | --- |
| `dimension == false` 或 `dimensionGetter == null`（如 `STATIC` 静态类） | `PacketDistributor.sendToAllPlayers(packet)` |
| 宿主 ID 为 `BlockPos`（如 `BLOCK_ENTITY`） | `PacketDistributor.sendToPlayersTrackingChunk(level, ChunkPos(pos), packet)` |
| 宿主对象为 `Entity` | `PacketDistributor.sendToPlayersTrackingEntity(entity, packet)` 后并再执行维度发送（注：源码中此处未使用 `return`，因此对实体也会落到 `sendToPlayersInDimension`） |
| 其他带维度对象 | `PacketDistributor.sendToPlayersInDimension(level, packet)` |

客户端发送（`C2S` / `BOTH`）则统一调用 `PacketDistributor.sendToServer(...)`。

### 3. `LazySyncPayload` 与回环抑制

`LazySyncManager` 在收到对端发来的 `LazySyncPayload` 并通过反射 `field.set(...)` 写回字段后，**会立即用写回后的新值重新编码一次并覆写本地快照 `snap.put(configKey, encoded)`**。这样可以彻底防止同一条变更在下一个 Tick 被本端误判为“本地新变更”而无限乒乓回发。

## 内部 API 与网络载荷一览

尽管以下类大多标为 `@ApiStatus.Internal`，理解其职责与边界有助于编写自定义 `SyncRegisterEntry` 与调试网络包：

### 运行时与网络类 (`dev.anvilcraft.lib.v2.sync.*`)

| 类名 | 职责与核心公开成员 |
| --- | --- |
| `AnvilLibSync` | 模组入口（`MOD_ID = "anvillib_sync"`）；持有全局静态实例 `SYNC_MANAGER`、`SYNC_CONFIG_MANAGER`、`LAZY_SYNC_MANAGER`；注册服务端 `ServerTickEvent.Post`、`ServerStoppedEvent` 与 `SyncConfig` 配置任务 |
| `AnvilLibSyncClient` | 客户端 `@Mod(dist = Dist.CLIENT)` 入口；持有客户端 `SYNC_CONFIG_MANAGER`；驱动 `ClientTickEvent.Post` 并于 `ClientPlayerNetworkEvent.LoggingOut` 清理客户端惰性追踪表 |
| `AnvilLibSyncNetwork` | 通过 `NetworkRegistrar` 在 `NETWORK_VERSION = "1"` 下自动注册全模块双向包及配置包 |
| `SyncManager` | 维护 `Class<?> -> SyncRegisterEntry<?, ?>` 注册表查找（支持父类/接口向下匹配 `isAssignableFrom`）与立即同步调度 |
| `LazySyncManager` | 负责实例/静态目标的 `@LazySync` 差分、分组编码及回环抑制写回（含 `AppliedField` 记录类与 `tickServer`/`tickClient`/`clearServer`/`clearClient`/`track`/`trackStatic`/`applyGrouped` 方法） |
| `SyncConfigManager` | ASM 扫描 `@Sync` 类字节码字段与 `@LazySync` 字段，管理 `String <-> int` 双向配置表 |
| `SideUtil` | 提供双端判定 `isServer()`、`registryAccess()`、`entityFinder`、`blockEntityFinder`、`createFriendlyByteBuf(ByteBuf)`（有注册表时构造 `RegistryFriendlyByteBuf`）、`send` / `serverSend` / `clientSend` |
| `SyncPayload` | 单个 `SyncProxy` 即时同步双端包（`anvillib_sync:sync`） |
| `LazySyncPayload` | 按宿主对象合批的惰性同步双端包（`anvillib_sync:lazy_sync`），含嵌套 record `FieldChange(String configKey, byte[] blob)` |
| `SyncConfigurationPayload` / `Finish` | Configuration 阶段配置表同步包（`anvillib_sync:sync_config` / `anvillib_sync:sync_config_finish`） |

### Processor 字节码注入类 (`dev.anvilcraft.lib.v2.sync.transform`)

| 类名 | 说明 |
| --- | --- |
| `SyncClassProcessor` | 实现 `ICoreMod` 并暴露 `SyncTransformer`，将目标类交给 `@Sync` 与 `@LazySync` 注入器 |
| `SyncTargetIndex` / `LazySyncTargetIndex` | 从 `LoadingModList` 注解扫描结果预先构建待变换目标类索引 |
| `SyncBytecodeInjector` / `LazySyncBytecodeInjector` | 基于 ASM Tree API 的纯字节码注入器，向 `<init>` 与 `<clinit>` 末尾写入登记与绑定调用 |
