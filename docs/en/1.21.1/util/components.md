# Multi-Line Component Info & Tooltip Utilities

`dev.anvilcraft.lib.v2.util` and `dev.anvilcraft.lib.v2.util.component` provide a fluent component assembly framework for multi-line indented text (command diagnostics, WTHIT/Jade/client tooltips, complex object summaries) and standardized block/recipe ID tooltip helpers.

## Component Assembly Architecture

```
IComponentInfo (Unified Content Node Contract)
├── DirectInfo(Component value)               ── Appends a newline with Component directly
├── LiteralInfo(String value)                 ── Wraps Component.literal(...) and appends a line
└── TranslatableInfo(String key, Object... args) ── Smartly expands lists / enchantments / args then localizes
        │
        ▼ addInto(helper)
MultilineComponentHelper (Maintains indent depth & MutableComponent state machine)
```

### Argument Sanitization Rules (`ComponentUtil.argValidate`)

Any object passed to `TranslatableInfo` or `ComponentUtil.argsValidate(Object... args)` is converted into a `Component` safe for the vanilla text engine:
- `null` -> `Component.literal("null")`
- `Component` -> kept as-is
- `Vec3` / `BlockPos` -> uses translation key `"argument.anvilcraft.pos"`, expanding 3 components truncated to `.2f`
- `Block` -> calls `block.getName()`
- `Item` -> calls `item.getDescription()`
- `ItemStack` -> calls `stack.getDisplayName()`
- Other objects -> `Component.literal(arg.toString())`

### Smart Composite Argument Expansion in `TranslatableInfo`

When arguments to `TranslatableInfo(String key, Object... args)` appear in these patterns, `addInto(MultilineComponentHelper helper)` automatically formats structured sub-blocks:
1. **`SequencedCollection<T>` immediately followed by `Function<T, IComponentInfo[]>`**: consumes the pair and calls `helper.list(...)` to output an indented list with indices and info lines.
2. **`ItemEnchantments` instance**: calls `helper.enchantments(...)` to output an indented list of enchantment entries.
3. **Other individual arguments**: sanitized via `ComponentUtil.argValidate(arg)` and passed to `addln(key, ...)`.

## Full Example: Building Structured Multi-Line Block State Panels & Recipe Tooltips

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

## Public API & Parameter Details

### 1. `ComponentUtil` (`dev.anvilcraft.lib.v2.util`)

| Member Signature | Description & Boundary Conditions |
| --- | --- |
| `public static final Component TAB` | Default 2-space indent component `"  "` |
| `public static final Component LF` | Newline component `"\n"` |
| `public static final Component SPLITTER` | Comma separator component `","` |
| `public static final Component LIST_HEAD` / `LIST_TAIL` | `"["` and `"]"` |
| `public static final Component ITEM_HEAD` / `ITEM_TAIL` | `"{"` and `"}"` |
| `static Object[] argsValidate(Object... args)` | Batch-calls `argValidate` on varargs and returns a `Component[]`-compatible array |
| `static Component argValidate(@Nullable Object arg)` | Converts `null`, `Component`, `Vec3`, `BlockPos`, `Block`, `Item`, `ItemStack`, etc. into safe `Component`s |
| `static Component dimension(ResourceKey<Level> key)` | Formats a dimension resource key into a `Component` |
| `static Component findPlayerName(GameProfileCache cache, UUID id)` | Looks up player name from profile cache, returning a placeholder component on miss |

### 2. `TooltipUtil` (`dev.anvilcraft.lib.v2.util`)

| Method Signature | Behavior & Translation Key Convention |
| --- | --- |
| `static List<Component> tooltip(Block block)` | Reads the block's tooltip translation key and returns a singleton text list |
| `static List<Component> recipeIDTooltip(Block block, ResourceLocation id)` | Appends the formatted `"anvillib.tooltip.recipe.id"` recipe ID line below `tooltip(block)` |

### 3. `IComponentInfo` & Implementation Records (`dev.anvilcraft.lib.v2.util.component`)

| Type Signature | Description |
| --- | --- |
| `public interface IComponentInfo` | Defines `void addInto(MultilineComponentHelper helper)` |
| `public record DirectInfo(Component value) implements IComponentInfo` | Calls `helper.addln(value)` directly |
| `public record LiteralInfo(String value) implements IComponentInfo` | Calls `helper.addln(Component.literal(value))` |
| `public record TranslatableInfo(String key, Object... args) implements IComponentInfo` | Supports standard arg validation and `(SequencedCollection<T>, Function<T, IComponentInfo[]>)` / `ItemEnchantments` structured output |

### 4. `MultilineComponentHelper` (`dev.anvilcraft.lib.v2.util.component`)

| Constructor / Method Signature | Description |
| --- | --- |
| `public MultilineComponentHelper(Component splitter, Component listHead, Component listTail, Component itemHead, Component itemTail)` | Constructor with custom separator and list/item wrapper components |
| `static MultilineComponentHelper create()` | Constructs a standard multi-line helper using `ComponentUtil` defaults |
| `MultilineComponentHelper addln(Component c)` | Appends a `Component` line at current indent and advances newline state |
| `MultilineComponentHelper addln(String transKey, Object arg)` | Single-arg localized line (sanitized via `ComponentUtil.argValidate`) |
| `MultilineComponentHelper addln(String transKey, Object... args)` | Multi-arg localized line |
| `MultilineComponentHelper append(Component c)` | Appends component to the end of the current line without adding leading indent |
| `MultilineComponentHelper in()` | Increments indent depth by `+1` |
| `MultilineComponentHelper out()` | Decrements indent depth by `-1` (clamped at `0`) |
| `<T> MultilineComponentHelper list(Component head, SequencedCollection<T> list, Function<T, IComponentInfo[]> valueMapper)` | Outputs `head` and indented `[ ... ]` items, each wrapped in `{ ... }` |
| `MultilineComponentHelper enchantments(Component head, ItemEnchantments enchantments)` | Outputs `head` followed by indented enchantment names and levels |
| `Component build()` | Returns the final assembled `MutableComponent` |
