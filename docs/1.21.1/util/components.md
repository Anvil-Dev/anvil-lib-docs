# 多行组件信息与 Tooltip 工具

`dev.anvilcraft.lib.v2.util` 与 `dev.anvilcraft.lib.v2.util.component` 提供了一套面向多行缩进文本（如命令诊断信息、WTHIT/Jade/客户端悬浮框、复杂物体属性汇总）的流式组件拼装框架，以及规范化的方块/配方 ID Tooltip 助手。

## 组件拼装架构

```
IComponentInfo (统一内容节点契约)
├── DirectInfo(Component value)               ── 直接添加带换行文本行
├── LiteralInfo(String value)                 ── 包裹 Component.literal(...) 添加行
└── TranslatableInfo(String key, Object... args) ── 智能展开列表 / 附魔 / 参数后本地化
        │
        ▼ addInto(helper)
MultilineComponentHelper (维护缩进深度 indent 与 MutableComponent 状态机)
```

### 参数安全清洗规则（`ComponentUtil.argValidate`）

传入 `TranslatableInfo` 或 `ComponentUtil.argsValidate(Object... args)` 的任意对象会被统一转换为原生文本引擎可安全渲染的 `Component`：
- `null` -> `Component.literal("null")`
- `Component` -> 原样保留
- `Vec3` / `BlockPos` -> 使用翻译键 `"argument.anvilcraft.pos"`，展开 3 个整数分量并截断到 `.2f` 字符串
- `Block` -> 调用 `block.getName()`
- `Item` -> 调用 `item.getDescription()`
- `ItemStack` -> 调用 `stack.getDisplayName()`
- 其他对象 -> `Component.literal(arg.toString())`

### `TranslatableInfo` 的复合参数智能展开

当 `TranslatableInfo(String key, Object... args)` 中的参数按以下组合出现时，`addInto(MultilineComponentHelper helper)` 会自动执行结构化子块渲染：
1. **`SequencedCollection<T>` 后紧跟 `Function<T, IComponentInfo[]>`**：消费这一对连续参数，调用 `helper.list(...)` 输出带缩进的列表结构，并将列表下标与对应信息行缩进排版。
2. **`ItemEnchantments` 实例**：调用 `helper.enchantments(...)` 自动输出带缩进的附魔条目列表。
3. **其余单个参数**：通过 `ComponentUtil.argValidate(arg)` 清洗后拼装为 `addln(key, ...)`。

## 完整示例：构建结构化多行方块状态面板与配方 Tooltip

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.util.ComponentUtil;
import dev.anvilcraft.lib.v2.util.TooltipUtil;
import dev.anvilcraft.lib.v2.util.component.DirectInfo;
import dev.anvilcraft.lib.v2.util.component.IComponentInfo;
import dev.anvilcraft.lib.v2.util.component.LiteralInfo;
import dev.anvilcraft.lib.v2.util.component.MultilineComponentHelper;
import dev.anvilcraft.lib.v2.util.component.TranslatableInfo;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;

import java.util.List;
import java.util.function.Function;

public final class TooltipAndInfoExample {
    public static Component buildMachineSummary(
        ResourceKey<Level> dimension,
        BlockPos pos,
        List<ItemStack> inputs,
        ItemEnchantments enchantments
    ) {
        Function<ItemStack, IComponentInfo[]> stackFormatter = stack -> new IComponentInfo[] {
            new TranslatableInfo("tooltip.mymod.slot_item", stack, stack.getCount())
        };

        MultilineComponentHelper helper = MultilineComponentHelper.create()
            .addln(Component.literal("Machine Report").withStyle(ChatFormatting.GOLD))
            .in()
            .addln("tooltip.mymod.dimension", ComponentUtil.dimension(dimension))
            .addln("tooltip.mymod.pos", ComponentUtil.argValidate(pos));

        new TranslatableInfo(
            "tooltip.mymod.inputs_header",
            inputs,
            stackFormatter
        ).addInto(helper);

        new DirectInfo(Component.literal("Enchantments:")).addInto(helper);
        helper.enchantments(Component.empty(), enchantments);
        new LiteralInfo("Status: OK").addInto(helper);

        return helper.out().build();
    }

    public static List<Component> createMachineTooltips(Block block, ResourceLocation recipeId, boolean advanced) {
        if (advanced) {
            return TooltipUtil.recipeIDTooltip(block, recipeId);
        }
        return TooltipUtil.tooltip(block);
    }
}
```

## 公开 API 与参数明细

### 1. `ComponentUtil`（`dev.anvilcraft.lib.v2.util`）

| 成员签名 | 说明与边界条件 |
| --- | --- |
| `public static final Component TAB` | 默认 2 空格缩进组件 `"  "` |
| `public static final Component LF` | 换行符组件 `"\n"` |
| `public static final Component SPLITTER` | 逗号分隔符组件 `","` |
| `public static final Component LIST_HEAD` / `LIST_TAIL` | `"["` 与 `"]"` |
| `public static final Component ITEM_HEAD` / `ITEM_TAIL` | `"{"` 与 `"}"` |
| `static Object[] argsValidate(Object... args)` | 批量对变长参数调用 `argValidate` 并返回 `Component[]` 兼容数组 |
| `static Component argValidate(@Nullable Object arg)` | 将 `null`、`Component`、`Vec3`、`BlockPos`、`Block`、`Item`、`ItemStack` 等转为安全 `Component` |
| `static Component dimension(ResourceKey<Level> key)` | 格式化维度资源键为 `Component` |
| `static Component findPlayerName(GameProfileCache cache, UUID id)` | 从玩家档案缓存反查玩家名称，未命中时返回占位文本组件 |

### 2. `TooltipUtil`（`dev.anvilcraft.lib.v2.util`）

| 方法签名 | 行为与翻译键约定 |
| --- | --- |
| `static List<Component> tooltip(Block block)` | 读取方块的 Tooltip 翻译键并返回单元素文本列表 |
| `static List<Component> recipeIDTooltip(Block block, ResourceLocation id)` | 在基础 `tooltip(block)` 之上追加 `"anvillib.tooltip.recipe.id"` 格式化后的配方 ID 提示行 |

### 3. `IComponentInfo` 与实现 Record（`dev.anvilcraft.lib.v2.util.component`）

| 类型签名 | 说明 |
| --- | --- |
| `public interface IComponentInfo` | 定义 `void addInto(MultilineComponentHelper helper)` |
| `public record DirectInfo(Component value) implements IComponentInfo` | 直接调用 `helper.addln(value)` |
| `public record LiteralInfo(String value) implements IComponentInfo` | 调用 `helper.addln(Component.literal(value))` |
| `public record TranslatableInfo(String key, Object... args) implements IComponentInfo` | 支持普通参数校验与 `(SequencedCollection<T>, Function<T, IComponentInfo[]>)` / `ItemEnchantments` 结构化输出 |

### 4. `MultilineComponentHelper`（`dev.anvilcraft.lib.v2.util.component`）

| 构造 / 方法签名 | 说明 |
| --- | --- |
| `public MultilineComponentHelper(Component splitter, Component listHead, Component listTail, Component itemHead, Component itemTail)` | 自定义分隔符与列表/元素包裹符号的构造函数 |
| `static MultilineComponentHelper create()` | 使用 `ComponentUtil` 默认符号构造标准多行助手 |
| `MultilineComponentHelper addln(Component c)` | 按当前缩进附加一行 `Component` 并追加换行状态 |
| `MultilineComponentHelper addln(String transKey, Object arg)` | 单参数本地化行（参数会经 `ComponentUtil.argValidate` 处理） |
| `MultilineComponentHelper addln(String transKey, Object... args)` | 多参数本地化行 |
| `MultilineComponentHelper append(Component c)` | 向当前行末尾直接追加组件，不新增前导缩进 |
| `MultilineComponentHelper in()` | 将缩进层级 `+1` |
| `MultilineComponentHelper out()` | 将缩进层级 `-1`（归零保护，不会小于 `0`） |
| `<T> MultilineComponentHelper list(Component head, SequencedCollection<T> list, Function<T, IComponentInfo[]> valueMapper)` | 输出 `head` 与 `[ ... ]` 包裹的多项缩进内容；每项使用 `{ ... }` 包裹 |
| `MultilineComponentHelper enchantments(Component head, ItemEnchantments enchantments)` | 输出 `head` 后缩进逐行打印 `enchantments` 中的附魔名称与等级 |
| `Component build()` | 返回最终组装完成的 `MutableComponent` |
