---
title: Sync 数据同步
prev: false
next: false
---

# 数据同步模块 <Badge type="tip" text=">=26.1" />

包 `dev.anvilcraft.lib.v2.sync` 提供了一套**声明式字段同步系统**，通过 `@Sync` 注解和 `SyncProxy<T>` 代理自动在客户端和服务端之间同步
Java 对象的字段值。支持方向控制、维度感知分发，以及字节码注入简化字段声明。

::: warning Availability
本模块**仅**在 Minecraft **26.1** 版本中存在。
:::

## 架构概览

1. **注解层** — `@Sync` 标记可同步的类，指定同步方向
2. **代理层** — `SyncProxy<T>` 包装字段值，提供自动编解码和变更通知
3. **管理层** — `SyncManager` 维护注册表并协调数据发送
4. **网络层** — `SyncPayload` 通过 `IInsensitiveBiPacket` 在两端传输
5. **注入层** — `SyncBytecodeInjector` 通过字节码注入自动建立 proxy 与所属对象/字段名/方向的关联，对用户透明

## 文档索引

| 文档              | 内容                                                                       |
|-----------------|--------------------------------------------------------------------------|
| [核心 API](./api) | `@Sync` 注解、`SyncProxy`、`SyncDirection`、`SyncManager`、`SyncRegisterEntry` |
| [使用指南](./usage) | 完整使用示例、字节码注入、注册流程                                                        |

## 快速开始

```java
// 1. 标记可同步的类
@Sync(SyncDirection.BOTH)
public class MySyncObject {
    public final SyncProxy<Integer> counter = new SyncProxy<>(0);
    public final SyncProxy<String> name = new SyncProxy<>("");
}

// 2. 使用
MySyncObject obj = new MySyncObject();
obj.counter.setValue(42);  // 自动同步到对端
int val = obj.counter.getValue(); // 获取当前值
```

## 依赖管理

```groovy
dependencies {
    implementation "dev.anvilcraft.lib:anvillib-sync-neoforge-26.1:2.0.0"
}
```

## 注意事项

- `SyncProxy` 字段必须声明为 `public final`
- 支持 18 种内置类型的默认 StreamCodec（CompoundTag、String、Integer、Vector3fc 等）
- 自定义类型需通过 `SyncProxy(value, customCodec)` 指定编解码器
- 同步方向在运行时由 `SyncDirection` 控制：`BOTH` / `C2S` / `S2C`
