# 字节码转换器与底层网络协议 (`module.sync:processor` / `management` / `network`)

<BranchContextCard branch="26.1" />

为什么在使用 `@Sync` 和 `@LazySync` 时，开发者既不需要在构造器里手写 `proxy.setParent(this)`，也不需要手动把对象注册到管理器或显式反注册？本篇解析 `module.sync:processor` 的 ASM 字节码注入原理、`LazySyncManager` 的弱引用快照防回环机制以及配置阶段 ID 映射表同步流程。

---

## 一、 编译期索引与加载期 ASM 字节码注入 (`module.sync:processor`)

`SyncClassProcessor` 实现了 NeoForge 的 `net.neoforged.neoforgespi.transformation.ClassProcessor` 接口（处理器名称 `anvillib_sync:processor`），在游戏启动类加载阶段对包含 `@Sync` 或 `@LazySync` 的类执行无感字节码改写：

### 1. `SyncBytecodeInjector`（针对 `@Sync` 类的注入）

当类上标注了 `@Sync` 时，扫描类中所有描述符为 `SyncProxy` 且带有 `ACC_FINAL` 的字段：
- **对于实例 `final SyncProxy` 字段**：在类的每一个构造器 `<init>` 的所有 `RETURN` 指令前注入：
  ```java
  if (this.field != null) {
      this.field.setParent(this);
      this.field.setFieldName("field");
      this.field.setDirection(SyncDirection.XXX); // 仅当字段自身未显式指定方向时生效
  }
  ```
- **对于静态 `static final SyncProxy` 字段**：在类的 `<clinit>`（若不存在则自动创建）的所有 `RETURN` 指令前注入：
  ```java
  if (Owner.field != null) {
      Owner.field.setParent(Owner.class);
      Owner.field.setFieldName("field");
      Owner.field.setDirection(SyncDirection.XXX);
  }
  ```

### 2. `LazySyncBytecodeInjector`（针对含 `@LazySync` 字段的类的注入）

当类中存在任何带有 `@LazySync` 注解的字段时：
- **若存在实例 `@LazySync` 字段**：在每个构造器 `<init>` 的 `RETURN` 前注入：
  ```java
  AnvilLibSync.LAZY_SYNC_MANAGER.track(this);
  ```
- **若存在静态 `@LazySync` 字段**：在 `<clinit>` 的 `RETURN` 前注入：
  ```java
  AnvilLibSync.LAZY_SYNC_MANAGER.trackStatic(Owner.class);
  ```

---

## 二、 `LazySyncManager` 弱引用跟踪与防回环设计

1. **自动 GC 回收（无需手动 `untrack`）**：
   `LazySyncManager` 内部存储实例集合 `instances` 和快照表 `snapshots` 时，均使用了 Guava 的 **`new MapMaker().weakKeys()`（弱引用 + 身份相等 `==` 映射）**。当一个 `BlockEntity` 或 `Entity` 从世界卸载并失去外部强引用后，JVM 垃圾回收器会自动将其从 `LazySyncManager` 中清理掉，绝不会造成内存泄漏。
2. **首次基线建立与回环抑制**：
   - 当对象构造后第一次被 `scanTarget` 扫描时，仅将各字段初始编码字节存入 `snapshots` 建立基线，不会发送初始包；
   - 当对端收到 `LazySyncPayload` 并调用 `applyGrouped` 写回字段值时，会**立即用写回的新值重新编码更新本端 `snapshots`**，从而保证下一 Tick 扫描时不会把对端刚刚同步过来的值误判为本端产生的新变更而再次发包回去（彻底杜绝双向同步死循环）。
   - 注意：对于 `C2S` 或 `BOTH` 方向的 `SyncProxy` / `@LazySync`，当**服务端**收到某客户端发来的更新时，服务端在写回本地状态后会自动将该变更广播给追踪该对象的其他客户端。

---

## 三、 配置阶段字段 ID 字典同步 (`SyncConfigManager`)

为了不在每次字段同步包中传输冗长的 `"com.example.HeaterBlockEntity#temperature"` 字符串：
1. 在 `FMLCommonSetupEvent` 阶段，`SyncConfigManager.compileContent()` 扫描所有模组的 `@Sync` 类（提取其中的 `final SyncProxy` 字段）和 `@LazySync` 字段，为每个 `"ClassName#fieldName"` 分配一个紧凑的整数 `configId`；
2. 在玩家连接服务器的 `RegisterConfigurationTasksEvent` 配置阶段，`AnvilLibSync.SyncConfig`（`anvillib_sync:sync_config`）向客户端发送 `SyncConfigurationPayload`，将服务端的 `Map<Integer, String>` 字段字典同步给客户端，客户端采纳后回复 `SyncConfigurationFinishPayload`。

---

## 四、 底层管理与网络类参考表 (`@ApiStatus.Internal`)

| 包 / 类名 | 核心职责 |
| :--- | :--- |
| `AnvilLibSync` | 模块主类，持有 `SYNC_MANAGER`、`SYNC_CONFIG_MANAGER` 与 `LAZY_SYNC_MANAGER` 单例。 |
| `SyncManager` | 管理 `SyncRegisterEntry` 宿主映射并处理 `SyncProxy#setValue` 的即时发包。 |
| `LazySyncManager` | 管理 `@LazySync` 实例/静态类的弱引用集合、字节快照对比与分组批量发包/写回。 |
| `SyncConfigManager` | 扫描并维护 `"ClassName#fieldName" <-> int` 整数索引映射表。 |
| `SideUtil` | 提供双端 `RegistryAccess` 获取、内置 `entityFinder` / `blockEntityFinder` 以及按区块（`sendToPlayersTrackingChunk`）/ 按实体（`sendToPlayersTrackingEntity`）/ 按维度（`sendToPlayersInDimension`）智能路由的 `serverSend` 方法。 |
| `SyncPayload` / `LazySyncPayload` | 即时单字段同步数据包（`anvillib_sync:sync`）与惰性多字段分组同步数据包（`anvillib_sync:lazy_sync`）。 |
| `SyncConfigurationPayload` / `SyncConfigurationFinishPayload` | 配置阶段字段 ID 映射表同步包与确认包。 |
