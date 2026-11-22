# Items, Creative Tabs & Variant Picker

This section covers `ItemBuilder`, `CreativeTabBuilder`, banner-sectioned creative tabs via `CreativeTabSections` / `CreativeTabSection`, and the `CreativeVariantPickerRegistry` / `CreativeVariantPickerItem` 4x4 popup selector above creative inventory slots.

## Item Builder (`ItemBuilder`)

Enter `ItemBuilder<T, P>` via `REGISTRUM.item(name, factory)`, `.object(name).item(factory)`, or `.item(...)` inside `BlockBuilder`. Standalone items include by default:

- `defaultModel()`: calls `RegistrumItemModelProvider#generated` to generate an item model using `textures/item/<name>.png` and `parent = "item/generated"`.
- `defaultLang()`: derives Title Cased English and upside-down English translations from the internal name (disabled as no-op when created via `BlockBuilder.item(...)` to avoid overwriting the block name).

### Core Methods Overview

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `initialProperties(NonNullSupplier<Item.Properties> properties)` | `ItemBuilder<T, P>` | Replaces the initial `Item.Properties` supplier; existing `properties(...)` modifiers still run sequentially on top |
| `properties(NonNullUnaryOperator<Item.Properties> func)` | `ItemBuilder<T, P>` | Appends a lazy property modifier (`.stacksTo(16)`, `.fireResistant()`, `.component(...)`, etc.) |
| `tab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | Adds the default `ItemStack` to the target creative tab (callable for multiple tabs; repeated calls for the same key replace) |
| `tab(ResourceKey<CreativeModeTab> tab, NonNullBiConsumer<DataGenContext<Item, T>, CreativeModeTabModifier> modifier)` | `ItemBuilder<T, P>` | Customizes tab insertion (e.g., multiple `ItemStack`s with different `DataComponent`s or `TabVisibility`). Note: the overload taking only `Consumer<CreativeModeTabModifier>` is `@Deprecated` |
| `removeTab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | Removes a previously attached creative tab mapping (e.g., from global `defaultCreativeTab`) |
| `burnTime(int tick)` | `ItemBuilder<T, P>` | Registers furnace burn time (in ticks) to `NeoForgeDataMaps.FURNACE_FUELS` |
| `compostable(float chance)` | `ItemBuilder<T, P>` | Registers composter level-up chance (`0.0f`–`1.0f`) to `NeoForgeDataMaps.COMPOSTABLES` |
| `color(NonNullSupplier<Supplier<ItemColor>> colorHandler)` | `ItemBuilder<T, P>` | Registers a dynamic item color callback on `Dist.CLIENT` via `RegisterColorHandlersEvent.Item` |
| `clientExtension(NonNullSupplier<Supplier<IClientItemExtensions>> clientExtension)` | `ItemBuilder<T, P>` | Registers NeoForge client item extensions (custom 1st/3rd-person rendering, `BlockEntityWithoutLevelRenderer`, etc.); the `Function<T, ...>` overload is `@Deprecated(forRemoval = true)` |
| `defaultModel()` / `model(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumItemModelProvider> cons)` | `ItemBuilder<T, P>` | Configures or resets the item model generator |
| `defaultLang()` / `lang(String name)` | `ItemBuilder<T, P>` | Configures or resets the translation name (based on `Item::getDescriptionId`) |
| `recipe(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumRecipeProvider> cons)` | `ItemBuilder<T, P>` | Generates crafting/smelting/stonecutting recipes for this item |
| `tag(TagKey<Item>... tags)` | `ItemBuilder<T, P>` | Adds item tags (delegates to `ProviderType.ITEM_TAGS`) |
| `register()` | `ItemEntry<T>` | Submits registration and returns `ItemEntry<T>` (extends `ItemProviderEntry<Item, T>`) |

::: tip `BlockBuilder` Integration Tip
All `tab(...)` entries added in `ItemBuilder` invoke `owner.modifyCreativeModeTab(...)` and `clear()` immediately when the item registers in `RegisterEvent` to avoid duplicates. To move a block item to another tab outside `defaultCreativeTab`, use `.item().removeTab(...).tab(...).build()`.
:::

## Creative Mode Tabs (`CreativeTabBuilder` & `CreativeModeTabModifier`)

### `CreativeTabBuilder<P>`

Obtain `CreativeTabBuilder` via `REGISTRUM.defaultCreativeTab(name, icon)` (calls `CreativeTabBuilder.create(...)`, `.icon(...)`, and `.defaultTitle()` for key `itemGroup.<modid>.<name>`) or `REGISTRUM.creativeTab(name)`. Returns `RegistryEntry<CreativeModeTab, CreativeModeTab>`.

Available fluent configuration methods:

- `defaultTitle()` / `title(Component displayName)`
- `icon(Supplier<ItemStack> iconGenerator)`
- `displayItems(CreativeModeTab.DisplayItemsGenerator displayItemsGenerator)`
- `displayItems(Collection<? extends Holder<? extends ItemLike>> collection)` / `displayItems(ItemLike... itemLikes)`
- `sectionedDisplayItems(Consumer<CreativeTabSections> displayItems)`: enables sectioned banner layout (see below)
- Layout & visual methods: `alignedRight()`, `hideTitle()`, `noScrollBar()`, `backgroundTexture(ResourceLocation)`, `withSearchBar()`, `withSearchBar(int searchBarWidth)`, `withScrollBarSpriteLocation(ResourceLocation)`, `withTabsImage(ResourceLocation)`, `withLabelColor(int labelColor)`, `withTabFactory(Function<CreativeModeTab.Builder, CreativeModeTab>)`
- Tab ordering methods: `withTabsBefore(...)` and `withTabsAfter(...)` (each supporting `ResourceLocation...`, `ResourceKey<CreativeModeTab>...`, and `DeferredHolder<CreativeModeTab, CreativeModeTab>...` overloads).

### `CreativeModeTabModifier`

When items are added via `.tab(tabKey, (ctx, modifier) -> ...)` or `REGISTRUM.modifyCreativeModeTab(...)`, the `CreativeModeTabModifier` implements `CreativeModeTab.Output` and adds:

- `getFlags()` -> `FeatureFlagSet`: returns enabled feature flags in the current world.
- `getParameters()` -> `CreativeModeTab.ItemDisplayParameters`: returns full display context parameters.
- `hasPermissions()` -> `boolean`: checks whether the player has operator creative tab permissions.
- `accept(ItemStack stack, CreativeModeTab.TabVisibility visibility)` / `accept(Supplier<? extends ItemLike> item)` / `accept(Supplier<? extends ItemLike> item, CreativeModeTab.TabVisibility visibility)`.

## Banner-Sectioned Creative Tabs (`CreativeTabSections` & `CreativeTabSection`)

When a mod's creative tab has many items, Registrum includes a client Mixin rendering pipeline (`CreativeModeTabMixin` + `CreativeModeInventoryScreenMixin` + `CreativeTabSectionRenderListener`) to insert row-aligned "banner section headers" with text layout, background tint, and hover tooltips.

### Section Data Model: `CreativeTabSection`

`CreativeTabSection` is an immutable `record` with the following properties and constraints:

- `bannerLength` (`1–9` slots, default `DEFAULT_BANNER_LENGTH = 3`): width in the 9-column creative grid (`BANNER_CELL_SIZE = 18` pixels per slot; invalid length throws `IllegalArgumentException`).
- `bannerTexture`: `ResourceLocation` of the banner texture rendered over the slots.
- `text`: title `Component` (default `Component.empty()`).
- `textBackgroundColor`: ARGB background color behind text (default `0x00000000` transparent).
- `tooltip`: `List<Component>` shown when hovering the banner.
- `textAlignment`: `CreativeTabSection.TextAlignment` enum (`LEFT` / `CENTER` / `RIGHT`, default `CENTER`).
- `textStart` / `textEnd`: `[start, end)` pixel bounds relative to the banner's left edge (defaults to `DEFAULT_TEXT_PADDING = 2` px on each side; outside `[0, bannerLength * 18]` throws `IllegalArgumentException`).

Constructed fluently via `CreativeTabSection.builder(ResourceLocation bannerTexture)`, supporting:
- `bannerLength(int)`
- `text(Component)`
- `textBackgroundColor(int)`
- `textAlignment(TextAlignment)`
- `textRange(int textStart, int textEnd)` / `textIndent(int textStart)` / `textIndent(int textStart, int textEnd)` / `textLeft(int)` / `textRight(int)`
- `tooltip(Component...)` / `tooltip(List<Component>)`
- `build()`

Additional helper queries: `hasDefaultTextRange()`, `textWidth()`, `textLeft()`, `textRight()`.

### Output Arranger: `CreativeTabSections`

`CreativeTabSections` implements `CreativeModeTab.Output`. After calling `.sectionedDisplayItems(sections -> ...)` on `CreativeTabBuilder`, group items with `sections.section(section, subOutput -> ...)`; ungrouped global items can be added directly via `sections.accept(...)`.

Rendering & layout mechanics:
1. If a section has 0 visible items (e.g., disabled by `FeatureFlagSet` or `SEARCH_TAB_ONLY`), Registrum omits its empty banner.
2. When a section has visible items, `ItemStack.EMPTY` fillers are inserted before the first item to align to column 0 of the next row, followed by `bannerLength` placeholder slots and a recorded `PlacedSection`.

## Creative Inventory 4x4 Variant Picker

For 2 to 16 closely related variants (e.g., 16-color blocks or modular painted tools), fold them into a **single representative slot** in the creative tab. Hovering or interacting with that slot pops up a `4x4` (up to 16 slots) `CreativeVariantPickerOverlay` above it.

Two ways to integrate:

### Approach 1: Implement `CreativeVariantPickerItem` on the Item

Have your custom `Item` implement `CreativeVariantPickerItem` (takes priority over registry declarations):

- `List<ItemStack> createCreativePickerVariants(ItemStack source)`: returns up to 16 variant stacks in left-to-right, top-to-bottom order.
- `default boolean isCreativePickerEnabled(ItemStack source)`: dynamically controls whether the overlay is active per client config (defaults to `true`).

### Approach 2: Register Independent Item Groups in `CreativeVariantPickerRegistry`

For multi-item families without a shared class or vanilla-style items, declare groups via `CreativeVariantPickerRegistry`:

| Method Signature | Description |
| :--- | :--- |
| `colorOrder()` | Returns the built-in 16 `DyeColor` standard ordering |
| `setVanillaColorVariantPickerEnabled(BooleanSupplier enabled)` | Controls whether vanilla `minecraft` 16-color item families (`<color>_*`) auto-fold into the picker (defaults to `() -> false`, typically bound to client config) |
| `register(ItemLike... variants)` / `register(BooleanSupplier enabled, ItemLike... variants)` | Registers a variant group of 2–16 independent items (first item is displayed as the representative), with optional config predicate |
| `registerStacks(...)` | Overloads taking `ItemStack...` / `Collection<ItemStack>` + optional `BooleanSupplier enabled` for component-distinguished stacks; throws `IllegalArgumentException` if count is outside `[2, 16]` |
| `createVariants(ItemStack source)` / `isCreativePickerEnabled(ItemStack source)` | Internal & UI validation helpers |
| `fold(Collection<ItemStack> items)` | Called during creative tab assembly to fold enabled groups completely present in the tab into their first item |

## Complete Practical Example: Sectioned Creative Tab & Custom Variant Groups

```java
package com.example.examplemod.registry;

import com.example.examplemod.ExampleMod;
import dev.anvilcraft.lib.v2.registrum.util.CreativeTabSection;
import dev.anvilcraft.lib.v2.registrum.util.CreativeVariantPickerRegistry;
import dev.anvilcraft.lib.v2.registrum.util.entry.ItemEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.RegistryEntry;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.registries.datamaps.builtin.FurnaceFuel;

import java.util.Arrays;

public class ModCreativeTabs {
    private static final ResourceLocation BANNER = ResourceLocation.fromNamespaceAndPath(
        ExampleMod.MODID,
        "textures/gui/creative_tab_banner.png"
    );

    public static final ItemEntry<Item> EXAMPLE_FUEL = ExampleMod.REGISTRUM
        .item("example_fuel", Item::new)
        .burnTime(3200)
        .compostable(0.65f)
        .lang("Concentrated Peat")
        .register();

    // Batch-register 16-color decorative items and fold with CreativeVariantPickerRegistry
    @SuppressWarnings("unchecked")
    public static final ItemEntry<Item>[] COLORED_PLATES = Arrays.stream(DyeColor.values())
        .map(color -> ExampleMod.REGISTRUM
            .item(color.getName() + "_plate", Item::new)
            .register())
        .toArray(ItemEntry[]::new);

    public static final RegistryEntry<CreativeModeTab, CreativeModeTab> MAIN_TAB = ExampleMod.REGISTRUM
        .defaultCreativeTab("main_tab", () -> EXAMPLE_FUEL.get())
        .withSearchBar()
        .sectionedDisplayItems(sections -> {
            sections.section(
                CreativeTabSection.builder(BANNER)
                    .bannerLength(4)
                    .text(Component.translatable("itemGroup.examplemod.section.fuels"))
                    .textBackgroundColor(0x88202020)
                    .textAlignment(CreativeTabSection.TextAlignment.LEFT)
                    .textRange(18, 70)
                    .tooltip(Component.translatable("itemGroup.examplemod.section.fuels.tip"))
                    .build(),
                out -> {
                    out.accept(EXAMPLE_FUEL.get());
                    out.accept(Items.COAL);
                }
            );
            sections.section(
                CreativeTabSection.builder(BANNER)
                    .bannerLength(3)
                    .text(Component.translatable("itemGroup.examplemod.section.plates"))
                    .build(),
                out -> {
                    for (ItemEntry<Item> plate : COLORED_PLATES) {
                        out.accept(plate.get());
                    }
                }
            );
        })
        .register();

    public static void register() {
        // Register 16-color metal plates as a single folded creative tab variant group
        CreativeVariantPickerRegistry.register(COLORED_PLATES);
    }
}
```
