# Multi-Line Component Info & Tooltip Utilities

`module.util` provides an indentable multi-line component builder with dynamic list/enchantment formatting under `dev.anvilcraft.lib.v2.util.component`, `ComponentUtil`, and `TooltipUtil`—ideal for multi-line debug info, WTHIT/Jade HUD panels, and item tooltips.

## Core Formatting Helper: `MultilineComponentHelper`

`MultilineComponentHelper` uses an internal line buffer and indent depth stack (each indent adds `ComponentUtil.TAB`, two spaces) paired with `IComponentInfo` nodes to build complex text trees fluently.

### Full API Reference

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `MultilineComponentHelper.create()` | `MultilineComponentHelper` | Creates a new empty multi-line builder |
| `addln(Component c)` | `MultilineComponentHelper` | Inserts a newline and writes a vanilla `Component` at the current indent level |
| `addln(String transKey, Object arg)` / `addln(String transKey, Object... args)` | `MultilineComponentHelper` | Inserts a newline and writes a translatable component (nullable args safely handled via `ComponentUtil.argsValidate`) |
| `append(Component c)` | `MultilineComponentHelper` | Appends component content to the end of the current line **without newline or indent** |
| `in()` / `out()` | `MultilineComponentHelper` | Increments / decrements subsequent indent depth by 1 |
| `list(Component head, List<T> list, Function<T, Component> converter)` | `MultilineComponentHelper` | Auto-formats a `[ ... ]` multi-line indented list, keeping empty lists concise |
| `enchantments(Component head, ItemEnchantments enchantments)` | `MultilineComponentHelper` | Extracts enchantments from an item/stack and formats them indented line by line |
| `build()` | `Component` | Assembles all accumulated nodes into a single top-level `Component` |

## Info Node Interface: `IComponentInfo` & Built-in Implementations

Ideal for pre-storing "pending text units" in data structures, config fields, or preview detail lists (`StructureGuiProviders`, etc.) before feeding into `MultilineComponentHelper` on the client:

| Type | Constructor Fields | `addInto(MultilineComponentHelper)` Behavior |
| --- | --- | --- |
| `DirectInfo(Component value)` | `Component value` | Calls `helper.addln(value)` |
| `LiteralInfo(String value)` | `String value` | Calls `helper.addln(Component.literal(value))` |
| `TranslatableInfo(String key, Object... args)` | `String key, Object... args` | Calls `helper.addln(key, args)` |

## Constants, Validation & Block Tooltips: `ComponentUtil` & `TooltipUtil`

### `ComponentUtil`

| Member / Method | Description |
| --- | --- |
| `TAB` (`"  "`), `LF` (`"\n"`), `SPLITTER` (`","`), `LIST_HEAD` (`"["`), `LIST_TAIL` (`"]"`), `ITEM_HEAD` (`"{"`), `ITEM_TAIL` (`"}"`) | Unified punctuation component constants for structured text |
| `argsValidate(Object... args)` / `argValidate(@Nullable Object arg)` | Safely formats translation arguments, converting `null` or non-vanilla objects into safe displayable text components to avoid `TranslatableContents` NPEs |
| `dimension(ResourceKey<Level> key)` | Generates a standard localized dimension name component (e.g., `dimension.minecraft.overworld`) |
| `findPlayerName(GameProfileCache cache, UUID id)` | Resolves a player name from the server `GameProfileCache` by `UUID`, returning a readable fallback on cache miss |

### `TooltipUtil`

- `TooltipUtil.tooltip(Block block)`: generates base tooltip lines for a block (translated name and standard info).
- `TooltipUtil.recipeIDTooltip(Block block, ResourceLocation id)`: appends a recipe ID debug line below the base block tooltip (commonly used in recipe viewers or advanced tooltips).

## Complete Formatting Example

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
