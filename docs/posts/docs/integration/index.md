---
title: Integration 兼容性集成
prev: false
next: false
---

# 集成模块

包 `dev.anvilcraft.lib.v2.integration` 提供了一个轻量级的模组间集成系统。通过注解 `@Integration` 声明集成点，由
`IntegrationManager` 自动发现并加载，支持在指定物理端以约定方法的形式执行集成逻辑。

## 文档索引

| 文档                  | 内容                                                        |
|---------------------|-----------------------------------------------------------|
| [核心 API](./core)    | `@Integration` 注解、`IntegrationType`、`IntegrationInstance` |
| [管理器与钩子](./manager) | `IntegrationManager`、`IntegrationHook`、`ModVersionRange`  |

## 快速开始

```java
// 1. 定义集成类
@Integration(value = "targetmod", version = "[1.0,2.0)", type = {IntegrationType.CLIENT, IntegrationType.DEDICATED_SERVER})
public class MyIntegration {
    public void apply() { /* 双端通用 */ }
    public void applyClient() { /* 仅客户端 */ }
    public void applyClientData() { /* 客户端数据生成 */ }
    public void applyServerData() { /* 服务端数据生成 */ }
}

// 2. 在模组主类中创建管理器
public static final IntegrationManager MANAGER = new IntegrationManager("mymod");
// 在构造中
MANAGER.compileContent();
```

## 注意事项

- 集成类通过 `Class.forName` 加载，确保目标类在类路径中
- 版本匹配使用 Maven 版本范围语法，`"*"` 匹配任意版本
- 方法查找仅识别 `void apply*(void)` 方法，至少定义一个否则输出警告
- 加载应在合适的模组生命周期事件中调用
