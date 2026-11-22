# Block & BlockEntity Builders (`Block & BlockEntity`)

In Minecraft 1.21.4, constructing a `Block` requires setting the registry key on `BlockBehaviour.Properties` (`properties.setId(...)`), and `BlockEntityType` removed its inner Builder in favor of a public constructor. `BlockBuilder` and `BlockEntityBuilder` handle both changes automatically, letting you focus on block logic.

## Complete Example: Registering a Block with Item & BlockEntity

The complete example below registers a multi-purpose processing block with a custom `BlockEntity`, block entity renderer (BER), fuel property, and automatic drop-self loot table:

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntityEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntry;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;

public class ProcessingMachineBlock extends Block implements EntityBlock {
    public static final BlockEntry<ProcessingMachineBlock> MACHINE_BLOCK = MyMod.REGISTRUM
        .block("processing_machine", ProcessingMachineBlock::new)
        .initialProperties(() -> net.minecraft.world.level.block.Blocks.IRON_BLOCK)
        .properties(p -> p.strength(4.0F, 8.0F).sound(SoundType.METAL).noOcclusion())
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL)
        .lang("Processing Machine")
        .blockstate(() -> (ctx, prov) -> prov.createTrivialCube(ctx.getEntry()))
        .item()
        .tag(net.minecraft.tags.ItemTags.PICKAXES) // Configure BlockItem tags or properties as needed
        .build()
        .blockEntity(ProcessingMachineBlockEntity::new)
        .onRegister(type -> {
            // Run custom callback after BlockEntityType is instantiated
        })
        .build()
        .register();

    public static final BlockEntityEntry<ProcessingMachineBlockEntity> MACHINE_BE =
        BlockEntityEntry.cast(MACHINE_BLOCK.getSibling(net.minecraft.core.registries.Registries.BLOCK_ENTITY_TYPE));

    public ProcessingMachineBlock(Properties properties) {
        super(properties);
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new ProcessingMachineBlockEntity(MACHINE_BE.get(), pos, state);
    }

    public static class ProcessingMachineBlockEntity extends BlockEntity {
        public ProcessingMachineBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
            super(type, pos, state);
        }
    }
}
```

> [!WARNING]
> On this branch, both `BlockBuilder#addLayer(...)` and `BlockEntityBuilder#registerCapability(...)` have been removed:
> - For translucent/cutout render layers, set `"render_type": "minecraft:cutout"` directly in the block model JSON (generatable via `RegistrumLegacyBlockModelBuilder#renderType(...)`).
> - For NeoForge Capabilities, listen to `RegisterCapabilitiesEvent` on the Mod bus directly rather than via `BlockEntityBuilder`.

## `BlockBuilder<T extends Block, P>` Deep Dive

### Creation & Default Behaviors

When creating a `BlockBuilder` via `AbstractRegistrum#block(...)`, the framework attaches three default datagen configs:
1. `defaultBlockstate()`: generates a basic 6-sided cube (`createTrivialCube`) and corresponding item model via vanilla's model generator;
2. `defaultLoot()`: generates a drop-self loot table (`dropSelf`) for blocks with loot tables;
3. `defaultLang()`: generates an English translation key from the registry name (e.g., `"copper_gear"` -> `"Copper Gear"`).

### `AbstractRegistrum` Block Entry Overloads

| Method Signature | Description |
| --- | --- |
| `block(NonNullFunction<BlockBehaviour.Properties, T> factory)` | Creates a block builder using the current `object(name)` name |
| `block(String name, NonNullFunction<BlockBehaviour.Properties, T> factory)` | Creates a block builder with the given registry name |
| `block(P parent, NonNullFunction<BlockBehaviour.Properties, T> factory)` | Uses the current default name with an explicit parent builder |
| `block(P parent, String name, NonNullFunction<BlockBehaviour.Properties, T> factory)` | Full form for deriving blocks inside other builders (such as `FluidBuilder#block`) |

### `BlockBuilder` Full API Reference

| Method Signature | Return Type | Description & Lifecycle Timing |
| --- | --- | --- |
| `properties(NonNullUnaryOperator<BlockBehaviour.Properties> func)` | `BlockBuilder<T, P>` | Fluently modifies block properties (callable multiple times, composed in order); returning a new `Properties` replaces existing ones |
| `initialProperties(NonNullSupplier<? extends Block> block)` | `BlockBuilder<T, P>` | Uses `BlockBehaviour.Properties.ofFullCopy(block.get())` as the initial base without clearing previously appended `properties(...)` |
| `simpleItem()` | `BlockBuilder<T, P>` | Registers a standard `BlockItem` and returns this `BlockBuilder` |
| `item()` | `ItemBuilder<BlockItem, BlockBuilder<T, P>>` | Registers a same-named standard `BlockItem` and enters its child `ItemBuilder` context to configure stacks, tags, recipes, etc. |
| `item(NonNullBiFunction<? super T, Item.Properties, ? extends I> factory)` | `ItemBuilder<I, BlockBuilder<T, P>>` | Creates a custom `BlockItem` subclass sharing aliases (and skipping duplicate lang by default); item model attempts to reuse the single-block model for variant `""` |
| `simpleBlockEntity(BlockEntityFactory<BE> factory)` | `BlockBuilder<T, P>` | Creates a same-named `BlockEntityType` for this block and returns this `BlockBuilder` |
| `blockEntity(BlockEntityFactory<BE> factory)` | `BlockEntityBuilder<BE, BlockBuilder<T, P>>` | Creates a same-named `BlockEntityBuilder`, automatically adding this block to `validBlock(...)` and entering its context |
| `color(NonNullSupplier<Supplier<BlockColor>> colorHandler)` | `BlockBuilder<T, P>` | Registers a client block color handler (via `RegisterColorHandlersEvent.Block`) |
| `defaultBlockstate()` | `BlockBuilder<T, P>` | Restores the default blockstate and model callback (`prov -> prov.createTrivialCube(ctx.getEntry())`) |
| `blockstate(NonNullSupplier<NonNullBiConsumer<DataGenContext<Block, T>, RegistrumBlockModelGenerator>> cons)` | `BlockBuilder<T, P>` | Configures blockstate and models; only evaluates the outer `Supplier` and registers to `ProviderType.BLOCKSTATE` when `doDatagen().get()` is true |
| `defaultLang()` / `lang(String name)` | `BlockBuilder<T, P>` | Sets or restores the English localized name |
| `defaultLoot()` | `BlockBuilder<T, P>` | Restores default drop-self logic (`RegistrumBlockLootTables::dropSelf`) |
| `loot(NonNullBiConsumer<RegistrumBlockLootTables, T> cons)` | `BlockBuilder<T, P>` | Customizes loot table generation; skipped automatically if `noLootTable()` is set on the block |
| `recipe(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumRecipeProvider> cons)` | `BlockBuilder<T, P>` | Registers crafting recipes under `ProviderType.RECIPE` |
| `clientExtension(NonNullSupplier<Supplier<IClientBlockExtensions>> clientExtension)` | `BlockBuilder<T, P>` | Binds `IClientBlockExtensions` on the client during `RegisterClientExtensionsEvent` |
| `clientExtension(Function<T, NonNullSupplier<Supplier<IClientBlockExtensions>>> clientExtension)` | `BlockBuilder<T, P>` | Deprecated (`@Deprecated(forRemoval = true)`); lazily constructs client extensions from the block instance |
| `tag(TagKey<Block>... tags)` | `BlockBuilder<T, P>` | Batch-appends block tags to `ProviderType.BLOCK_TAGS` |
| `register()` | `BlockEntry<T>` | Freezes config and queues registration |

> [!TIP]
> Note that `blockstate(() -> (ctx, prov) -> ...)` uses two nested lambdas! The outer `NonNullSupplier` prevents loading client model classes and skips callback capture during normal gameplay (non-Datagen), so avoid placing side effects outside it.

### Alias Inheritance for Derived `BlockEntity`

When a `BlockBuilder` calls `aliasFrom(oldName)`:
- If `item(...)` (or `simpleItem()`) was called, `ITEM` automatically registers the same legacy alias;
- If `blockEntity(...)` (or `simpleBlockEntity(...)`) was called, `BLOCK_ENTITY_TYPE` automatically inherits the legacy alias.

## `BlockEntityBuilder<T extends BlockEntity, P>` Deep Dive

`BlockEntityBuilder` builds `BlockEntityType<T>` and binds a `BlockEntityRenderer` on the client. Its underlying factory interface is:

```java
@FunctionalInterface
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

### `AbstractRegistrum` BlockEntity Entry Overloads

- `blockEntity(BlockEntityFactory<T> factory)`
- `blockEntity(String name, BlockEntityFactory<T> factory)`
- `blockEntity(P parent, BlockEntityFactory<T> factory)`
- `blockEntity(P parent, String name, BlockEntityFactory<T> factory)`

### `BlockEntityBuilder` Full API Reference

| Method Signature | Return Type | Description |
| --- | --- | --- |
| `validBlock(NonNullSupplier<? extends Block> block)` | `BlockEntityBuilder<T, P>` | Appends a single valid block supplier (callable multiple times when multiple blocks share one BE) |
| `validBlocks(NonNullSupplier<? extends Block>... blocks)` | `BlockEntityBuilder<T, P>` | Batch-appends multiple blocks allowed to host this `BlockEntity` |
| `renderer(NonNullSupplier<NonNullFunction<BlockEntityRendererProvider.Context, BlockEntityRenderer<? super T>>> renderer)` | `BlockEntityBuilder<T, P>` | Registers a client block entity renderer |
| `register()` | `BlockEntityEntry<T>` | Instantiates `new BlockEntityType<>(factoryWrapper, validBlocksArray)` and returns `BlockEntityEntry<T>` |

> [!NOTE]
> `BlockEntityBuilder#renderer(...)` registers during `FMLClientSetupEvent` and binds the block entity class and Renderer via `BlockEntityRenderers.register(...)`. The outer `NonNullSupplier` is only evaluated on `Dist.CLIENT`, so dedicated servers never load renderer classes.

### Example: Sharing One `BlockEntity` Across Multiple Blocks & Binding a Renderer

```java
public static final BlockEntityEntry<SharedStorageBlockEntity> SHARED_STORAGE_BE = MyMod.REGISTRUM
    .<SharedStorageBlockEntity>blockEntity("shared_storage", SharedStorageBlockEntity::new)
    .validBlocks(ModBlocks.WOOD_CRATE, ModBlocks.IRON_CRATE)
    .renderer(() -> SharedStorageRenderer::new)
    .register();
```

### Auto-Linking `BlockItem` Models from `Block`

By default, calling `BlockBuilder#item()` attaches a smart model callback: if the block's `BLOCKSTATE` generator recorded an un-propertied variant (`""`) referencing a single block model, `BlockBuilder#item(...)` calls `prov.createWithExistingModel(ctx.get(), model)` so the item points directly to that block model. If your block uses Multipart or multiple variants (e.g., `FACING`), explicitly call `.model(() -> (ctx, prov) -> prov.createWithExistingModel(ctx.get(), ModelLocationUtils.getModelLocation(ModBlocks.MY_BLOCK.get(), "_inventory")))` in the item chain.
