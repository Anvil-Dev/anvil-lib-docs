# 方块与方块实体构建器 (`Block & BlockEntity`)

构造 `Block` 必须在 `BlockBehaviour.Properties` 上提前写入注册表键（`properties.setId(...)`），同时 `BlockEntityType` 直接通过公共构造器实例化。`BlockBuilder` 与 `BlockEntityBuilder` 已经自动接管这两项工作，并且 `BlockEntityBuilder` 支持直接链式挂载 NeoForge 能力注册（`registerCapability`），让开发者只需专注方块逻辑本身。

## 注册带物品、方块实体与能力的完整案例

下面的完整示例注册了一个带有自定义 `BlockEntity`、方框渲染器（BESR）、物品处理能力（`Capabilities.ItemHandler.BLOCK`）以及自动掉落自身战利品表的多功能处理方块：

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntityEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.BlockEntry;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.neoforge.capabilities.Capabilities;
import net.neoforged.neoforge.items.ItemStackHandler;

public class ProcessingMachineBlock extends Block implements EntityBlock {
    public static final BlockEntry<ProcessingMachineBlock> MACHINE_BLOCK = MyMod.REGISTRUM
        .block("processing_machine", ProcessingMachineBlock::new)
        .initialProperties(() -> Blocks.IRON_BLOCK)
        .properties(p -> p.strength(4.0F, 8.0F).sound(SoundType.METAL).noOcclusion())
        .tag(BlockTags.MINEABLE_WITH_PICKAXE, BlockTags.NEEDS_IRON_TOOL)
        .lang("Processing Machine")
        .blockstate(() -> (ctx, prov) -> prov.createTrivialCube(ctx.getEntry()))
        .item()
        .tag(net.minecraft.tags.ItemTags.PICKAXES)
        .build()
        .blockEntity(ProcessingMachineBlockEntity::new)
        .registerCapability(event -> event.registerBlockEntity(
            Capabilities.ItemHandler.BLOCK,
            ProcessingMachineBlock.MACHINE_BE.get(),
            (be, side) -> be.inventory
        ))
        .onRegister(type -> {
            // 可在方块实体类型实例化后执行自定义回调
        })
        .build()
        .register();

    public static final BlockEntityEntry<ProcessingMachineBlockEntity> MACHINE_BE =
        BlockEntityEntry.cast(MACHINE_BLOCK.getSibling(Registries.BLOCK_ENTITY_TYPE));

    public ProcessingMachineBlock(Properties properties) {
        super(properties);
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new ProcessingMachineBlockEntity(MACHINE_BE.get(), pos, state);
    }

    public static class ProcessingMachineBlockEntity extends BlockEntity {
        public final ItemStackHandler inventory = new ItemStackHandler(2);

        public ProcessingMachineBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
            super(type, pos, state);
        }
    }
}
```

## `BlockBuilder<T extends Block, P>` 详解

### 创建与默认行为

通过 `AbstractRegistrum#block(...)` 创建 `BlockBuilder` 时，框架会默认自动挂载三项数据生成配置：
1. `defaultBlockstate()`：通过原版模型生成器生成基础六面同贴图立方体（`createTrivialCube`）及对应物品模型；
2. `defaultLoot()`：为具备战利品表的方块生成掉落自身（`dropSelf`）；
3. `defaultLang()`：基于注册名生成英文翻译键（例如 `"copper_gear"` -> `"Copper Gear"`）。

### `AbstractRegistrum` 方块入口重载

| 方法签名 | 说明 |
| --- | --- |
| `block(NonNullFunction<BlockBehaviour.Properties, T> factory)` | 使用当前 `object(name)` 作为名称创建方块构建器 |
| `block(String name, NonNullFunction<BlockBehaviour.Properties, T> factory)` | 指定注册名创建方块构建器 |
| `block(P parent, NonNullFunction<BlockBehaviour.Properties, T> factory)` | 使用当前默认名并显式传入父构建器对象 |
| `block(P parent, String name, NonNullFunction<BlockBehaviour.Properties, T> factory)` | 完整形式，用于在其他构建器内部派生方块（如 `FluidBuilder#block`） |

### `BlockBuilder` 全量 API 参考

| 方法签名 | 返回类型 | 说明与生命周期时机 |
| --- | --- | --- |
| `properties(NonNullUnaryOperator<BlockBehaviour.Properties> func)` | `BlockBuilder<T, P>` | 链式修改方块属性（可多次调用，按调用顺序组合）；若返回新 `Properties` 实例会替换既有属性 |
| `initialProperties(NonNullSupplier<? extends Block> block)` | `BlockBuilder<T, P>` | 以现有方块的 `BlockBehaviour.Properties.ofFullCopy(block.get())` 作为初始基底，不影响之后已追加的 `properties(...)` |
| `simpleItem()` | `BlockBuilder<T, P>` | 等价于 `item().defaultLang().build()`，注册标准 `BlockItem` 并直接返回当前 `BlockBuilder` |
| `item()` | `ItemBuilder<BlockItem, BlockBuilder<T, P>>` | 注册同名标准 `BlockItem` 并切入其 `ItemBuilder` 子上下文以配置堆叠、标签、配方等 |
| `item(NonNullBiFunction<? super T, Item.Properties, ? extends I> factory)` | `ItemBuilder<I, BlockBuilder<T, P>>` | 使用自定义 `BlockItem` 子类创建对应方块物品，共享别名；物品模型会在 Datagen 时尝试通过 `BlockStateModel.Unbaked.CODEC` 复用无状态变体（variant `""`）对应的单方块模型 |
| `simpleBlockEntity(BlockEntityFactory<BE> factory)` | `BlockBuilder<T, P>` | 为当前方块创建同名 `BlockEntityType` 并返回本 `BlockBuilder` |
| `blockEntity(BlockEntityFactory<BE> factory)` | `BlockEntityBuilder<BE, BlockBuilder<T, P>>` | 创建同名 `BlockEntityBuilder`，自动将本方块加入 `validBlock(...)`，并切入方块实体配置上下文 |
| `color(NonNullSupplier<Supplier<BlockColor>> colorHandler)` | `BlockBuilder<T, P>` | 注册客户端方块染色处理器（通过 `RegisterColorHandlersEvent.Block`） |
| `defaultBlockstate()` | `BlockBuilder<T, P>` | 恢复默认方块状态与模型回调（`prov -> prov.createTrivialCube(ctx.getEntry())`） |
| `blockstate(NonNullSupplier<NonNullBiConsumer<DataGenContext<Block, T>, RegistrumBlockModelGenerator>> cons)` | `BlockBuilder<T, P>` | 配置方块状态与模型；仅在 `doDatagen().get()` 为真时求值外层 `Supplier` 并注册至 `ProviderType.BLOCKSTATE` |
| `defaultLang()` / `lang(String name)` | `BlockBuilder<T, P>` | 设置或恢复英文语言本地化名称 |
| `defaultLoot()` | `BlockBuilder<T, P>` | 恢复默认掉落自身逻辑（`RegistrumBlockLootTables::dropSelf`） |
| `loot(NonNullBiConsumer<RegistrumBlockLootTables, T> cons)` | `BlockBuilder<T, P>` | 自定义战利品表构建；若方块配置了 `noLootTable()` 则自动跳过调用 |
| `recipe(NonNullBiConsumer<DataGenContext<Block, T>, RegistrumRecipeProvider> cons)` | `BlockBuilder<T, P>` | 注册合成配方，挂载到 `ProviderType.RECIPE` |
| `clientExtension(NonNullSupplier<Supplier<IClientBlockExtensions>> clientExtension)` | `BlockBuilder<T, P>` | 在客户端触发 `RegisterClientExtensionsEvent` 时为方块绑定 `IClientBlockExtensions` |
| `clientExtension(Function<T, NonNullSupplier<Supplier<IClientBlockExtensions>>> clientExtension)` | `BlockBuilder<T, P>` | 已弃用（`@Deprecated(forRemoval = true)`），基于方块实例延迟构造客户端扩展 |
| `tag(TagKey<Block>... tags)` | `BlockBuilder<T, P>` | 向 `ProviderType.BLOCK_TAGS` 批量追加方块标签 |
| `register()` | `BlockEntry<T>` | 冻结配置并登记到注册队列 |

> [!TIP]
> 注意 `blockstate(() -> (ctx, prov) -> ...)` 使用两层 Lambda！外层 `NonNullSupplier` 的作用是在实际运行游戏（非 Datagen 环境）时避免加载客户端模型类并跳过回调捕获，因此不要把纯逻辑判断或副作用放在外层之外执行。若需在方块模型 JSON 或代码生成中引用多属性状态组合，请配合 [`PropertyDispatchWrap`](./datagen-providers) 以避免专用服务端启动崩溃。

### 注册 `BlockEntity` 的别名继承行为

当某 `BlockBuilder` 调用了 `aliasFrom(oldName)` 后：
- 如果该方块调用了 `item(...)`（或 `simpleItem()`），`ITEM` 注册表也会自动登记相同旧路径别名；
- 如果调用了 `blockEntity(...)`（或 `simpleBlockEntity(...)`），`BLOCK_ENTITY_TYPE` 注册表同样自动继承旧名称别名。

## `BlockEntityBuilder<T extends BlockEntity, P>` 详解

`BlockEntityBuilder` 负责构建 `BlockEntityType<T>`、绑定客户端 `BlockEntityRenderer`，以及挂载 `RegisterCapabilitiesEvent` 回调。其底层工厂接口为：

```java
@FunctionalInterface
public interface BlockEntityFactory<T extends BlockEntity> {
    T create(BlockEntityType<T> type, BlockPos pos, BlockState state);
}
```

### `AbstractRegistrum` 方块实体入口重载

- `blockEntity(BlockEntityFactory<T> factory)`
- `blockEntity(String name, BlockEntityFactory<T> factory)`
- `blockEntity(P parent, BlockEntityFactory<T> factory)`
- `blockEntity(P parent, String name, BlockEntityFactory<T> factory)`

### `BlockEntityBuilder` 全量 API 参考

| 方法签名 | 返回类型 | 说明 |
| --- | --- | --- |
| `validBlock(NonNullSupplier<? extends Block> block)` | `BlockEntityBuilder<T, P>` | 向合法适用方块集合追加单个方块供应器（可在多方块共用同一 BE 时多次调用） |
| `validBlocks(NonNullSupplier<? extends Block>... blocks)` | `BlockEntityBuilder<T, P>` | 批量追加多个可承载此 `BlockEntity` 的方块 |
| `renderer(NonNullSupplier<NonNullFunction<BlockEntityRendererProvider.Context, BlockEntityRenderer<? super T>>> renderer)` | `BlockEntityBuilder<T, P>` | 注册客户端方块实体渲染器 |
| `registerCapability(Consumer<RegisterCapabilitiesEvent> listener)` | `BlockEntityBuilder<T, P>` | 通过 `OneTimeEventReceiver.addModListener(...)` 挂载一次性 `RegisterCapabilitiesEvent` 监听器，在链式注册期间就近声明方块实体能力 |
| `register()` | `BlockEntityEntry<T>` | 实例化 `new BlockEntityType<>(factoryWrapper, validBlocksSet)` 并返回 `BlockEntityEntry<T>` |

> [!NOTE]
> `BlockEntityBuilder#renderer(...)` 仅在客户端环境（`Dist.CLIENT`）下对供应器求值并注册到 `BlockEntityRenderers.register(...)`，专用服务端不会加载渲染类。

### 多方块共享同一 `BlockEntity` 与绑定渲染器示例

```java
public static final BlockEntityEntry<SharedStorageBlockEntity> SHARED_STORAGE_BE = MyMod.REGISTRUM
    .<SharedStorageBlockEntity>blockEntity("shared_storage", SharedStorageBlockEntity::new)
    .validBlocks(ModBlocks.WOOD_CRATE, ModBlocks.IRON_CRATE)
    .renderer(() -> SharedStorageRenderer::new)
    .registerCapability(event -> event.registerBlockEntity(
        Capabilities.ItemHandler.BLOCK,
        SHARED_STORAGE_BE.get(),
        (be, side) -> be.getInventory()
    ))
    .register();
```

### 在 `Block` 派生 `BlockItem` 时联动模型生成器

默认情况下，调用 `BlockBuilder#item()` 创建 `BlockItem` 时会自动挂载模型推演回调：如果在 `BLOCKSTATE` 生成器中仅记录了无状态变体（variant `""`）且 `BlockStateModel.Unbaked.CODEC` 编码为单模型对象，框架会自动调用 `prov.createWithExistingModel(ctx.get(), model)` 让物品直接指向该方块模型。若你的方块使用 Multipart（多部分组合）或拥有多条 Variant（如带有 `FACING` 状态），请在该物品分支后显式调用 `.model(() -> (ctx, prov) -> prov.createWithExistingModel(ctx.get(), ModelLocationUtils.getModelLocation(ModBlocks.MY_BLOCK.get(), "_inventory")))` 指定专用物品模型。
