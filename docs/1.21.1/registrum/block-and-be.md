# 方块与方块实体构建 (`BlockBuilder` & `BlockEntityBuilder`)

方块及其伴生物品（`BlockItem`）和方块实体（`BlockEntityType`）通常是模组开发中使用最频繁的组合。`BlockBuilder` 与 `BlockEntityBuilder` 支持在一个链式表达式内协同完成注册、模型生成、渲染层/染色绑定、能力注册与兼容别名设置。

## 方块构建器 (`BlockBuilder`)

通过 `REGISTRUM.block(name, factory)` 或先调用 `.object(name)` 再调用 `.block(factory)` 获取 `BlockBuilder<T, P>`。默认创建后会附带以下三项数据生成器：

- `defaultBlockstate()`：通过 `RegistrumBlockstateProvider#simpleBlock(Block)` 生成将所有方块状态映射为单模型的 `blockstates/<name>.json` 以及指向 `textures/block/<name>.png` 的 `cube_all` 模型。
- `defaultLoot()`：通过 `RegistrumBlockLootTables#dropSelf(Block)` 生成方块自身掉落战利品表（如果配置了 `BlockBehaviour.Properties::noLootTable` 则自动跳过）。
- `defaultLang()`：基于内部路径名称自动生成首字母大写的英文（以及对应的倒置英文）翻译文本。

### 属性定制与方块物品构建

- `initialProperties(NonNullSupplier<? extends Block> block)`：将基础属性来源替换成 `BlockBehaviour.Properties.ofFullCopy(block.get())`。已通过 `.properties(...)` 叠加过的回调链不会被清空，依然会在新基准属性上按先后顺序应用。
- `properties(NonNullUnaryOperator<BlockBehaviour.Properties> func)`：叠加懒加载属性修改函数，可在同一构建链上多次调用，依次执行。注意：在 `createEntry()` 创建实例前，内部会使用反射清空继承来的 `"drops"` 键引用，以保证方块战利品表由你定义的 `loot(...)` / `defaultLoot()` 决定，若确实不希望有掉落请在 `.properties(...)` 中显式调用 `.noLootTable()`。
- `simpleItem()`：按默认名称创建标准 `BlockItem` 并立刻通过 `.build()` 退回到 `BlockBuilder`。默认会取消物品侧重复生成的 `LANG` 条目（因为 `BlockItem` 沿用方块的描述 ID），并自动检测 `BlockState` 关联的默认模型来生成物品模型，若无模型则调用 `prov.blockItem(...)`。
- `item()` / `item(NonNullBiFunction<? super T, Item.Properties, ? extends I> factory)`：创建 `ItemBuilder`，返回该子构建器以继续设置堆叠、燃料时间、自定义渲染扩展、物品标签、自定义模型或加入创造模式标签页；配置完毕后调用 `.build()` 即可回到 `BlockBuilder`。

### 关联方块实体

- `simpleBlockEntity(BlockEntityFactory<BE> factory)`：以同名创建 `BlockEntityType<BE>`，并自动将该方块添加为唯一有效方块，随即退回 `BlockBuilder`。
- `blockEntity(BlockEntityFactory<BE> factory)`：创建并返回 `BlockEntityBuilder<BE, BlockBuilder<T, P>>`，便于进一步绑定 `BlockEntityRenderer`、NeoForge `RegisterCapabilitiesEvent` 或追加其它有效方块（`validBlock` / `validBlocks`），最后使用 `.build()` 回到 `BlockBuilder`。

::: tip 衍生条目重命名别名 (`aliasFrom`)
当在 `BlockBuilder` 上调用 `aliasFrom(oldNames)` 时：如果该方块链真正创建了配套的 `BlockItem`（调用了 `.item(...)` / `.simpleItem()`）或 `BlockEntityType`（调用了 `.blockEntity(...)` / `.simpleBlockEntity(...)`），`BlockBuilder` 会在 `.register()` 时自动为 `Registries.BLOCK`、`Registries.ITEM` 及 `Registries.BLOCK_ENTITY_TYPE` 同步补全 `oldNames` 别名映射；若未创建对应衍生条目则跳过对应注册表，避免产生无效别名。
:::

### 渲染、客户端扩展与染色

- `color(NonNullSupplier<Supplier<BlockColor>> colorHandler)`：在客户端安全地通过 `RegisterColorHandlersEvent.Block` 注册方块动态着色器（如树叶、流体染色）。注意：使用双层 `Supplier` 包装（`() -> () -> (state, level, pos, tintIndex) -> ...`）以防止专用服务端类加载异常。注意不要将方块染色直接混淆为物品染色，物品如有需要请进入 `.item().color(...)` 配置。
- `clientExtension(NonNullSupplier<Supplier<IClientBlockExtensions>> clientExtension)`：在客户端注册 NeoForge `RegisterClientExtensionsEvent` 中的方块扩展（如自定义破坏粒子/挖掘效应）。另有一个接受 `Function<T, NonNullSupplier<Supplier<IClientBlockExtensions>>>` 的重载已标记 `@Deprecated(forRemoval = true)`。
- `addLayer(Supplier<Supplier<RenderType>> layer)`：已标记 `@Deprecated(forRemoval = true)`，在 `FMLClientSetupEvent` 阶段调用 `ItemBlockRenderTypes.setRenderLayer`。官方推荐改为在方块模型 JSON 的 `"render_type"` 字段指定渲染类型。

### 方块数据生成与标签

- `blockstate(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumBlockstateProvider> cons)` / `defaultBlockstate()`：自定义方块状态与方块模型生成器。
- `loot(NonNullBiConsumer<RegistrumBlockLootTables, T> cons)` / `defaultLoot()`：自定义方块战利品表；如果方块具有 `BuiltInLootTables.EMPTY`（例如调用了 `.noLootTable()`），注册的回调会被静默跳过。
- `recipe(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumRecipeProvider> cons)`：生成与该方块相关的配方。
- `lang(String name)` / `defaultLang()`：覆写方块的显示名称（`Block::getDescriptionId`）。
- `tag(TagKey<Block>... tags)`：便捷方法，内部委托给 `tag(ProviderType.BLOCK_TAGS, tags)`。

### `BlockEntry<T>` 包装 API

`BlockBuilder.register()` 返回 `BlockEntry<T>`（继承 `ItemProviderEntry<Block, T>`）：

- `getDefaultState()`：等价于 `get().defaultBlockState()`。
- `has(BlockState state)`：判断给定的 `BlockState` 是否属于该方块（`is(state.getBlock())`）。
- `BlockEntry.cast(RegistryEntry<Block, T> entry)`：安全将通用 `RegistryEntry` 转换为 `BlockEntry<T>`。

## 方块实体构建器 (`BlockEntityBuilder`)

可以通过独立入口 `REGISTRUM.blockEntity(name, factory)` 或在 `BlockBuilder` 内部通过 `.blockEntity(factory)` 构建。其构造工厂函数接口为：

```java
@FunctionalInterface
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

### 核心配置方法

- `validBlock(NonNullSupplier<? extends Block> block)` / `validBlocks(NonNullSupplier<? extends Block>... blocks)`：追加该 `BlockEntityType` 允许挂载的有效方块集合（在 `BlockBuilder.blockEntity(...)` 中已默认填入宿主方块）。
- `renderer(NonNullSupplier<NonNullFunction<BlockEntityRendererProvider.Context, BlockEntityRenderer<? super T>>> renderer)`：通过客户端安全事件在 `FMLClientSetupEvent` 阶段调用 `BlockEntityRenderers.register(...)` 绑定 `BlockEntityRenderer`。
- `registerCapability(Consumer<RegisterCapabilitiesEvent> registerCapabilitiesEvent)`：通过 `OneTimeEventReceiver` 监听 `RegisterCapabilitiesEvent`，便于在声明方块实体的同时紧邻着注册物品栏、流体槽或能量接口 Capability。

### `BlockEntityEntry<T>` 包装 API

`BlockEntityBuilder.register()` 返回 `BlockEntityEntry<T>`：

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `create(BlockPos pos, BlockState state)` | `T` | 使用该类型创建默认方块实体实例 |
| `is(@Nullable BlockEntity t)` | `boolean` | 判断目标实例非空且 `t.getType() == get()` |
| `get(BlockGetter world, BlockPos pos)` | `Optional<T>` | 从世界指定坐标获取并强转为 `Optional<T>` |
| `getNullable(BlockGetter world, BlockPos pos)` | `@Nullable T` | 从世界指定坐标获取，类型不符或不存在则返回 `null` |
| `BlockEntityEntry.cast(entry)` | `BlockEntityEntry<T>` | 强转通用条目为 `BlockEntityEntry` |

## 完整实用示例：带容器界面与能力接口的工作方块

以下示例演示如何组合使用 `BlockBuilder`、`BlockEntityBuilder` 与工具方法注册一个完整的粉碎机方块：包含自定义材质模型、挖掘工具标签、方块实体、Capability 挂载与客户端渲染器：

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
