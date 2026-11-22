# Block & BlockEntity Builders (`BlockBuilder` / `BlockEntityBuilder`)

<BranchContextCard branch="26.1" />

In `module.registrum`, **`BlockBuilder`** and **`BlockEntityBuilder`** are the most frequently used builders. Through fluent chaining, you can declare a block while configuring its properties, derived `BlockItem`, derived `BlockEntityType`, client tint/extension hooks, and automatic generation of blockstate models, loot tables, mining tags, recipes, and language entries.

---

## 1. `BlockBuilder` Default Conventions (Out of the Box)

When you call `REGISTRUM.block("my_block", Block::new)`, `BlockBuilder.create` **automatically enables three default data generators** (which can be overridden in the chain if not needed):

1. **`defaultBlockstate()`**: Generates a blockstate pointing all states to a single 6-sided cube model (`prov.createTrivialCube(block)`, texture `assets/<modid>/textures/block/<name>.png`);
2. **`defaultLoot()`**: Generates a drop-self loot table (`RegistrumBlockLootTables::dropSelf`, automatically skipped if `.noLootTable()` is set on properties);
3. **`defaultLang()`**: Generates a Title Cased English name from the registry name (e.g., `"my_block"` → `"My Block"`).

> **Note**: `BlockBuilder` **does not automatically create a `BlockItem`**. If the block needs an item form, call `.simpleItem()` (builds a default `BlockItem` immediately) or `.item() ... .build()` (enters `ItemBuilder` to customize item properties before returning to `BlockBuilder`).
> When `.item()` is called, `BlockBuilder` automatically extracts the block's default state model path and generates a `BlockItem` client item model referencing it (`prov.createWithExistingModel(...)`).

---

## 2. Full Code Examples

The examples below show two common scenarios: **a standard ore/decorative block** and **a machine block with a `BlockEntity`, custom BER, and NeoForge `RegisterCapabilitiesEvent` capability binding**.

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import com.example.mymod.block.CrusherBlock;
import com.example.mymod.block.entity.CrusherBlockEntity;
import com.example.mymod.client.renderer.CrusherRenderer;
import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntityEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntry;
import net.minecraft.core.Direction;
import net.minecraft.data.recipes.RecipeCategory;
import net.minecraft.data.recipes.ShapedRecipeBuilder;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.neoforged.neoforge.capabilities.Capabilities;

public final class ModBlocks {
    // Example 1: Block copying initial properties from an existing block, with ore loot, tags, and recipe
    public static final BlockEntry<Block> RUBY_ORE = MyMod.REGISTRUM
        .block("ruby_ore", Block::new)
        .initialProperties(() -> Blocks.DIAMOND_ORE)
        .properties(p -> p.strength(3.0f, 3.0f).requiresCorrectToolForDrops().sound(SoundType.STONE))
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL)
        // Custom loot table: Silk Touch drops self, otherwise Fortune-boosted ruby drops
        .loot((lootTables, block) -> lootTables.add(
            block,
            lootTables.createSilkTouchDispatchTable(
                block,
                lootTables.applyExplosionDecay(
                    block,
                    net.minecraft.world.level.storage.loot.entries.LootItem.lootTableItem(Items.EMERALD)
                )
            )
        ))
        // Enter child ItemBuilder to add item tags to its BlockItem, then .build() back to BlockBuilder
        .item()
            .tag(ItemTags.IRON_ORES)
            .build()
        .lang("Ruby Ore")
        .register();

    // Example 2: Machine block with BlockEntity, client BER renderer, and Capabilities registration
    public static final BlockEntry<CrusherBlock> CRUSHER = MyMod.REGISTRUM
        .block("crusher", CrusherBlock::new)
        .initialProperties(() -> Blocks.IRON_BLOCK)
        .properties(p -> p.noOcclusion())
        .tag(BlockTags.MINEABLE_WITH_PICKAXE)
        .simpleItem()
        // Declare a same-named BlockEntity inline in the block chain, or use REGISTRUM.blockEntity(...) separately
        .blockEntity(CrusherBlockEntity::new)
            .renderer(() -> CrusherRenderer::new)
            .registerCapability(event -> event.registerBlockEntity(
                Capabilities.Item.BLOCK,
                ModBlocks.CRUSHER_BE.get(),
                (be, side) -> be.getItemHandler(side)
            ))
            .build()
        .recipe((ctx, prov) -> ShapedRecipeBuilder.shaped(prov.items, RecipeCategory.MISC, ctx.get())
            .pattern("III")
            .pattern("IPI")
            .pattern("III")
            .define('I', Items.IRON_INGOT)
            .define('P', Items.PISTON)
            .unlockedBy("has_iron", prov.has(Items.IRON_INGOT))
            .save(prov))
        .register();

    // Retrieve the inline BlockEntityEntry created above via getSibling or REGISTRUM.get
    public static final BlockEntityEntry<CrusherBlockEntity> CRUSHER_BE =
        BlockEntityEntry.cast(CRUSHER.getSibling(net.minecraft.core.registries.Registries.BLOCK_ENTITY_TYPE));

    public static void register() {
    }
}
```

---

## 3. `BlockBuilder<T, P>` & `BlockEntry<T>` API Reference

### 1. `BlockBuilder<T, P>` Methods

Extends `AbstractBuilder<Block, T, P, BlockBuilder<T, P>>`. In `createEntry()`, it automatically calls `properties.setId(getResourceKey())` to inject the block resource key ID required by Minecraft 26.1.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public BlockBuilder<T, P> properties(NonNullUnaryOperator<BlockBehaviour.Properties> func)` | `BlockBuilder<T, P>` | Fluently modifies block properties (composed via `andThen`, callable multiple times). |
| `public BlockBuilder<T, P> initialProperties(NonNullSupplier<? extends Block> block)` | `BlockBuilder<T, P>` | Replaces the initial properties supplier with `BlockBehaviour.Properties.ofFullCopy(block.get())` (does not clear modifiers added via `properties(...)`). |
| `public BlockBuilder<T, P> simpleItem()` | `BlockBuilder<T, P>` | Immediately creates and builds a default `BlockItem`, returning this `BlockBuilder`. |
| `public ItemBuilder<BlockItem, BlockBuilder<T, P>> item()`<br>`public <I extends Item> ItemBuilder<I, BlockBuilder<T, P>> item(NonNullBiFunction<? super T, Item.Properties, ? extends I> factory)` | `ItemBuilder<..., BlockBuilder<T, P>>` | Creates a default or custom `BlockItem` builder with an item model generator referencing the block model. Call `.build()` after configuring to return to `BlockBuilder`. |
| `public <BE extends BlockEntity> BlockBuilder<T, P> simpleBlockEntity(BlockEntityFactory<BE> factory)`<br>`public <BE extends BlockEntity> BlockEntityBuilder<BE, BlockBuilder<T, P>> blockEntity(BlockEntityFactory<BE> factory)` | `BlockBuilder` / `BlockEntityBuilder` | Creates a `BlockEntityBuilder` with the same name as this block and automatically adds this block to `validBlock`. |
| `public BlockBuilder<T, P> color(NonNullSupplier<Supplier<List<BlockTintSource>>> colorHandler)` | `BlockBuilder<T, P>` | Automatically listens to `RegisterColorHandlersEvent.BlockTintSources` on the physical client to register 26.1 `BlockTintSource`s for this block. |
| `public BlockBuilder<T, P> clientExtension(NonNullSupplier<Supplier<IClientBlockExtensions>> clientExtension)` | `BlockBuilder<T, P>` | Automatically listens to `RegisterClientExtensionsEvent` on the physical client to register `IClientBlockExtensions` for this block. |
| `public BlockBuilder<T, P> defaultBlockstate()`<br>`public BlockBuilder<T, P> blockstate(NonNullSupplier<NonNullBiConsumer<DataGenContext<Block, T>, RegistrumBlockModelGenerator>> cons)` | `BlockBuilder<T, P>` | Configures or customizes blockstate and block model data generation (`ProviderType.BLOCKSTATE`). |
| `public BlockBuilder<T, P> defaultLang()` / `public BlockBuilder<T, P> lang(String name)` | `BlockBuilder<T, P>` | Sets the default English name or a custom English translation (`Block::getDescriptionId`). |
| `public BlockBuilder<T, P> defaultLoot()`<br>`public BlockBuilder<T, P> loot(NonNullBiConsumer<RegistrumBlockLootTables, T> cons)` | `BlockBuilder<T, P>` | Configures default drop-self or custom block loot table generation (`ProviderType.LOOT`). |
| `public BlockBuilder<T, P> recipe(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumRecipeProvider> cons)` | `BlockBuilder<T, P>` | Configures the recipe generation callback associated with this block (`ProviderType.RECIPE`). |
| `public final BlockBuilder<T, P> tag(TagKey<Block>... tags)` | `BlockBuilder<T, P>` | Adds block tags to this block (`ProviderType.BLOCK_TAGS`). |
| `public BlockEntry<T> register()` | `BlockEntry<T>` | Finalizes building and returns `BlockEntry<T>`. If `aliasFrom(oldId)` was called, also registers aliases for the created `BlockItem` and `BlockEntityType`. |

### 2. `BlockEntry<T>` (Block Registry Entry Wrapper)

Extends `ItemProviderEntry<Block, T>` (thus directly implements `ItemLike` and provides `asStack()`, `asItem()`, `isIn(ItemStack)`, etc.).

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public BlockState getDefaultState()` | `BlockState` | Equivalent to `get().defaultBlockState()`. |
| `public boolean has(BlockState state)` | `boolean` | Checks whether the given `BlockState` belongs to this block (`is(state.getBlock())`). |
| `public static <T extends Block> BlockEntry<T> cast(RegistryEntry<Block, T> entry)` | `BlockEntry<T>` | Safely casts a generic `RegistryEntry<Block, T>` to `BlockEntry<T>`. |

---

## 4. `BlockEntityBuilder<T, P>` & `BlockEntityEntry<T>` API Reference

### 1. `BlockEntityBuilder<T, P>` Methods

Located in `dev.anvilcraft.lib.v2.registrum.builders.BlockEntityBuilder`. Its factory interface `BlockEntityFactory<T>` has signature:

```java
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

Therefore, your `BlockEntity` subclass constructor only needs `public MyBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state)` to pass `MyBlockEntity::new` directly!

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public BlockEntityBuilder<T, P> validBlock(NonNullSupplier<? extends Block> block)`<br>`public final BlockEntityBuilder<T, P> validBlocks(NonNullSupplier<? extends Block>... blocks)` | `BlockEntityBuilder<T, P>` | Adds one or more block suppliers (such as `BlockEntry`) allowed to host this `BlockEntityType`. |
| `public BlockEntityBuilder<T, P> renderer(NonNullSupplier<NonNullFunction<BlockEntityRendererProvider.Context, BlockEntityRenderer<? super T, ?>>> renderer)` | `BlockEntityBuilder<T, P>` | Automatically listens to `FMLClientSetupEvent` on the physical client and calls `BlockEntityRenderers.register(getEntry(), ...)` to bind the BER. Double-wrapped Supplier ensures client renderer classes are never loaded on servers. |
| `public BlockEntityBuilder<T, P> registerCapability(Consumer<RegisterCapabilitiesEvent> listener)` | `BlockEntityBuilder<T, P>` | Automatically listens to `RegisterCapabilitiesEvent` on the Mod bus to register capabilities (inventory, fluid tank, energy storage) for this block entity. |
| `public BlockEntityEntry<T> register()` | `BlockEntityEntry<T>` | Finalizes building and returns `BlockEntityEntry<T>`. |

### 2. `BlockEntityEntry<T>` (BlockEntity Registry Entry Wrapper)

Extends `RegistryEntry<BlockEntityType<?>, BlockEntityType<T>>`.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public T create(BlockPos pos, BlockState state)` | `T` | Calls `get().create(pos, state)` to instantiate a default block entity. |
| `public boolean is(@Nullable BlockEntity t)` | `boolean` | Checks whether the given `BlockEntity` is non-null and its `getType() == this.get()`. |
| `public Optional<T> get(BlockGetter world, BlockPos pos)` | `Optional<T>` | Gets the block entity from `world.getBlockEntity(pos)`; if present and matching type, safely casts and wraps in `Optional<T>`, else returns `Optional.empty()`. |
| `public @Nullable T getNullable(BlockGetter world, BlockPos pos)` | `@Nullable T` | Same as above, returning the cast `T` on match or `null` otherwise. |
| `public static <T extends BlockEntity> BlockEntityEntry<T> cast(RegistryEntry<BlockEntityType<?>, BlockEntityType<T>> entry)` | `BlockEntityEntry<T>` | Safely casts a generic `RegistryEntry` to `BlockEntityEntry<T>`. |
