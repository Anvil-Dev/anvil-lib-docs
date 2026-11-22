# Item, Creative Mode Tab & Variant Picker (`ItemBuilder` / `CreativeTabBuilder` / `CreativeVariantPicker`)

In addition to the standard `ItemBuilder` for declaring items and their datagen pipelines, `module.registrum` includes an enhanced `CreativeTabBuilder`, the `CreativeTabSections` visual banner-divider system, and `CreativeVariantPickerOverlay` for switching sub-variants in-place.

## Complete Example: Item Registration with Fuel, Tags & Tab Sections

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.util.CreativeTabSection;
import dev.anvilcraft.lib.v2.registrum.util.entry.ItemEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.RegistryEntry;
import net.minecraft.client.data.models.model.ModelTemplates;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;

public class ModItems {
    public static final ItemEntry<Item> BLAZE_COKE = MyMod.REGISTRUM
        .item("blaze_coke", Item::new)
        .properties(p -> p.rarity(Rarity.UNCOMMON).stacksTo(64))
        .burnTime(3200)
        .compost(0.65F)
        .tag(ItemTags.COALS)
        .lang("Blaze Coke")
        .model(() -> (ctx, prov) -> prov.generateFlatItem(ctx.get(), ModelTemplates.FLAT_ITEM))
        .register();

    public static final RegistryEntry<CreativeModeTab, CreativeModeTab> MAIN_TAB = MyMod.REGISTRUM
        .defaultCreativeTab("main_tab", builder -> builder
            .title(Component.translatable("itemGroup.mymod.main"))
            .icon(BLAZE_COKE::asStack)
            .sectionedDisplayItems(sections -> {
                sections.add(
                    CreativeTabSection.builder(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "textures/gui/tab_banner.png"))
                        .bannerLength(4)
                        .text(Component.literal("Fuels & Materials"))
                        .textBackgroundColor(0x88201810)
                        .build(),
                    output -> {
                        output.accept(BLAZE_COKE);
                        output.accept(Items.COAL);
                    }
                );
            })
        )
        .register();

    public static void register() {
    }
}
```

## `ItemBuilder<T extends Item, P>` Deep Dive

### Creation & Default Behaviors

When created via `AbstractRegistrum#item(...)`, the framework automatically applies:
- `defaultModel()`: generates a standard flat item model via `RegistrumItemModelGenerator#generateFlatItem(ctx.get(), ModelTemplates.FLAT_ITEM)`;
- `defaultLang()`: generates an English translation key from the registry name;
- If a default creative tab was set via `AbstractRegistrum#defaultCreativeTab(...)`, automatically registers `tab(defaultTab)`.

### `AbstractRegistrum` Item Entry Overloads

- `item(NonNullFunction<Item.Properties, T> factory)`
- `item(String name, NonNullFunction<Item.Properties, T> factory)`
- `item(P parent, NonNullFunction<Item.Properties, T> factory)`
- `item(P parent, String name, NonNullFunction<Item.Properties, T> factory)`

### `ItemBuilder` Full API Reference

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `properties(NonNullUnaryOperator<Item.Properties> func)` | `ItemBuilder<T, P>` | Modifies `Item.Properties`; automatically calls `.setId(getResourceKey())` during instantiation |
| `initialProperties(NonNullSupplier<Item.Properties> properties)` | `ItemBuilder<T, P>` | Replaces the initial `Item.Properties` constructor without clearing previously registered `properties(...)` modifiers |
| `tab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | Adds the default stack to the target creative tab |
| `tab(ResourceKey<CreativeModeTab> tab, NonNullBiConsumer<DataGenContext<Item, T>, CreativeModeTabModifier> modifier)` | `ItemBuilder<T, P>` | Customizes how the item (e.g., multiple NBT/enchanted variants) is added to the tab; later calls for the same tab key overwrite earlier ones |
| `tab(ResourceKey<CreativeModeTab> tab, Consumer<CreativeModeTabModifier> modifier)` | `ItemBuilder<T, P>` | Deprecated (`@Deprecated`); use the overload taking `DataGenContext` instead |
| `removeTab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | Removes a configured creative tab (commonly used to opt out of the default tab) |
| `defaultModel()` | `ItemBuilder<T, P>` | Binds the standard flat item model (`ModelTemplates.FLAT_ITEM`) |
| `model(NonNullSupplier<NonNullBiConsumer<DataGenContext<Item, T>, RegistrumItemModelGenerator>> cons)` | `ItemBuilder<T, P>` | Customizes item model generation; only evaluated and bound to `ProviderType.ITEM_MODEL` when `doDatagen().get()` is true |
| `defaultLang()` / `lang(String name)` | `ItemBuilder<T, P>` | Generates the lang file entry using auto-naming or a custom English name |
| `recipe(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumRecipeProvider> cons)` | `ItemBuilder<T, P>` | Adds recipe datagen for this item |
| `burnTime(int burnTime)` | `ItemBuilder<T, P>` | Generates furnace fuel burn time (in ticks) for this item via DataMap (`NeoForgeDataMaps.FURNACE_FUELS`) |
| `compost(float chance)` | `ItemBuilder<T, P>` | Generates composter probability (`0.0F–1.0F`) for this item via DataMap (`NeoForgeDataMaps.COMPOSTABLES`) |
| `clientExtension(NonNullSupplier<Supplier<IClientItemExtensions>> clientExtension)` | `ItemBuilder<T, P>` | Registers custom `IClientItemExtensions` (client-only, via `RegisterClientExtensionsEvent`) |
| `tag(TagKey<Item>... tags)` | `ItemBuilder<T, P>` | Adds one or more `TagKey<Item>`s to `ProviderType.ITEM_TAGS` |
| `register()` | `ItemEntry<T>` | Finalizes registration and returns `ItemEntry<T>` |

> [!NOTE]
> Minecraft 1.21.4 migrated item tinting completely to the model-driven `ItemTintSource` system (see [`RegistrumItemModelGenerator#generateTintedModel`](./datagen-providers)), so legacy `ItemBuilder#color(...)` has been removed in this version.

## Creative Tabs: `CreativeTabBuilder` & `CreativeModeTabModifier`

### Approach 1: Via `AbstractRegistrum#creativeTab(...)` or `defaultCreativeTab(...)`

1. `defaultCreativeTab(String name)` / `defaultCreativeTab(String name, Consumer<CreativeTabBuilder<S>> config)`: creates a tab and sets it as the default creative tab for this `Registrum` so all subsequent `ItemBuilder`s join it automatically;
2. `creativeTab(String name, Consumer<CreativeTabBuilder<S>> config)` / `creativeTab(P parent, String name, Consumer<CreativeTabBuilder<P>> config)`: creates a standalone creative tab;
3. To bypass `CreativeTabBuilder`, you can also call legacy `defaultCreativeTab(P parent, String name, Consumer<CreativeModeTab.Builder> config)`.

### `CreativeTabBuilder<P>` API Overview

| Method | Description |
| --- | --- |
| `defaultTitle()` | Automatically sets the title using `"itemGroup.<modid>.<name>"` |
| `title(Component displayName)` | Sets a custom title component |
| `icon(Supplier<ItemStack> iconGenerator)` | Sets the tab icon item stack |
| `displayItems(CreativeModeTab.DisplayItemsGenerator displayItemsGenerator)` | Standard item display generator |
| `sectionedDisplayItems(Consumer<CreativeTabSections> displayItems)` | Enables multi-section banner display builder (with banner titles, row alignment, and tooltips) |
| `alignedRight()` / `hideTitle()` / `noScrollBar()` | Forwards directly to `CreativeModeTab.Builder` layout options |
| `backgroundTexture(ResourceLocation)` / `withSearchBar()` / `withSearchBar(int)` | Configures background texture and search bar |
| `withTabsImage(ResourceLocation)` / `withTabsBefore(...)` / `withTabsAfter(...)` | Configures tab sprites and tab ordering |
| `config(Consumer<CreativeModeTab.Builder> config)` | Accesses the underlying `CreativeModeTab.Builder` for any remaining configuration |
| `lang(String name)` / `lang(String langKey, String name)` | Adds the localized tab title to the language provider |

### `CreativeModeTabModifier` (Used via `AbstractRegistrum#modifyCreativeModeTab` or `ItemBuilder#tab`)

`CreativeModeTabModifier` implements `CreativeModeTab.Output` and adds `Supplier<? extends ItemLike>` convenience methods so `.get()` does not need to be called during static construction:

- `getFlags()`: `FeatureFlagSet`
- `getParameters()`: `CreativeModeTab.ItemDisplayParameters`
- `hasPermissions()`: `boolean` (whether the player has operator tab permissions)
- `accept(ItemStack stack, CreativeModeTab.TabVisibility visibility)`
- `accept(Supplier<? extends ItemLike> item, CreativeModeTab.TabVisibility visibility)`
- `accept(Supplier<? extends ItemLike> item)` (visible in both the tab and search tab by default)

## Banner Sections: `CreativeTabSection` & `CreativeTabSections`

To divide different mod tiers or block families inside a single creative tab with graphical banners, use `CreativeTabSections` and `CreativeTabSection.builder(bannerTexture)` inside `CreativeTabBuilder#sectionedDisplayItems`.

### Core Mechanics

1. Creative inventory rows are fixed at **9 columns** (`CreativeTabSection.MAX_BANNER_LENGTH = 9`, `BANNER_CELL_SIZE = 18` pixels).
2. When a section writes items via `CreativeTabSections`, if a banner follows items or is not aligned to column 0, `CreativeTabSections` inserts invisible filler slots to finish the current row so the banner always starts cleanly on a new row.
3. Items in a section exceeding the banner's span wrap normally onto subsequent rows; the banner texture itself is rendered on the client by `CreativeTabSectionRenderListener` and `CreativeModeInventoryScreenMixin`, showing the custom `tooltip` on hover.

### `CreativeTabSection.Builder` Full Options

| Method | Description | Default / Constraint |
| --- | --- | --- |
| `CreativeTabSection.builder(ResourceLocation bannerTexture)` | Creates a new section builder from a banner texture | Required; usually under `textures/gui/...png` |
| `bannerLength(int bannerLength)` | Width of the banner in inventory slots | Default `3` (`MIN_BANNER_LENGTH = 1` to `MAX_BANNER_LENGTH = 9`) |
| `text(Component text)` | Title text rendered on the banner surface | Default `Component.empty()` |
| `textBackgroundColor(int argb)` | ARGB color of the backdrop strip behind text | `0` disables text background |
| `textAlignment(TextAlignment align)` | Horizontal text alignment (`LEFT` / `CENTER` / `RIGHT`) | Default left-aligned |
| `textRange(int textStart, int textEnd)` | Horizontal pixel bounds `[start, end]` for text | Default `2px` padding on both sides |
| `textIndent(int textStart)` / `textIndent(int textStart, int textEnd)` | Sets start/end using indent amounts for simpler padding | — |
| `textLeft(int)` / `textRight(int)` | Sets left or right pixel bound of the text area individually | — |
| `tooltip(Component... tooltip)` / `tooltip(List<Component>)` | Multi-line tooltip shown when hovering the banner | Default empty list |
| `build()` | Returns the immutable `CreativeTabSection` record | — |

### `CreativeTabSections` Core Methods

- `add(CreativeTabSection section, Consumer<CreativeModeTab.Output> items)`: appends an item group with a banner.
- `addSection(CreativeTabSection section)` / `addDisplayItems(Consumer<CreativeModeTab.Output>)`: registers a section header or item stream separately.
- `CreativeTabSections.of(ResourceKey<CreativeModeTab> tabKey)` / `findSection(CreativeModeTab tab, ItemStack stack)`: internal runtime lookup helpers used by screen mixins and client renderers to locate section metadata for a tab.

## Creative Variant Picker (`CreativeVariantPicker`)

For color variants or multi-appearance blocks/items (such as 16-color blocks or gear sizes), place the representative item in the creative tab as an "entry representative" and register the variant list to `CreativeVariantPickerRegistry`. When hovering in the creative inventory and triggering the hotkey (scroll or click UI, see `CreativeVariantPickerOverlay`), players can expand the variant popup in-place to swap or pick variants.

```java
// 1. Have your custom item implement marker interface CreativeVariantPickerItem,
//    or use helper methods to register variant groups to the global registry:
CreativeVariantPickerRegistry.register(
    MyItems.COLORED_LAMP_WHITE.asItem(),
    List.of(
        MyItems.COLORED_LAMP_WHITE.asStack(),
        MyItems.COLORED_LAMP_RED.asStack(),
        MyItems.COLORED_LAMP_BLUE.asStack()
    )
);
```

### `CreativeVariantPickerRegistry` & `CreativeVariantPickerItem`

| API | Description |
| --- | --- |
| `CreativeVariantPickerItem` | Allows item classes to implement this interface and return their variant list (`getCreativeVariants(ItemStack, ...)`, etc.) |
| `CreativeVariantPickerRegistry#register(...)` | Associates variant stack sets with any `Item` / `ItemLike` without modifying the item class source |
| `CreativeVariantPickerOverlay` | Built-in client overlay renderer and mouse-scroll controller that pops up the variant menu on hover and handles packet sync |
