# Multi-Line Component Info & Tooltip Utilities (`ComponentUtil` / `TooltipUtil` / `component`)

<BranchContextCard branch="26.1" />

When building complex debug info, machine status hints, or structured multi-line chat text, hand-writing nested indentation (`\n` + spaces) and list braces is verbose and error-prone. `module.util` provides `MultilineComponentHelper`, `ComponentUtil` for heterogeneous argument validation, and `TooltipUtil` for mod-source block tooltips under `dev.anvilcraft.lib.v2.util` and `dev.anvilcraft.lib.v2.util.component`.

---

## 1. Full Code Example: Building Multi-Line `Component`s with Indentation, Lists & Enchantments

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
            .addln(Component.literal("=== Machine Diagnostics ==="))
            .in() // Indent level +1
            .addln("gui.my_mod.dimension", ComponentUtil.dimension(Level.OVERWORLD))
            // Render structured list (0 items -> [], 1 item -> {...}, multiple -> [{...}, {...}])
            .list(
                Component.literal("Submodules: "),
                modules,
                mod -> new IComponentInfo[]{
                    new LiteralInfo("Name: " + mod.name()),
                    new TranslatableInfo("gui.my_mod.power_usage", mod.power()),
                    new DirectInfo(Component.literal("Status: Nominal"))
                }
            )
            .out() // Indent level -1
            .build();
    }

    public static List<Component> getBlockRecipeTooltip() {
        // Generates Tooltip list containing: block name, block registry ID (dark gray), recipe ID (dark gray), and owning mod name (blue italic)
        return TooltipUtil.recipeIDTooltip(
            Blocks.ANVIL,
            Identifier.fromNamespaceAndPath("my_mod", "anvil_crushing/diamond")
        );
    }
}
```

---

## 2. Public Classes & Interfaces API Reference

### 1. `ComponentUtil` (`dev.anvilcraft.lib.v2.util.ComponentUtil`)

| Constant / Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `TAB` (`"  "`), `LF` (`"\n"`), `SPLITTER` (`","`), `LIST_HEAD` (`"["`), `LIST_TAIL` (`"]"`), `ITEM_HEAD` (`"{"`), `ITEM_TAIL` (`"}"`) | `Component` | Separator constants for structured multi-line text. |
| `public static Component argValidate(@Nullable Object arg)`<br>`public static Object[] argsValidate(Object... args)` | `Component` / `Object[]` | Safely converts arbitrary arguments for `Component.translatable`: supports `Component`, `String`, `Number`, `Boolean`, `Date`, `Message`, `UUID`, `Identifier`, `ChunkPos`, `URI`, `null` (as `"null"`), and any other object (via `toString()`). |
| `public static Component dimension(ResourceKey<Level> key)` | `Component` | Generates a dimension translation key component such as `"dimension.minecraft.overworld"`. |
| `public static Component findPlayerName(CachedUserNameToIdResolver cache, UUID id)` | `Component` | Resolves player name component from the server username cache, returning `"Unknown[<uuid>]"` if not found. |

### 2. `TooltipUtil` (`dev.anvilcraft.lib.v2.util.TooltipUtil`)

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static List<Component> tooltip(Block block)` | `List<Component>` | Returns 3 tooltip lines: block name, `block` registry ID (`DARK_GRAY`), and owning mod display name (`BLUE` + italic). |
| `public static List<Component> recipeIDTooltip(Block block, Identifier id)` | `List<Component>` | Returns 4 tooltip lines: inserts `Component.translatable("anvillib.tooltip.recipe.id", id.toString())` (`DARK_GRAY`) between lines 2 and 3 of `tooltip(block)`. |

### 3. `MultilineComponentHelper` & `IComponentInfo` Implementations (`dev.anvilcraft.lib.v2.util.component`)

| Class / Interface | Constructor / Method Signatures | Description |
| :--- | :--- | :--- |
| **`MultilineComponentHelper`** | • `public static MultilineComponentHelper create()`<br>• `public MultilineComponentHelper(Component lf, Component tab, Component splitter, Component listHead, Component listTail, Component itemHead, Component itemTail)`<br>• `addln(Component c)` / `addln(String transKey, Object arg)` / `addln(String transKey, Object... args)`: inserts a newline and indents to current `depth` before appending<br>• `append(Component c)`: appends directly to the end of the current line<br>• `in()` / `out()`: increments/decrements indent `depth`<br>• `<T> list(Component head, SequencedCollection<T> collection, Function<T, IComponentInfo[]> infoGetter)`<br>• `enchantments(Component head, ItemEnchantments enchantments)`<br>• `Component build()` | Multi-line indented component builder. |
| `IComponentInfo` | `void addInto(MultilineComponentHelper helper)` | Multi-line component info node interface. |
| `DirectInfo` | `public record DirectInfo(Component value) implements IComponentInfo` | Writes an existing `Component` directly on a line. |
| `LiteralInfo` | `public record LiteralInfo(String value) implements IComponentInfo` | Writes a literal string `Component.literal(value)` on a line. |
| `TranslatableInfo` | `public record TranslatableInfo(String key, Object... args) implements IComponentInfo` | Writes a translatable component; if `args` contains a `SequencedCollection<?>` (followed by a `Function<?, IComponentInfo[]>`) or `ItemEnchantments`, automatically expands it via `helper.list(...)` or `helper.enchantments(...)`! |
