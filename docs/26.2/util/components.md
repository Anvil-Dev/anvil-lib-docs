# 多行组件信息与 Tooltip 工具 (`ComponentUtil` / `TooltipUtil` / `component`)

<BranchContextCard branch="26.2" />

在构建复杂的调试信息、机器状态提示或结构化多行聊天文本时，手写多层缩进（`\n` + 空格）和列表花括号既冗长又容易出错。`module.util` 在 `dev.anvilcraft.lib.v2.util` 与 `dev.anvilcraft.lib.v2.util.component` 包下提供了结构化的多行文本组件构建器 `MultilineComponentHelper`、异构参数验证器 `ComponentUtil` 以及带模组来源显示的方块提示框工具 `TooltipUtil`。

---

## 一、 完整代码示例：构建带层级缩进、列表与附魔信息的多行 Component

```java
package com.example.mymod.util;

import dev.anvilcraft.lib.v2.util.ComponentUtil;
import dev.anvilcraft.lib.v2.util.TooltipUtil;
import dev.anvilcraft.lib.v2.util.component.DirectInfo;
import dev.anvilcraft.lib.v2.util.component.IComponentInfo;
import dev.anvilcraft.lib.v2.util.component.LiteralInfo;
import dev.anvilcraft.lib.v2.util.component.MultilineComponentHelper;
import dev.anvilcraft.lib.v2.util.component.TranslatableInfo;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

import java.util.List;

public final class ComponentHelperExample {
    public record SubModuleStatus(String name, int power) {
    }

    public static Component buildMachineDiagnosticReport(List<SubModuleStatus> modules) {
        return MultilineComponentHelper.create()
            .addln(Component.literal("=== 机器诊断报告 ==="))
            .in() // 缩进层级 +1
            .addln("gui.my_mod.dimension", ComponentUtil.dimension(Level.OVERWORLD))
            // 渲染结构化列表（0 项输出 []，1 项输出 {...}，多项输出 [{...}, {...}]）
            .list(
                Component.literal("子模块列表: "),
                modules,
                mod -> new IComponentInfo[]{
                    new LiteralInfo("名称: " + mod.name()),
                    new TranslatableInfo("gui.my_mod.power_usage", mod.power()),
                    new DirectInfo(Component.literal("状态: 正常"))
                }
            )
            .out() // 缩进层级 -1
            .build();
    }

    public static List<Component> getBlockRecipeTooltip() {
        // 生成包含：方块名称、方块注册名(深灰)、配方 ID(深灰) 与所属模组显示名称(蓝色斜体) 的 Tooltip 列表
        return TooltipUtil.recipeIDTooltip(
            Blocks.ANVIL,
            Identifier.fromNamespaceAndPath("my_mod", "anvil_crushing/diamond")
        );
    }
}
```

---

## 二、 公开类与接口 API 详解

### 1. `ComponentUtil`（`dev.anvilcraft.lib.v2.util.ComponentUtil`）

| 常量 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `TAB` (`"  "`)、`LF` (`"\n"`)、`SPLITTER` (`","`)、`LIST_HEAD` (`"["`)、`LIST_TAIL` (`"]"`)、`ITEM_HEAD` (`"{"`)、`ITEM_TAIL` (`"}"`) | `Component` | 结构化多行文本的分隔符常量。 |
| `public static Component argValidate(@Nullable Object arg)`<br>`public static Object[] argsValidate(Object... args)` | `Component` / `Object[]` | 将任意类型的参数安全转换为可传入 `Component.translatable` 的参数：支持 `Component`、`String`、`Number`、`Boolean`、`Date`、`Message`、`UUID`、`Identifier`、`ChunkPos`、`URI`、`null`（转为 `"null"`）及其他对象（调用 `toString()`）。 |
| `public static Component dimension(ResourceKey<Level> key)` | `Component` | 生成形如 `"dimension.minecraft.overworld"` 的维度翻译键组件。 |
| `public static Component findPlayerName(CachedUserNameToIdResolver cache, UUID id)` | `Component` | 从服务端用户名缓存中解析玩家名组件，未命中时返回 `"Unknown[<uuid>]"`。 |

### 2. `TooltipUtil`（`dev.anvilcraft.lib.v2.util.TooltipUtil`）

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static List<Component> tooltip(Block block)` | `List<Component>` | 返回 3 行 Tooltip：方块名称、`block` 注册名（`DARK_GRAY`）、所属模组显示名称（`BLUE` + 斜体）。 |
| `public static List<Component> recipeIDTooltip(Block block, Identifier id)` | `List<Component>` | 返回 4 行 Tooltip：在 `tooltip(block)` 的第 2 行与最后一行之间额外插入一行 `Component.translatable("anvillib.tooltip.recipe.id", id.toString())`（`DARK_GRAY`）。 |

### 3. `MultilineComponentHelper` 与 `IComponentInfo` 实现类 (`dev.anvilcraft.lib.v2.util.component`)

| 类 / 接口名 | 构造器 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`MultilineComponentHelper`** | • `public static MultilineComponentHelper create()`<br>• `public MultilineComponentHelper(Component lf, Component tab, Component splitter, Component listHead, Component listTail, Component itemHead, Component itemTail)`<br>• `addln(Component c)` / `addln(String transKey, Object arg)` / `addln(String transKey, Object... args)`：换行并根据当前 `depth` 添加缩进后追加文本<br>• `append(Component c)`：在当前行末尾直接追加<br>• `in()` / `out()`：缩进深度 `depth++` / `depth--`<br>• `<T> list(Component head, SequencedCollection<T> collection, Function<T, IComponentInfo[]> infoGetter)`<br>• `enchantments(Component head, ItemEnchantments enchantments)`<br>• `Component build()` | 多行带缩进组件构建器。 |
| `IComponentInfo` | `void addInto(MultilineComponentHelper helper)` | 多行组件信息节点接口。 |
| `DirectInfo` | `public record DirectInfo(Component value) implements IComponentInfo` | 直接写入一行已有的 `Component`。 |
| `LiteralInfo` | `public record LiteralInfo(String value) implements IComponentInfo` | 写入一行字面量字符串 `Component.literal(value)`。 |
| `TranslatableInfo` | `public record TranslatableInfo(String key, Object... args) implements IComponentInfo` | 写入翻译键组件；若 `args` 中包含 `SequencedCollection<?>`（紧跟一个 `Function<?, IComponentInfo[]>` 参数）或 `ItemEnchantments`，会自动调用 `helper.list(...)` 或 `helper.enchantments(...)` 展开子列表！ |
