# Block & BlockEntity Builders (`BlockBuilder` & `BlockEntityBuilder`)

Blocks along with their companion items (`BlockItem`) and block entities (`BlockEntityType`) are the most frequent combination in mod development. `BlockBuilder` and `BlockEntityBuilder` work together inside a single fluent expression to handle registration, model generation, render layer/tint binding, capability registration, and legacy aliases.

## Block Builder (`BlockBuilder`)

Obtain `BlockBuilder<T, P>` via `REGISTRUM.block(name, factory)` or `.object(name).block(factory)`. By default, three data generators are attached:

- `defaultBlockstate()`: generates `blockstates/<name>.json` mapping all states to a single model and a `cube_all` model pointing to `textures/block/<name>.png` via `RegistrumBlockstateProvider#simpleBlock(Block)`.
- `defaultLoot()`: generates a drop-self loot table via `RegistrumBlockLootTables#dropSelf(Block)` (skipped automatically if `BlockBehaviour.Properties::noLootTable` is set).
- `defaultLang()`: auto-generates Title Cased English (and upside-down English) translations from the internal path name.

### Property Customization & BlockItem Building

- `initialProperties(NonNullSupplier<? extends Block> block)`: replaces the base properties source with `BlockBehaviour.Properties.ofFullCopy(block.get())`. Previously appended `.properties(...)` modifiers are preserved and applied sequentially on top of the new base.
- `properties(NonNullUnaryOperator<BlockBehaviour.Properties> func)`: appends a lazy property modifier (callable multiple times in order). Note: before `createEntry()` instantiates the block, inherited `"drops"` key references are cleared via reflection so loot tables are governed by your `loot(...)` / `defaultLoot()`; call `.noLootTable()` explicitly inside `.properties(...)` if no drops are desired.
- `simpleItem()`: creates a standard `BlockItem` with the default name and immediately returns to `BlockBuilder` via `.build()`. Suppresses duplicate item-side `LANG` entries (since `BlockItem` shares the block's description ID) and auto-detects the default block model (or calls `prov.blockItem(...)`).
- `item()` / `item(NonNullBiFunction<? super T, Item.Properties, ? extends I> factory)`: creates and enters a child `ItemBuilder` to configure stack size, fuel time, client extensions, item tags, custom models, or creative tabs; call `.build()` to return to `BlockBuilder`.

### Associated BlockEntity

- `simpleBlockEntity(BlockEntityFactory<BE> factory)`: creates a same-named `BlockEntityType<BE>` with this block as its sole valid block and returns to `BlockBuilder`.
- `blockEntity(BlockEntityFactory<BE> factory)`: creates and returns `BlockEntityBuilder<BE, BlockBuilder<T, P>>` to bind a `BlockEntityRenderer`, NeoForge `RegisterCapabilitiesEvent`, or extra `validBlock` / `validBlocks`, then call `.build()` to return to `BlockBuilder`.

::: tip Derived Entry Rename Aliases (`aliasFrom`)
When `aliasFrom(oldNames)` is called on `BlockBuilder`: if a companion `BlockItem` (`.item(...)` / `.simpleItem()`) or `BlockEntityType` (`.blockEntity(...)` / `.simpleBlockEntity(...)`) is created, `BlockBuilder` automatically adds `oldNames` aliases to `Registries.BLOCK`, `Registries.ITEM`, and `Registries.BLOCK_ENTITY_TYPE` on `.register()`, skipping registries without derived entries.
:::

### Rendering, Client Extensions & Tinting

- `color(NonNullSupplier<Supplier<BlockColor>> colorHandler)`: safely registers a dynamic block tint handler on the client via `RegisterColorHandlersEvent.Block` (double `Supplier` `() -> () -> ...` prevents dedicated server crashes; for item tinting, configure `.item().color(...)`).
- `clientExtension(NonNullSupplier<Supplier<IClientBlockExtensions>> clientExtension)`: registers NeoForge `IClientBlockExtensions` via `RegisterClientExtensionsEvent` on the client (the `Function<T, ...>` overload is `@Deprecated(forRemoval = true)`).
- `addLayer(Supplier<Supplier<RenderType>> layer)`: `@Deprecated(forRemoval = true)`; calls `ItemBlockRenderTypes.setRenderLayer` in `FMLClientSetupEvent`. Prefer setting `"render_type"` in the block model JSON.

### Block Datagen & Tags

- `blockstate(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumBlockstateProvider> cons)` / `defaultBlockstate()`: customizes blockstate and block model generation.
- `loot(NonNullBiConsumer<RegistrumBlockLootTables, T> cons)` / `defaultLoot()`: customizes block loot tables; callbacks are silently skipped if the block has `BuiltInLootTables.EMPTY` (e.g., `.noLootTable()`).
- `recipe(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumRecipeProvider> cons)`: generates recipes associated with this block.
- `lang(String name)` / `defaultLang()`: overrides the block's display name (`Block::getDescriptionId`).
- `tag(TagKey<Block>... tags)`: convenience shortcut delegating to `tag(ProviderType.BLOCK_TAGS, tags)`.

### `BlockEntry<T>` Wrapper API

`BlockBuilder.register()` returns `BlockEntry<T>` (extending `ItemProviderEntry<Block, T>`):

- `getDefaultState()`: equivalent to `get().defaultBlockState()`.
- `has(BlockState state)`: checks whether `state` belongs to this block (`is(state.getBlock())`).
- `BlockEntry.cast(RegistryEntry<Block, T> entry)`: safely casts a generic `RegistryEntry` to `BlockEntry<T>`.

## BlockEntity Builder (`BlockEntityBuilder`)

Created via `REGISTRUM.blockEntity(name, factory)` or `.blockEntity(factory)` inside `BlockBuilder`. Its factory interface is:

```java
@FunctionalInterface
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

### Core Configuration Methods

- `validBlock(NonNullSupplier<? extends Block> block)` / `validBlocks(NonNullSupplier<? extends Block>... blocks)`: appends valid blocks for this `BlockEntityType` (the host block is pre-added when using `BlockBuilder.blockEntity(...)`).
- `renderer(NonNullSupplier<NonNullFunction<BlockEntityRendererProvider.Context, BlockEntityRenderer<? super T>>> renderer)`: binds `BlockEntityRenderer` via `BlockEntityRenderers.register(...)` in `FMLClientSetupEvent`.
- `registerCapability(Consumer<RegisterCapabilitiesEvent> registerCapabilitiesEvent)`: listens to `RegisterCapabilitiesEvent` via `OneTimeEventReceiver`, letting you declare item/fluid/energy capabilities right next to the block entity.

### `BlockEntityEntry<T>` Wrapper API

`BlockEntityBuilder.register()` returns `BlockEntityEntry<T>`:

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `create(BlockPos pos, BlockState state)` | `T` | Creates a default block entity instance of this type |
| `is(@Nullable BlockEntity t)` | `boolean` | Checks non-null and `t.getType() == get()` |
| `get(BlockGetter world, BlockPos pos)` | `Optional<T>` | Gets from world at `pos` and casts to `Optional<T>` |
| `getNullable(BlockGetter world, BlockPos pos)` | `@Nullable T` | Gets from world at `pos`, returning `null` if absent or mismatched |
| `BlockEntityEntry.cast(entry)` | `BlockEntityEntry<T>` | Casts a generic entry to `BlockEntityEntry` |

## Complete Practical Example: Working Block with Menu & Capabilities

The example below combines `BlockBuilder`, `BlockEntityBuilder`, and helpers to register a crusher block with custom textures, mining tags, block entity, Capability binding, and client renderer:

```java
package com.example.examplemod.registry;

import com.example.examplemod.ExampleMod;
import com.example.examplemod.block.CrusherBlock;
import com.example.examplemod.block.entity.CrusherBlockEntity;
import com.example.examplemod.client.render.CrusherRenderer;
import dev.anvilcraft.lib.v2.registrum.providers.ProviderType;
import dev.anvilcraft.lib.v2.registrum.providers.RegistrumRecipeProvider;
import dev.anvilcraft.lib.v2.registrum.util.DataIngredient;
import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntityEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntry;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.recipes.RecipeCategory;
import net.minecraft.data.recipes.ShapedRecipeBuilder;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.neoforged.neoforge.capabilities.Capabilities;

public class ModBlocks {
    public static final BlockEntry<CrusherBlock> CRUSHER = ExampleMod.REGISTRUM
        .block("crusher", CrusherBlock::new)
        .initialProperties(() -> Blocks.IRON_BLOCK)
        .properties(p -> p.strength(4.5f, 8.0f).sound(SoundType.METAL).noOcclusion())
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL)
        .lang("Mechanical Crusher")
        .blockstate((ctx, prov) -> prov.horizontalBlock(
            ctx.getEntry(),
            prov.models().getExistingFile(prov.modLoc("block/crusher"))
        ))
        .loot((tb, block) -> tb.dropSelf(block))
        .item()
            .tab(ModCreativeTabs.MAIN_TAB.getKey())
            .recipe((ctx, prov) -> ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ctx.get())
                .pattern("IPI")
                .pattern("IFI")
                .pattern("BBB")
                .define('I', Items.IRON_INGOT)
                .define('P', Items.PISTON)
                .define('F', Items.FURNACE)
                .define('B', Blocks.IRON_BLOCK)
                .unlockedBy("has_piston", RegistrumRecipeProvider.has(Items.PISTON))
                .save(prov))
            .build()
        .blockEntity(CrusherBlockEntity::new)
            .renderer(() -> CrusherRenderer::new)
            .registerCapability(event -> {
                BlockEntityEntry<CrusherBlockEntity> be = BlockEntityEntry.cast(
                    ExampleMod.REGISTRUM.get("crusher", Registries.BLOCK_ENTITY_TYPE)
                );
                event.registerBlockEntity(
                    Capabilities.ItemHandler.BLOCK,
                    be.get(),
                    (entity, side) -> entity.getItemHandler()
                );
            })
            .build()
        .aliasFrom(ResourceLocation.fromNamespaceAndPath(ExampleMod.MODID, "old_grinder"))
        .register();

    public static void register() {}
}
```
