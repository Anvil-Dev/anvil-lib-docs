# Item, Creative Tab & Variant Picker (`ItemBuilder` / `CreativeTabBuilder` / `CreativeVariantPicker`)

<BranchContextCard branch="26.1" />

This page covers three item- and creative-inventory-related subsystems in `module.registrum`:
1. **`ItemBuilder` & `ItemEntry`**: Fluently build items, configure properties, and generate models, recipes, tags, fuel, and compost DataMaps;
2. **`CreativeTabBuilder` & Section Banner System (`CreativeTabSections` / `CreativeTabSection`)**: Insert multi-slot custom graphic/text category banners into creative tabs, auto-wrapping cleanly on the 9-column grid;
3. **4×4 Creative Variant Picker (`CreativeVariantPickerRegistry` / `CreativeVariantPickerItem` / `CreativeVariantPickerOverlay`)**: Fold up to 16 color or state variants of a series into a single representative slot that pops up a `4×4` variant selector panel on hover.

---

## 1. `ItemBuilder` Deep Dive & Usage

### 1. Default Behaviors & DataMap Shortcuts

When you call `REGISTRUM.item("my_item", Item::new)`, `ItemBuilder.create` automatically enables:
- **`defaultModel()`**: Generates a standard flat item model (`prov.generateFlatItem(ctx.get(), ModelTemplates.FLAT_ITEM)`, texture `assets/<modid>/textures/item/<name>.png`);
- **`defaultLang()`**: Generates a Title Cased English name from the registry name (e.g., `"my_item"` → `"My Item"`);
- **Default Creative Tab**: Automatically adds the item to `REGISTRUM`'s current `defaultCreativeModeTab` (call `.removeTab(tabKey)` to opt out).
- **Built-in DataMap shortcuts**: Call `.burnTime(int ticks)` to generate `NeoForgeDataMaps.FURNACE_FUELS` fuel data, or `.compostable(float chance)` to generate `NeoForgeDataMaps.COMPOSTABLES` composter data.

### 2. Code Example: Fuel/Compostable Item & Custom Model Item

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.registrum.util.entry.ItemEntry;
import net.minecraft.client.data.models.model.ModelTemplates;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;

public final class ModItems {
    // Example 1: Pinecone item that is both furnace fuel (1600 ticks) and compostable (65% chance)
    public static final ItemEntry<Item> PINECONE = MyMod.REGISTRUM
        .item("pinecone", Item::new)
        .properties(p -> p.stacksTo(64))
        .burnTime(1600)
        .compostable(0.65f)
        .tag(ItemTags.COALS)
        .lang("Pinecone")
        .register();

    // Example 2: Forging hammer using handheld tool model (HANDHELD_ITEM)
    public static final ItemEntry<Item> FORGING_HAMMER = MyMod.REGISTRUM
        .item("forging_hammer", Item::new)
        .properties(p -> p.stacksTo(1).durability(512).rarity(Rarity.UNCOMMON))
        .model(() -> (ctx, prov) -> prov.generateFlatItem(ctx.get(), ModelTemplates.FLAT_HANDHELD_ITEM))
        .lang("Forging Hammer")
        .register();

    public static void register() {
    }
}
```

---

## 2. Creative Tabs & Section Banners (`CreativeTabBuilder` / `CreativeTabSections`)

### 1. Problem & Usage

When a mod has many items, dumping hundreds into one creative tab makes them hard to find, while splitting into 5–6 tabs crowds the top bar.

`CreativeTabBuilder#sectionedDisplayItems(Consumer<CreativeTabSections>)` lets you divide a single creative tab into multiple **sections (`CreativeTabSection`)** with banner textures, text titles, background colors, and hover tooltips:
- Each `CreativeTabSection` spans `1–9` inventory slots (`bannerLength`, default `3` slots, `18px` wide per slot);
- During `CreativeTabSections.arrange`, if the previous section did not end on a full 9-column row, empty filler slots are inserted so the next section starts on a new row, reserving `bannerLength` empty slots for the banner; `CreativeTabSectionRenderListener` draws the banner texture, aligned text, and tooltip on the client while hiding empty slot highlights under the banner.

### 2. Full Code Example: Building a Creative Tab with Section Banners

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.registrum.util.CreativeTabSection;
import dev.anvilcraft.lib.v2.registrum.util.entry.RegistryEntry;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.CreativeModeTab;

public final class ModCreativeTabs {
    private static final Identifier BANNER_TEX =
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "textures/gui/tab_banner.png");

    public static final RegistryEntry<CreativeModeTab, CreativeModeTab> MAIN_TAB = MyMod.REGISTRUM
        .creativeTab("main_tab", () -> ModItems.FORGING_HAMMER)
        .withSearchBar()
        .sectionedDisplayItems(sections -> {
            // Section 1: Tools & Weapons (spans 3 slots = 54px wide, with 20px left icon padding)
            CreativeTabSection toolsHeader = CreativeTabSection.builder(BANNER_TEX)
                .bannerLength(3)
                .text(Component.translatable("itemGroup.my_mod.section.tools"))
                .textAlignment(CreativeTabSection.TextAlignment.LEFT)
                .textRange(20, 52)
                .tooltip(Component.literal("Forging & Processing Tools"))
                .build();

            sections.section(toolsHeader, out -> {
                out.accept(ModItems.FORGING_HAMMER);
                out.accept(ModItems.PINECONE);
            });

            // Section 2: Machines & Ores
            CreativeTabSection machinesHeader = CreativeTabSection.builder(BANNER_TEX)
                .bannerLength(3)
                .text(Component.translatable("itemGroup.my_mod.section.machines"))
                .build();

            sections.section(machinesHeader, out -> {
                out.accept(ModBlocks.RUBY_ORE);
                out.accept(ModBlocks.CRUSHER);
            });
        })
        .register();

    public static void register() {
        // Set this tab as the default creative tab for subsequent items
        MyMod.REGISTRUM.defaultCreativeTab(MAIN_TAB);
    }
}
```

---

## 3. 4×4 Creative Variant Picker (`CreativeVariantPickerRegistry` / `CreativeVariantPickerItem`)

### 1. Problem & Usage

When a mod has 16-color dyed blocks/items or up to 16 component presets of an item, expanding them all takes nearly two rows of the creative inventory. `module.registrum` offers two ways to fold them into a **single representative slot** that opens `CreativeVariantPickerOverlay` (a `4×4` grid supporting left/middle/Shift-click and hotkeys) on hover:

- **Approach A (Multiple independently registered items/stacks)**:
  Call `CreativeVariantPickerRegistry.register(ItemLike... variants)` or `registerStacks(ItemStack... variants)` (count must be `2–16`; optionally pass a `BooleanSupplier` bound to a client config). When variant folding is enabled, `CreativeVariantPickerRegistry.fold(items)` folds the entire group into the first representative item.
  Additionally, calling `CreativeVariantPickerRegistry.setVanillaColorVariantPickerEnabled(() -> true)` automatically folds all standard 16-color vanilla `minecraft` item families (wool, concrete, glass, terracotta, etc.).
- **Approach B (Single `Item` class with component-based variants)**:
  Have your custom `Item` class implement `dev.anvilcraft.lib.v2.registrum.util.CreativeVariantPickerItem` and override `createCreativePickerVariants(ItemStack source)` to return `2–16` variant `ItemStack`s.

### 2. Code Example: Registering a 16-Color Group & Implementing `CreativeVariantPickerItem`

```java
package com.example.mymod.item;

import dev.anvilcraft.lib.v2.registrum.util.CreativeVariantPickerItem;
import dev.anvilcraft.lib.v2.registrum.util.CreativeVariantPickerRegistry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.DyedItemColor;

import java.util.List;

// Approach B: Single item class implementing CreativeVariantPickerItem, generating variants in stable 16-color order
public class TunableCrystalItem extends Item implements CreativeVariantPickerItem {
    public TunableCrystalItem(Properties properties) {
        super(properties);
    }

    @Override
    public List<ItemStack> createCreativePickerVariants(ItemStack source) {
        return CreativeVariantPickerRegistry.colorOrder().stream()
            .map(color -> {
                ItemStack stack = source.copyWithCount(1);
                stack.set(DataComponents.DYED_COLOR, new DyedItemColor(color.getTextureDiffuseColor()));
                return stack;
            })
            .toList();
    }
}
```

---

## 4. Public Classes & Interfaces API Reference

### 1. `ItemBuilder<T, P>`, `ItemEntry<T>` & `ItemProviderEntry<R, T>`

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| `ItemBuilder<T, P>` | • `properties(NonNullUnaryOperator<Item.Properties>)`<br>• `initialProperties(NonNullSupplier<Item.Properties>)`<br>• `tab(ResourceKey<CreativeModeTab>)` / `tab(ResourceKey<CreativeModeTab>, NonNullBiConsumer<DataGenContext<Item, T>, CreativeModeTabModifier>)` / `removeTab(ResourceKey<CreativeModeTab>)`<br>• `defaultModel()` / `model(NonNullSupplier<NonNullBiConsumer<DataGenContext<Item, T>, RegistrumItemModelGenerator>>)`<br>• `defaultLang()` / `lang(String name)`<br>• `recipe(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumRecipeProvider>)`<br>• `burnTime(int tick)` / `compostable(float chance)`<br>• `clientExtension(NonNullSupplier<Supplier<IClientItemExtensions>>)`<br>• `tag(TagKey<Item>... tags)`<br>• `ItemEntry<T> register()` | Item builder. Automatically calls `properties.setId(getResourceKey())` in `createEntry()`. |
| `ItemProviderEntry<R, T>` | • `ItemStack asStack()` / `ItemStack asStack(int count)`<br>• `boolean isIn(ItemStack stack)` / `boolean is(Item item)`<br>• `Item asItem()` | Common superclass of `BlockEntry` and `ItemEntry`, implementing `ItemLike`. |
| `ItemEntry<T>` | `public static <T extends Item> ItemEntry<T> cast(RegistryEntry<Item, T> entry)` | Item registry entry wrapper. |

### 2. `CreativeTabBuilder<P>` & `CreativeModeTabModifier`

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| `CreativeTabBuilder<P>` | • `defaultTitle()` / `title(Component)` / `icon(Supplier<ItemStack>)`<br>• `displayItems(DisplayItemsGenerator)` / `displayItems(Collection<? extends Holder<? extends ItemLike>>)` / `displayItems(ItemLike...)`<br>• `sectionedDisplayItems(Consumer<CreativeTabSections>)`<br>• `alignedRight()` / `hideTitle()` / `noScrollBar()`<br>• `backgroundTexture(Identifier)` / `withSearchBar()` / `withSearchBar(int width)`<br>• `withScrollBarSpriteLocation(Identifier)` / `withTabsImage(Identifier)`<br>• `withLabelColor(int)` / `withTabFactory(Function<...>)`<br>• `withTabsBefore(...)` / `withTabsAfter(...)` (accepts `Identifier...`, `DeferredHolder...`, `ResourceKey...`) | Creative mode tab builder. |
| `CreativeModeTabModifier` | `getFlags()` / `getParameters()` / `hasPermissions()` / `accept(ItemStack, TabVisibility)` / `accept(Supplier<? extends ItemLike>, ...)` | Implements `CreativeModeTab.Output` to append items to a tab during `BuildCreativeModeTabContentsEvent`. |

### 3. `CreativeTabSection` & `CreativeTabSections` (Section Banner System)

| Class | Key Constants / Method Signatures | Description & Validation |
| :--- | :--- | :--- |
| `CreativeTabSection` | • `MIN_BANNER_LENGTH = 1`, `MAX_BANNER_LENGTH = 9`, `DEFAULT_BANNER_LENGTH = 3`, `BANNER_CELL_SIZE = 18`, `DEFAULT_TEXT_PADDING = 2`<br>• `public static Builder builder(Identifier bannerTexture)`<br>• `hasDefaultTextRange()` / `textWidth()` / `textLeft()` / `textRight()`<br>• `enum TextAlignment { LEFT, CENTER, RIGHT }` | Immutable record describing a single section banner.<br>**Validation**: `bannerLength` must be in `[1, 9]`; text pixel bounds must satisfy `0 <= textStart < textEnd <= bannerLength * 18`, else `IllegalArgumentException` is thrown. |
| `CreativeTabSection.Builder` | `bannerLength(int)`, `text(Component)`, `textBackgroundColor(int)`, `textAlignment(TextAlignment)`, `textRange(int start, int end)`, `textIndent(int start)`, `textIndent(int start, int end)`, `textLeft(int)`, `textRight(int)`, `tooltip(Component... / List<Component>)`, `build()` | Fluently builds a `CreativeTabSection`. |
| `CreativeTabSections` | • `public static void build(Identifier tabId, ItemDisplayParameters parameters, Output output, Consumer<CreativeTabSections> contents)`<br>• `public void section(CreativeTabSection section, Consumer<CreativeTabSections> contents)`<br>• `public static Collection<ItemStack> arrange(Identifier tabId, Collection<ItemStack> items, boolean foldVariants)`<br>• `public static boolean hasSections(Identifier tabId)`<br>• `public static List<PlacedSection> placedSections(Identifier tabId)` | Collects section boundaries and arranges items and banner placeholder slots on a 9-column grid on the client (runs `foldVariants` independently per section so folding variants in an earlier section never shifts subsequent section banner positions). |

### 4. `CreativeVariantPickerRegistry`, `CreativeVariantPickerItem` & `CreativeVariantPickerOverlay`

| Class / Interface | Method Signatures | Description |
| :--- | :--- | :--- |
| `CreativeVariantPickerItem` | • `List<ItemStack> createCreativePickerVariants(ItemStack source)`<br>• `default boolean isCreativePickerEnabled(ItemStack source)` | Items can implement this interface to provide up to 16 variant `ItemStack`s in the creative inventory (ignored if fewer than 2 valid non-empty stacks). |
| `CreativeVariantPickerRegistry` | • `public static List<DyeColor> colorOrder()`<br>• `public static void setVanillaColorVariantPickerEnabled(BooleanSupplier enabled)`<br>• `public static void register(ItemLike... variants)` / `register(BooleanSupplier, ItemLike...)`<br>• `public static void registerStacks(ItemStack... variants)` / `registerStacks(BooleanSupplier, ItemStack...)` / `registerStacks(Collection<ItemStack>)` / `registerStacks(BooleanSupplier, Collection<ItemStack>)`<br>• `public static Optional<List<ItemStack>> createVariants(ItemStack source)`<br>• `public static boolean isCreativePickerEnabled(ItemStack source)`<br>• `public static Collection<ItemStack> fold(Collection<ItemStack> items)` | Registry for creative variant groups. `register(ItemLike...)` defers `ItemStack` instantiation until world registry default components are bound; `registerStacks` requires `[2, 16]` non-empty variants or throws `IllegalArgumentException`. |
| `CreativeVariantPickerOverlay` | • `public static Optional<CreativeVariantPickerOverlay> create(Slot sourceSlot)`<br>• `isValid()` / `sourceSlot()` / `contains(int guiLeft, int guiTop, double mouseX, double mouseY)`<br>• `Optional<ItemStack> variantAt(int guiLeft, int guiTop, double mouseX, double mouseY)`<br>• `render(...)` / `renderTooltip(...)` | Client-side `4×4` variant picker overlay in the creative inventory (driven automatically by `CreativeModeInventoryScreenMixin`). Flips below the slot if space above is insufficient. |
