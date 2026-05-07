# Text Component Util and Tooltip Util

## ComponentUtil

`dev.anvilcraft.lib.v2.util.ComponentUtil` provides common utilities for text components:

- Static constants: `TAB`, `LF`, `SPLITTER`, `LIST_HEAD`, `LIST_TAIL`, `ITEM_HEAD`, `ITEM_TAIL`
- `argValidate(Object)` – converts any type to a `Component` (supports String, Number, Date, UUID, Identifier, etc.)
- `argsValidate(Object...)` – batch conversion
- `dimension(ResourceKey<Level>)` – generates a dimension translation key component
- `findPlayerName(CachedUserNameToIdResolver, UUID)` – looks up a player name component by UUID

## TooltipUtil

`dev.anvilcraft.lib.v2.util.TooltipUtil`:

- `tooltip(Block)` – generates a basic block tooltip (name, registry name, mod name)
- `recipeIDTooltip(Block, Identifier)` – adds a line with the crafting recipe ID
