# Processor 编译期字节码转换与接入配置

为了实现 `@Sync` 与 `@LazySync` 的低侵入编写体验，`module.sync` 拆分了一个独立的字节码/注解处理器子项目 `anvillib-sync-processor-neoforge-1.21.4`，同时配合 NeoForge 网络注册与跨端查询工具 `SideUtil` 运行。

## Gradle 接入说明

如果模组直接引入完整 `anvillib`（或在开发期单独依赖子模块 `module.sync`），需要注意同步处理器与底包模块依赖（1.21.4 坐标系如下）：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-sync-neoforge-1.21.4:<version>")
    // Processor 与相关运行时模块（codec / network / util）已作为传递依赖/JarJar 包含于对应构件中；
    // 若单独拆模块构建或启用编译期处理器配置，对应构件名为：
    // dev.anvilcraft.lib:anvillib-sync-processor-neoforge-1.21.4
    // dev.anvilcraft.lib:anvillib-codec-neoforge-1.21.4
    // dev.anvilcraft.lib:anvillib-network-neoforge-1.21.4
    // dev.anvilcraft.lib:anvillib-util-neoforge-1.21.4
}
```

## 编译期 / 类加载变换流程 (`processor`)

子模块 `module.sync/processor` 中的核心组件协作完成同步代码增强与目标索引生成：
1. **`SyncTargetIndex`**：在编译或构建扫描阶段提取所有标记 `@Sync` 与 `@LazySync` 的类及字段元数据，供运行时 `SyncConfigManager.compileContent()` 快速建表，避免运行时全类路径反射扫描。
2. **`SyncBytecodeInjector`**：在转换管线中为带同步特征的目标字段/包装属性织入字段写拦截或访问钩子，并在构建期注入关联追踪辅助逻辑，保证对对象成员修改可以自动触发脏状态更新。

> [!TIP]
> 尽量使用基本类型、原版常用类型（`BlockPos`、`ResourceLocation`、`ItemStack`、`CompoundTag` 等）或已通过 `CodecUtil` / `StreamCodecUtil` 存在预设序列化器的类型作为 `@LazySync` 字段，可获得零额外配置的自动编码能力。

## 网络协议与跨端辅助：`AnvilLibSyncNetwork` 与 `SideUtil`

### 数据包负载 (`Payload`) 一览

| Payload 类 | 通道 ID | 流向与职责 |
| --- | --- | --- |
| `SyncConfigurationPayload` | `anvillib_sync:sync_config` | `S2C`（Configuration 阶段）：下发服务端 `SyncConfigManager` 的 `Map<Integer, String>` 字段 ID 映射表 |
| `SyncConfigurationFinishPayload` | `anvillib_sync:sync_config_finish` | `C2S`（Configuration 阶段）：客户端确认映射表加载完成，允许推进后续连接阶段 |
| `SyncPayload` | `anvillib_sync:sync` | 双向 (`IBidirectionalPacket`)：单字段 `SyncProxy` 即时更新同步包 |
| `LazySyncPayload` | `anvillib_sync:lazy_sync` | 双向 (`IBidirectionalPacket`)：按对象分组聚合单个 Tick 内全部修改字段 `List<FieldChange>` 的增量同步包 |

所有网络处理器均由 `AnvilLibSyncNetwork.register(RegisterPayloadHandlersEvent)` 在协议版本 `"1"` 下统一注册。

### `SideUtil` 跨端发包与目标解析工具

| 方法签名 | 返回值 | 说明 |
| --- | --- | --- |
| `SideUtil.isServer()` | `boolean` | 基于 `FMLEnvironment.dist` 与 `LogicalSide` 判断当前是否运行于逻辑服务端线程 |
| `SideUtil.registryAccess()` | `@Nullable RegistryAccess` | 安全获取当前环境可用注册表访问器（服务端从 `ServerLifecycleHooks.getCurrentServer()` 取，客户端从 `Minecraft.getInstance().level` 取） |
| `SideUtil.entityFinder(IPayloadContext context, UUID uuid)` | `@Nullable Entity` | 根据收到数据包的逻辑侧，从对应维度查找指定 `UUID` 的实体实例 |
| `SideUtil.blockEntityFinder(IPayloadContext context, BlockPos blockPos)` | `@Nullable BlockEntity` | 从当前数据包关联维度定位对应坐标的 `BlockEntity` |
| `SideUtil.createFriendlyByteBuf(ByteBuf byteBuf)` | `FriendlyByteBuf` / `RegistryFriendlyByteBuf` | 在需要携带注册表上下文的编码过程中按当前可用 `RegistryAccess` 构造缓冲封装 |
| `SideUtil.send(T target, SyncProxy<?> proxy, ...)` / `serverSend(...)` / `clientSend(...)` | `void` | 自动根据发包实体/区块追踪状态将增量同步包分发给需要同步的观察玩家或发送回服务端 |
