---
title: Recipe 世界内配方
prev: false
next: false
---

# 世界内配方模块

包 `dev.anvilcraft.lib.v2.recipe` 提供了一套**世界内交互配方系统**，允许配方在世界中通过实体/方块交互触发，而非在传统的合成台中执行。支持条件谓词、概率化产出、事务式缓存、数据包定义及网络同步。

## 架构概览

一个世界内配方由以下层次组成：

1. **触发器** (`IRecipeTrigger`) — 定义什么事件触发配方检测
2. **谓词** (`IRecipePredicate`) — 配方匹配的条件，分为冲突型（消耗）和非冲突型（仅检查）
3. **产出** (`IRecipeOutcome`) — 配方匹配后执行的结果
4. **上下文** (`InWorldRecipeContext`) — 单次配方执行的运行时状态
5. **缓存** (`BlockCache` / `ItemCache` / `TagCache`) — 事务式世界修改
6. **管理器** (`InWorldRecipeManager`) — 配方注册与调度

## 文档索引

| 文档 | 内容 |
|------|------|
| [核心配方结构](./core) | `InWorldRecipe`、配方序列化、优先级计算 |
| [构建器](./builder) | `InWorldRecipeBuilder` 流式 API、数据生成 |
| [谓词系统](./predicate) | `IRecipePredicate` 接口、内置谓词（HasItem / HasBlock 等） |
| [产出与触发器](./outcome) | `IRecipeOutcome` 接口、内置产出、`IRecipeTrigger` |
| [缓存系统](./cache) | `BlockCache`、`ItemCache`、`TagCache` 事务式修改 |
| [运行时管理](./manager) | `InWorldRecipeManager`、`InWorldRecipeContext`、事件、注册表 |

## 模块主类

### AnvilLibRecipe

模组入口，`@Mod("anvillib_recipe")`，负责初始化数据组件谓词和配方注册。

```java
public static final String MAIN_ID = "anvillib";
public static final String MOD_ID = "anvillib_recipe";

// 创建 anvillib 命名空间的 Identifier
public static Identifier of(String path) { ... }
```

## 注意事项

- 所有配方检测在服务端执行，`InWorldRecipeContext` 非线程安全
- 配置参数 `inWorldRecipeMaxEfficiency` 提供全局效率上限
- 兼容模式（`compatible=true`）允许多配方共享输入
- 不兼容模式（`compatible=false`）时冲突谓词被消耗，阻止其他配方
