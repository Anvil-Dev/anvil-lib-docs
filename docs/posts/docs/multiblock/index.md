---
title: Multiblock 多方块
prev: false
next: false
---

# 动态多方块系统 <Badge type="tip" text="1.21.1" /> <Badge type="info" text="not in 1.21.2–1.21.11" /> <Badge type="tip" text="26.1" />

> **可用性**: 本模块在 Minecraft **1.21.1** 和 **26.1** 版本中可用。1.21.2 至 1.21.11 版本中因开发产能限制未同步。如果你使用这些版本，动态多方块功能不可用。

包 `dev.anvilcraft.lib.v2.multiblock` 提供了一套**动态多方块结构**
系统。支持通过数据包或代码定义多方块形状、异步检测方块匹配、自动追踪结构状态（成型/未成型），并通过网络同步到客户端。

## 架构概览

1. **定义** (`MultiblockDefinition`) — 描述多方块结构中每个相对位置需要的方块/谓词
2. **控制器** (`IController` / `SimpleController`) — 多方块的"大脑"，绑定方块 + 定义 ID，提供成型/取消成型回调
3. **状态** (`MultiblockState`) — 运行时的多方块实例，跟踪控制器位置、定义引用和成型状态
4. **管理器** (`DynamicMultiblockManager`) — 每个维度的全局管理器，持久化为 `SavedData`
5. **异步检测** — 独立线程池执行谓词匹配，避免阻塞主线程
6. **网络同步** — `MultiblockFormPacket` / `MultiblockUnformPacket` 同步状态到客户端

## 文档索引

| 文档                   | 内容                                                   |
|----------------------|------------------------------------------------------|
| [定义系统](./definition) | `MultiblockDefinition`、`Builder`、`SeriaBuilder`、序列化  |
| [控制器](./controller)  | `IController`、`SimpleController`、`ControllerRecord`  |
| [运行时管理](./manager)   | `DynamicMultiblockManager`、`MultiblockState`、异步检测、配置 |

## 模块主类

### AnvilLibMultiblock

模组入口，`@Mod("anvillib_multiblock")`。

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_multiblock";
public static final AnvilLibMultiblockConfig CONFIG;

public static Identifier of(String path); // → anvillib:<path>
```

## 快速流程

1. 创建 `MultiblockDefinition`（Builder 或 SeriaBuilder）
2. 创建 `SimpleController` 子类并注册到 `ControllerRecord`
3. 在数据包 `data/<ns>/anvillib/definitions/` 中放置定义 JSON（或通过代码注册）
4. 放置控制器方块 → 系统自动检测并触发 `onFormed`/`onUnformed`

## 注意事项

- 定义中 `'0'` 或 `Vec3i.ZERO` 为控制器位置
- 异步检测线程池大小根据实际多方块数量调整
- `MultiblockState` 作为 `SavedData` 持久化，跨重启保留
- 状态变更通过 `IClientboundPacket` 自动同步到所有在线玩家
