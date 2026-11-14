# 多行组件信息与 Tooltip 工具

`module.util` 在 `dev.anvilcraft.lib.v2.util.component` 与 `ComponentUtil`、`TooltipUtil` 中提供了一套可缩进排版、支持动态列表/附魔解析的多行组件构建器，专门用于生成多行调试信息、WTHIT/Jade HUD 面板说明及物品 Tooltip。

## 核心格式化助手：`MultilineComponentHelper`

`MultilineComponentHelper` 采用内部行缓冲和缩进深度栈（每次缩进 `ComponentUtil.TAB` 即两个空格），并结合 `IComponentInfo` 节点列表链式渲染复杂文本树。

### API 全量参考

| 方法签名 | 返回类型 | 说明 |
| --- | --- | --- |
| `MultilineComponentHelper.create()` | `MultilineComponentHelper` | 创建一个新的空白多行构建器 |
| `addln(Component c)` | `MultilineComponentHelper` | 换行并按当前缩进层级写入一个原版 `Component` |
| `addln(String transKey, Object arg)` / `addln(String transKey, Object... args)` | `MultilineComponentHelper` | 换行并写入翻译键组件（经过 `ComponentUtil.argsValidate` 自动兜底处理可空参数） |
| `append(Component c)` | `MultilineComponentHelper` | 在当前行末尾直接追加组件内容，**不换行也不追加缩进** |
| `in()` / `out()` | `MultilineComponentHelper` | 将后续缩进层级加 1 / 减 1 |
| `list(Component head, List<T> list, Function<T, Component> converter)` | `MultilineComponentHelper` | 自动格式化 `[ ... ]` 多行缩进列表，空列表保持简洁输出 |
| `enchantments(Component head, ItemEnchantments enchantments)` | `MultilineComponentHelper` | 提取物品或堆栈上的附魔集合并按行缩进排版 |
| `build()` | `Component` | 将所有累计节点拼装成单一顶层 `Component` |

## 信息节点接口：`IComponentInfo` 与内置实现

适合在数据结构、配置字段或预览详情列表 (`StructureGuiProviders` 等) 中预先保存“待渲染文本单元”，在客户端需要显示时再统一注入到 `MultilineComponentHelper`：

| 类型 | 构造字段 | `addInto(MultilineComponentHelper)` 行为 |
| --- | --- | --- |
| `DirectInfo(Component value)` | `Component value` | 调用 `helper.addln(value)` |
| `LiteralInfo(String value)` | `String value` | 调用 `helper.addln(Component.literal(value))` |
| `TranslatableInfo(String key, Object... args)` | `String key, Object... args` | 调用 `helper.addln(key, args)` |

## 常量、校验与方块提示：`ComponentUtil` & `TooltipUtil`

### `ComponentUtil`

| 成员 / 方法 | 说明 |
| --- | --- |
| `TAB` (`"  "`), `LF` (`"\n"`), `SPLITTER` (`","`), `LIST_HEAD` (`"["`), `LIST_TAIL` (`"]"`), `ITEM_HEAD` (`"{"`), `ITEM_TAIL` (`"}"`) | 统一的结构化文本标点组件常量 |
| `argsValidate(Object... args)` / `argValidate(@Nullable Object arg)` | 安全格式化翻译参数，将 `null` 或非原版对象自动转换为可显示的安全文本组件，避免 `TranslatableContents` 空指针崩溃 |
| `dimension(ResourceKey<Level> key)` | 生成标准维度的本地化名称组件（如 `dimension.minecraft.overworld`） |
| `findPlayerName(CachedUserNameToIdResolver cache, UUID id)` | 根据 `UUID` 从服务端 `CachedUserNameToIdResolver` 解析玩家名，缓存未命中时提供可读回退文本 |

### `TooltipUtil`

- `TooltipUtil.tooltip(Block block)`：生成目标方块的基础提示行集合（包含译名等标准说明）。
- `TooltipUtil.recipeIDTooltip(Block block, Identifier id)`：在基础方块提示之上追加对应的配方 ID 调试行（通常用于配方查看器或高级工具提示模式下高亮展示来源配方）。

## 完整排版示例

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.util.component.MultilineComponentHelper;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.enchantment.ItemEnchantments;

import java.util.List;

public class MachineInfoFormatter {
    public static Component formatMachineStatus(String mode, List<String> activeModules, ItemEnchantments enchants) {
        return MultilineComponentHelper.create()
            .addln("tooltip.mymod.header")
            .in()
            .addln("tooltip.mymod.mode", mode)
            .list(Component.literal("Modules:"), activeModules, Component::literal)
            .enchantments(Component.literal("Applied Enchantments:"), enchants)
            .out()
            .build();
    }
}
```
