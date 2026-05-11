---
title: Network 网络
prev: false
next: false
---

# 网络包模块 <Badge type="tip" text=">=1.21.1" />

::: warning Availability
`NetworkUtil`（批量发送工具）在 1.21.2–1.21.11 版本中未同步，仅 1.21.1 和 26.1 中可用。其余 API 在所有版本中一致。
:::

包 `dev.anvilcraft.lib.v2.network` 提供基于 NeoForge 网络系统的高层抽象，用于简化网络包的定义、方向管理及自动注册。

## 文档索引

| 文档                     | 内容                                                      |
|------------------------|---------------------------------------------------------|
| [数据包接口](./packets)     | `IPacket`、`IClientboundPacket`、`IServerboundPacket`、双端包 |
| [注册系统](./registration) | `@Network` 注解、`NetworkRegistrar`、`PacketProtocol`       |
| [发送工具](./utilities)    | `NetworkUtil` 批量发送方法                                    |

## 核心流程

1. 定义网络包类，实现对应接口（如 `IClientboundPacket`），声明 `static final Type<?>` 和 `StreamCodec`
2. 在 `package-info.java` 添加 `@Network` 注解，指定协议阶段
3. 在 `RegisterPayloadHandlersEvent` 中调用 `NetworkRegistrar.register(registrar, modId)`

## 注意事项

- 包类必须有无参构造（通常使用 record）
- `NetworkRegistrar` 通过反射查找 `Type` 和 `StreamCodec` 静态字段
- 如果注册抛出异常，检查网络包类是否遗漏了静态字段或未实现对应接口
