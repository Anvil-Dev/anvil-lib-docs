# `@Sync` 与 `@LazySync` 注解及同步管理器

`module.sync` 为 Mod 开发者提供了无需手写样板网络数据包即可跨端同步实体、方块实体及静态类中字段数据的声明式框架：
- **`@Sync`**：作用于类注解（`ElementType.TYPE`），由编译期字节码注入器与核心类转换协作，对类下需要同步字段的读写操作自动路由或挂载 `SyncProxy` 实时发包。
- **`@LazySync`**：作用于字段注解（`ElementType.FIELD`，`RetentionPolicy.RUNTIME`），由运行时管理器 `LazySyncManager` 在每 Tick 结束时按对象比对字节快照，同一 Tick 内一个目标对象只打包发送一次全部变更字段。

## 模块标识与核心类

- 模组 ID：`anvillib_sync`（`AnvilLibSync.MOD_ID`）
- 资源命名空间：`AnvilLibSync.MOD_ID`

## 快速上手示例：使用 `@Sync` 与 `@LazySync`

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.sync.SyncProxy;
import dev.anvilcraft.lib.v2.sync.annotation.LazySync;
import dev.anvilcraft.lib.v2.sync.annotation.Sync;
import dev.anvilcraft.lib.v2.sync.util.SyncDirection;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;

@Sync
public class EnergyMeterBlockEntity extends BlockEntity {
    // 方式一：直接使用 @LazySync 标注普通字段，无需手写 SyncProxy 包装
    @LazySync(SyncDirection.S2C)
    private int storedEnergy = 0;

    @LazySync(SyncDirection.BOTH)
    private boolean active = true;

    public EnergyMeterBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
        super(type, pos, state);
    }

    public void addEnergy(int delta) {
        this.storedEnergy += delta;
        // 若为 @LazySync，当持有对象已被注册追踪后，Tick 末将自动检测并差量发包
    }
}
```

> [!IMPORTANT]
> 请确保在 `AnvilLibSync.getSyncManager()` 注册了目标对象类型与定位器（`SyncRegisterEntry`），例如方块实体通过 `BlockPos` 解析，实体通过 `UUID` 解析。内建管理器会在服务端的 `BlockEntity`、实体及注册静态类之间建立 ID 映射。

## 核心枚举与注解：`SyncDirection`、`@Sync`、`@LazySync`

### `SyncDirection`

| 枚举常量 | 含义 |
| --- | --- |
| `S2C` | 仅服务端向客户端单向同步；客户端试图修改不会推回服务端 |
| `C2S` | 仅客户端向服务端单向同步 |
| `BOTH` | 双向同步；任何一端修改都会推送到对端 |

### `@Sync` 与 `@LazySync` 属性

- `@Sync`：`SyncDirection value() default SyncDirection.BOTH;`（类级标记，标注所在类包含同步结构）
- `@LazySync`：`SyncDirection value() default SyncDirection.BOTH;`（字段级标记，交由 `LazySyncManager` 周期扫描）

## `SyncProxy<T>`：显式同步字段包装器

`SyncProxy<T>` 为任意字段提供细粒度值包装、脏标记触发及编解码控制（如无法或不想依赖字段反射替换的场景）：

| 构造 / 方法签名 | 说明 |
| --- | --- |
| `new SyncProxy<>(T value)` | 以非空初始值创建并按运行时类自动查找默认 `StreamCodec` |
| `new SyncProxy<>(T value, StreamCodec<? extends ByteBuf, T> codec)` | 显式传入自定义 `StreamCodec` |
| `new SyncProxy<>(Class<T> type)` / `new SyncProxy<>(StreamCodec<? extends ByteBuf, T> codec)` | 无初始值（允许初始 `null`）构造器 |
| `direction(SyncDirection direction)` / `setDirection(SyncDirection direction)` | 设置允许的同步流向 |
| `getValue()` / `setValue(@Nullable T value)` | 读取或修改内部值；在允许发包的逻辑侧会触发同步编码推送 |
| `setValue(B buf, boolean serverbound)` | 从网络缓冲解码并写入内部值 |
| `encode(B byteBuf)` | 将当前值按绑定的 `StreamCodec` 写入字节缓冲 |

## 管理器体系：`SyncManager`、`LazySyncManager` & `SyncRegisterEntry`

### `SyncManager` 与 `SyncRegisterEntry<T, ID>`

`SyncManager` 维护所有注册定位策略与配置元数据：
- `compileContent()`：收集所有同步目标并编译字段与类名映射索引；
- `contains(Class<?> clazz)`：向上遍历目标类继承链，检索匹配的 `SyncRegisterEntry<P, ID>`；
- `SyncRegisterEntry.create(...)`：将目标父类（如 `BlockEntity.class`、`Entity.class` 或静态宿主类）、唯一识别键 ID 的序列化 `StreamCodec` 及逆向查找函数 `Finder<T, ID>` 绑定注册。

### `LazySyncManager`

按 Tick 维护 `@LazySync` 持有者快照并执行合并推送：

| 方法签名 | 说明 |
| --- | --- |
| `track(@Nullable Object object)` | 手动把指定运行时实例（如未自动注册的自定义控制器）加入惰性变化跟踪集合 |
| `trackStatic(@Nullable Class<?> owner)` | 将整个工具类中的静态 `@LazySync` 字段加入跟踪集合 |
| `tickServer()` / `tickClient()` | 在每 Tick 结束时对比快照：对发生变化的对象生成单个聚合包 `LazySyncPayload`，写入全部改动 `FieldChange(configKey, blob)` 后按端方向发出 |
| `applyGrouped(Object object, List<AppliedField> fields)` | 收到对端聚合包时批量解码并写回目标对象对应字段 |
| `clearServer()` / `clearClient()` | 退出世界/关服时清理缓存快照防止内存泄漏 |

### `SyncConfigManager`

在类加载/同步握手期统一为 `"包名.类名#字段名"` 分配紧凑的数字 `usedId` 索引，支持服务端在玩家登录配置阶段将映射表通过 `SyncConfigurationPayload` 同步给客户端，使运行时高频数据包仅传整型 `int id` 而非冗长全限定类名字符串。
