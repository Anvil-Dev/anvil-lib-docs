# 方块与方块实体构建器 (`BlockBuilder` / `BlockEntityBuilder`)

<BranchContextCard branch="26.1" />

在 `module.registrum` 中，**`BlockBuilder`** 与 **`BlockEntityBuilder`** 是使用频率最高的两个构建器。通过链式调用，你可以在声明一个方块的同时完成属性配置、派生 `BlockItem` 注册、派生 `BlockEntityType` 绑定、客户端着色器/扩展注册，以及方块状态模型、掉落战利品表、挖掘等级标签、合成配方与中英文语言文件的自动生成。

---

## 一、 `BlockBuilder` 的默认约定（开箱即用）

当你调用 `REGISTRUM.block("my_block", Block::new)` 时，`BlockBuilder.create` 会**自动启用以下三项默认数据生成器**（如果不需要某项默认生成，可在链式调用中覆盖）：

1. **`defaultBlockstate()`**：默认生成将所有状态指向单一六面同贴图模型（`prov.createTrivialCube(block)`，对应贴图 `assets/<modid>/textures/block/<name>.png`）的 BlockState 定义；
2. **`defaultLoot()`**：默认生成破坏后掉落方块自身（`RegistrumBlockLootTables::dropSelf`）的战利品表（若方块属性设置了 `.noLootTable()` 则自动跳过）；
3. **`defaultLang()`**：默认根据注册名生成首字母大写的英文翻译（如 `"my_block"` → `"My Block"`）。

> **注意**：`BlockBuilder` **默认不会自动创建 `BlockItem`**。如果该方块需要对应的物品形式，请在链中调用 `.simpleItem()`（使用默认配置立即构建 `BlockItem`）或 `.item() ... .build()`（进入 `ItemBuilder` 自定义物品属性后再返回 `BlockBuilder`）。
> 当调用 `.item()` 时，`BlockBuilder` 会自动提取方块默认状态的模型路径，为 `BlockItem` 生成引用该方块模型的客户端物品模型（`prov.createWithExistingModel(...)`）。

---

## 二、 完整代码示例

下面演示两个典型场景：**普通装饰/矿石方块注册** 与 **带 `BlockEntity`、自定义渲染器（BER）及 NeoForge `RegisterCapabilitiesEvent` 能力绑定的机器方块注册**。

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
    // 示例 1：从现有方块复制初始属性、带矿石掉落、标签与合成表的方块
    public static final BlockEntry<Block> RUBY_ORE = MyMod.REGISTRUM
        .block("ruby_ore", Block::new)
        .initialProperties(() -> Blocks.DIAMOND_ORE)
        .properties(p -> p.strength(3.0f, 3.0f).requiresCorrectToolForDrops().sound(SoundType.STONE))
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL)
        // 自定义战利品表：精准采集掉自身，否则受时运加成掉落红宝石
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
        // 进入子 ItemBuilder 为其 BlockItem 添加物品标签，再 .build() 回到 BlockBuilder
        .item()
            .tag(ItemTags.IRON_ORES)
            .build()
        .lang("Ruby Ore")
        .register();

    // 示例 2：带方块实体、客户端 BER 渲染器与 Capabilities 能力注册的机器方块
    public static final BlockEntry<CrusherBlock> CRUSHER = MyMod.REGISTRUM
        .block("crusher", CrusherBlock::new)
        .initialProperties(() -> Blocks.IRON_BLOCK)
        .properties(p -> p.noOcclusion())
        .tag(BlockTags.MINEABLE_WITH_PICKAXE)
        .simpleItem()
        // 在方块链中直接声明同名 BlockEntity，亦可单独使用 REGISTRUM.blockEntity(...)
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

    // 通过 getSibling 或 REGISTRUM.get 获取上面内联创建的同名 BlockEntityEntry
    public static final BlockEntityEntry<CrusherBlockEntity> CRUSHER_BE =
        BlockEntityEntry.cast(CRUSHER.getSibling(net.minecraft.core.registries.Registries.BLOCK_ENTITY_TYPE));

    public static void register() {
    }
}
```

---

## 三、 `BlockBuilder<T, P>` 与 `BlockEntry<T>` API 详解

### 1. `BlockBuilder<T, P>` 方法一览

继承自 `AbstractBuilder<Block, T, P, BlockBuilder<T, P>>`。在 `createEntry()` 实例化方块时，会自动调用 `properties.setId(getResourceKey())` 注入 Minecraft 26.1 要求的方块资源键 ID。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public BlockBuilder<T, P> properties(NonNullUnaryOperator<BlockBehaviour.Properties> func)` | `BlockBuilder<T, P>` | 链式修改方块属性（通过 `andThen` 组合，可多次调用）。 |
| `public BlockBuilder<T, P> initialProperties(NonNullSupplier<? extends Block> block)` | `BlockBuilder<T, P>` | 使用 `BlockBehaviour.Properties.ofFullCopy(block.get())` 替换初始属性提供器（不会清除已通过 `properties(...)` 挂载的修改函数）。 |
| `public BlockBuilder<T, P> simpleItem()` | `BlockBuilder<T, P>` | 立即创建并构建默认 `BlockItem`，返回当前 `BlockBuilder`。 |
| `public ItemBuilder<BlockItem, BlockBuilder<T, P>> item()`<br>`public <I extends Item> ItemBuilder<I, BlockBuilder<T, P>> item(NonNullBiFunction<? super T, Item.Properties, ? extends I> factory)` | `ItemBuilder<..., BlockBuilder<T, P>>` | 创建默认或自定义子类的 `BlockItem` 构建器，自动配置引用方块模型的物品模型生成器。配置完物品后调用 `.build()` 即可回到 `BlockBuilder`。 |
| `public <BE extends BlockEntity> BlockBuilder<T, P> simpleBlockEntity(BlockEntityFactory<BE> factory)`<br>`public <BE extends BlockEntity> BlockEntityBuilder<BE, BlockBuilder<T, P>> blockEntity(BlockEntityFactory<BE> factory)` | `BlockBuilder` / `BlockEntityBuilder` | 创建与当前方块同名、且自动将当前方块加入 `validBlock` 的 `BlockEntityBuilder`。 |
| `public BlockBuilder<T, P> color(NonNullSupplier<Supplier<List<BlockTintSource>>> colorHandler)` | `BlockBuilder<T, P>` | 在物理客户端自动监听 `RegisterColorHandlersEvent.BlockTintSources`，为该方块注册 26.1 的 `BlockTintSource` 着色器列表。 |
| `public BlockBuilder<T, P> clientExtension(NonNullSupplier<Supplier<IClientBlockExtensions>> clientExtension)` | `BlockBuilder<T, P>` | 在物理客户端自动监听 `RegisterClientExtensionsEvent`，为该方块注册 `IClientBlockExtensions`。 |
| `public BlockBuilder<T, P> defaultBlockstate()`<br>`public BlockBuilder<T, P> blockstate(NonNullSupplier<NonNullBiConsumer<DataGenContext<Block, T>, RegistrumBlockModelGenerator>> cons)` | `BlockBuilder<T, P>` | 设置或自定义方块状态与方块模型数据生成逻辑（`ProviderType.BLOCKSTATE`）。 |
| `public BlockBuilder<T, P> defaultLang()` / `public BlockBuilder<T, P> lang(String name)` | `BlockBuilder<T, P>` | 设置默认英文名称或指定英文翻译文本（使用 `Block::getDescriptionId`）。 |
| `public BlockBuilder<T, P> defaultLoot()`<br>`public BlockBuilder<T, P> loot(NonNullBiConsumer<RegistrumBlockLootTables, T> cons)` | `BlockBuilder<T, P>` | 设置默认掉落自身或自定义方块战利品表生成逻辑（`ProviderType.LOOT`）。 |
| `public BlockBuilder<T, P> recipe(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumRecipeProvider> cons)` | `BlockBuilder<T, P>` | 设置与该方块关联的配方生成回调（`ProviderType.RECIPE`）。 |
| `public final BlockBuilder<T, P> tag(TagKey<Block>... tags)` | `BlockBuilder<T, P>` | 为该方块添加方块标签（`ProviderType.BLOCK_TAGS`）。 |
| `public BlockEntry<T> register()` | `BlockEntry<T>` | 完成构建并返回 `BlockEntry<T>`。若调用过 `aliasFrom(oldId)`，会同时为已创建的 `BlockItem` 和 `BlockEntityType` 注册同名别名。 |

### 2. `BlockEntry<T>`（方块注册项包装类）

继承自 `ItemProviderEntry<Block, T>`（因此直接实现了 `ItemLike`，并提供 `asStack()`、`asItem()`、`isIn(ItemStack)` 等方法）。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public BlockState getDefaultState()` | `BlockState` | 等同于 `get().defaultBlockState()`。 |
| `public boolean has(BlockState state)` | `boolean` | 判断给定的 `BlockState` 是否属于该方块（`is(state.getBlock())`）。 |
| `public static <T extends Block> BlockEntry<T> cast(RegistryEntry<Block, T> entry)` | `BlockEntry<T>` | 将通用 `RegistryEntry<Block, T>` 安全强转为 `BlockEntry<T>`。 |

---

## 四、 `BlockEntityBuilder<T, P>` 与 `BlockEntityEntry<T>` API 详解

### 1. `BlockEntityBuilder<T, P>` 方法一览

位于 `dev.anvilcraft.lib.v2.registrum.builders.BlockEntityBuilder`。其工厂接口 `BlockEntityFactory<T>` 签名为：

```java
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

因此，你的 `BlockEntity` 子类构造器只需声明为 `public MyBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state)`，即可直接使用方法引用 `MyBlockEntity::new`！

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public BlockEntityBuilder<T, P> validBlock(NonNullSupplier<? extends Block> block)`<br>`public final BlockEntityBuilder<T, P> validBlocks(NonNullSupplier<? extends Block>... blocks)` | `BlockEntityBuilder<T, P>` | 向该 `BlockEntityType` 添加允许挂载的一个或多个方块提供器（如传入 `BlockEntry`）。 |
| `public BlockEntityBuilder<T, P> renderer(NonNullSupplier<NonNullFunction<BlockEntityRendererProvider.Context, BlockEntityRenderer<? super T, ?>>> renderer)` | `BlockEntityBuilder<T, P>` | 在物理客户端自动监听 `FMLClientSetupEvent`，调用 `BlockEntityRenderers.register(getEntry(), ...)` 绑定方块实体渲染器。双层 Supplier 确保服务端不会加载客户端渲染器类。 |
| `public BlockEntityBuilder<T, P> registerCapability(Consumer<RegisterCapabilitiesEvent> listener)` | `BlockEntityBuilder<T, P>` | 自动监听 Mod 总线上的 `RegisterCapabilitiesEvent`，在回调中为该方块实体注册能力（如物品栏、流体槽、能量存储）。 |
| `public BlockEntityEntry<T> register()` | `BlockEntityEntry<T>` | 完成构建并返回 `BlockEntityEntry<T>`。 |

### 2. `BlockEntityEntry<T>`（方块实体注册项包装类）

继承自 `RegistryEntry<BlockEntityType<?>, BlockEntityType<T>>`。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public T create(BlockPos pos, BlockState state)` | `T` | 调用 `get().create(pos, state)` 实例化一个默认方块实体。 |
| `public boolean is(@Nullable BlockEntity t)` | `boolean` | 判断给定的 `BlockEntity` 是否非空且其 `getType() == this.get()`。 |
| `public Optional<T> get(BlockGetter world, BlockPos pos)` | `Optional<T>` | 从 `world.getBlockEntity(pos)` 获取方块实体，若存在且类型匹配则安全转型并包装为 `Optional<T>`，否则返回 `Optional.empty()`。 |
| `public @Nullable T getNullable(BlockGetter world, BlockPos pos)` | `@Nullable T` | 同上，类型匹配时返回转型后的 `T`，否则返回 `null`。 |
| `public static <T extends BlockEntity> BlockEntityEntry<T> cast(RegistryEntry<BlockEntityType<?>, BlockEntityType<T>> entry)` | `BlockEntityEntry<T>` | 将通用 `RegistryEntry` 安全强转为 `BlockEntityEntry<T>`。 |
