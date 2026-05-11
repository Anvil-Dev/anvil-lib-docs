# Multiline Component Utilities

This package provides the ability to programmatically generate multi-line `Component` text, commonly used for debug
information, recipe display, and similar purposes.

## IComponentInfo

`dev.anvilcraft.lib.v2.util.component.IComponentInfo` – the component info interface, with a single method:
`addInto(MultilineComponentHelper helper)`.

Implementing classes:

- `LiteralInfo(String value)` – displays literal text
- `DirectInfo(Component value)` – displays a component
- `TranslatableInfo(String key, Object... args)` – translation key; args may include `SequencedCollection` (
  automatically calls `helper.list`) or
  `ItemEnchantments` (automatically calls `helper.enchantments`)

## MultilineComponentHelper

`dev.anvilcraft.lib.v2.util.component.MultilineComponentHelper` – a multi-line text builder.

- **Construction**: `MultilineComponentHelper.create()` uses default symbols (LF, tab, comma, square brackets, curly
  braces)
- **Basic append**: `addln(Component)` (with newline and indentation), `append(Component)`
- **Indentation control**: `in()` / `out()` to enter/exit indentation levels
- **Collection display**: `list(Component head, SequencedCollection<T>, Function<T,IComponentInfo[]>)` – automatically
  formats lists; single elements display without newlines, multiple elements are formatted
- **Enchantment display**: `enchantments(Component head, ItemEnchantments)` – displays an enchantment list
- **Build**: `build()` returns the resulting `Component`

Usage example:

```java
MultilineComponentHelper helper = MultilineComponentHelper.create();
helper.addln(Component.literal("Hello"));
helper.in();
helper.addln(Component.literal("World"));
helper.out();
Component result = helper.build(); // "Hello\n    World"
```
