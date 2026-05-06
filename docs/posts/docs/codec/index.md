---
title: Codec 编解码
prev: false
next: false
---

# 编解码器工具模块

包 `dev.anvilcraft.lib.v2.codec` 包含了 Minecraft/NeoForge 开发中高频使用的序列化工具，分为两大类：

- **配置/存档编解码器 (`Codec`)** — 用于 JSON、NBT、配置文件的序列化
- **网络流编解码器 (`StreamCodec`)** — 用于网络数据包的紧凑二进制序列化

## 文档索引

| 文档                                    | 内容                                                    |
|---------------------------------------|-------------------------------------------------------|
| [Codec 工具](./codec-util)              | `CodecUtil` — 内置 Codec 常量、辅助方法                        |
| [StreamCodec 工具](./stream-codec-util) | `StreamCodecUtil` — 内置 StreamCodec 常量、composite 方法、桥接 |

## 注意事项

- 所有预定义的 Codec/StreamCodec 均为不可变常量，可安全共享
- 多数编解码依赖当前运行的注册表（`BuiltInRegistries`），序列化后数据绑定到注册表 ID
- 注意不同版本间的注册表 ID 兼容性
