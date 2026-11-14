# 物品、创造模式标签页与分组变体选择器

`module.registrum` 除了提供标准的 `ItemBuilder` 来声明物品及其数据生成流程之外，还内置了增强型创造模式标签页构造器 `CreativeTabBuilder`、面向视觉分组的横幅分隔系统 `CreativeTabSections`，以及支持组内子变体切换的 `CreativeVariantPickerRegistry` 与 `CreativeVariantPickerOverlay`。

## 完整示例：带燃料属性、标签与分区的物品注册

```java
package com.example.mymod;

import dev.anvilcraft.lib.v2.registrum.util.CreativeTabSection;
import dev.anvilcraft.lib.v2.registrum.util.CreativeVariantPickerRegistry;
import dev.anvilcraft.lib.v2.registrum.util.entry.ItemEntry;
import dev.anvilcraft.lib.v2.registrum.util.entry.RegistryEntry;
import net.minecraft.client.data.models.model.ModelTemplates;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
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

    public static final ItemEntry<Item> RED_LAMP = MyMod.REGISTRUM
        .item("red_lamp", Item::new)
        .lang("Red Lamp")
        .register();

    public static final ItemEntry<Item> BLUE_LAMP = MyMod.REGISTRUM
        .item("blue_lamp", Item::new)
        .lang("Blue Lamp")
        .register();

    public static final RegistryEntry<CreativeModeTab, CreativeModeTab> MAIN_TAB = MyMod.REGISTRUM
        .defaultCreativeTab("main_tab", builder -> builder
            .title(Component.translatable("itemGroup.mymod.main"))
            .icon(BLAZE_COKE::asStack)
            .sectionedDisplayItems(sections -> {
                sections.add(
                    CreativeTabSection.builder(Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "textures/gui/tab_banner.png"))
                        .bannerLength(4)
                        .text(Component.literal("Fuels & Materials"))
                        .textBackgroundColor(0x88201810)
                        .build(),
                    output -> {
                        output.accept(BLAZE_COKE);
                        output.accept(Items.COAL);
                        output.accept(RED_LAMP);
                        output.accept(BLUE_LAMP);
                    }
                );
            })
        )
        .register();

    public static void register() {
        // 注册 2~16 个独立物品组成的创造栏折叠变体组
        CreativeVariantPickerRegistry.register(RED_LAMP, BLUE_LAMP);
    }
}
```

## `ItemBuilder<T extends Item, P>` 详解

### 创建与默认行为

通过 `AbstractRegistrum#item(...)` 创建时，框架会自动应用：
- `defaultModel()`：通过 `RegistrumItemModelGenerator#generateFlatItem(ctx.get(), ModelTemplates.FLAT_ITEM)` 生成标准平面物品模型；
- `defaultLang()`：基于注册名生成英文翻译键；
- 若通过 `AbstractRegistrum#defaultCreativeTab(...)` 设置了默认创造模式标签页，会自动追加对应标签页展示回调。

### `AbstractRegistrum` 物品入口重载

- `item(NonNullFunction<Item.Properties, T> factory)`
- `item(String name, NonNullFunction<Item.Properties, T> factory)`
- `item(P parent, NonNullFunction<Item.Properties, T> factory)`
- `item(P parent, String name, NonNullFunction<Item.Properties, T> factory)`

### `ItemBuilder` 全量 API 参考

| 方法签名 | 返回类型 | 说明 |
| --- | --- | --- |
| `properties(NonNullUnaryOperator<Item.Properties> func)` | `ItemBuilder<T, P>` | 修改物品 `Item.Properties`，会在实例化阶段自动调用 `.setId(getResourceKey())` |
| `initialProperties(NonNullSupplier<Item.Properties> properties)` | `ItemBuilder<T, P>` | 替换初始 `Item.Properties` 构造器，不影响已注册的 `properties(...)` 修改链 |
| `tab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | 将默认堆叠添加到目标创造模式标签页 |
| `tab(ResourceKey<CreativeModeTab> tab, NonNullBiConsumer<DataGenContext<Item, T>, CreativeModeTabModifier> modifier)` | `ItemBuilder<T, P>` | 自定义将物品（如多种组件配置/附魔版本）写入指定创造模式标签页的逻辑；同 Tab Key 后调用者覆盖前者 |
| `tab(ResourceKey<CreativeModeTab> tab, Consumer<CreativeModeTabModifier> modifier)` | `ItemBuilder<T, P>` | 已弃用（`@Deprecated`），请改用接收 `DataGenContext` 的重载 |
| `removeTab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | 移出当前已配置的创造模式标签页（常用于清除默认 Tab） |
| `defaultModel()` | `ItemBuilder<T, P>` | 绑定平面生成模型（`ModelTemplates.FLAT_ITEM`） |
| `model(NonNullSupplier<NonNullBiConsumer<DataGenContext<Item, T>, RegistrumItemModelGenerator>> cons)` | `ItemBuilder<T, P>` | 自定义物品模型生成逻辑；仅在 `doDatagen().get()` 为真时求值并挂载到 `ProviderType.ITEM_MODEL` |
| `defaultLang()` / `lang(String name)` | `ItemBuilder<T, P>` | 使用自动名称或自定义英文名称生成语言文件条目 |
| `recipe(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumRecipeProvider> cons)` | `ItemBuilder<T, P>` | 为物品添加配方数据生成 |
| `burnTime(int burnTime)` | `ItemBuilder<T, P>` | 通过 DataMap（`NeoForgeDataMaps.FURNACE_FUELS`）为物品生成熔炉燃料燃烧时间（单位 tick） |
| `compost(float chance)` | `ItemBuilder<T, P>` | 通过 DataMap（`NeoForgeDataMaps.COMPOSTABLES`）为物品生成堆肥桶概率（`0.0F ~ 1.0F`） |
| `clientExtension(NonNullSupplier<Supplier<IClientItemExtensions>> clientExtension)` | `ItemBuilder<T, P>` | 注册自定义 `IClientItemExtensions`（仅客户端，内部利用 `RegisterClientExtensionsEvent`） |
| `tag(TagKey<Item>... tags)` | `ItemBuilder<T, P>` | 为物品添加一个或多个 `TagKey<Item>` 到 `ProviderType.ITEM_TAGS` |
| `register()` | `ItemEntry<T>` | 完成登记并返回 `ItemEntry<T>` |

> [!NOTE]
> 物品染色已统一由模型层的 `ItemTintSource` 驱动（参见 [`RegistrumItemModelGenerator#generateTintedModel`](./datagen-providers)）。

## 创造模式标签页：`CreativeTabBuilder` 与 `CreativeModeTabModifier`

### 方式一：通过 `AbstractRegistrum#creativeTab(...)` 或 `defaultCreativeTab(...)`

1. `defaultCreativeTab(String name)` / `defaultCreativeTab(String name, Consumer<CreativeTabBuilder<S>> config)`：创建标签页的同时将其设为当前 `Registrum` 的默认创造模式标签页，之后新建的所有 `ItemBuilder` 将默认归入该标签页；
2. `defaultCreativeTab(RegistryEntry<CreativeModeTab, CreativeModeTab> tab)` / `defaultCreativeTab(ResourceKey<CreativeModeTab> tab)`：将任意已有或外部注册好的创造标签页设为默认标签页；
3. `creativeTab(String name, Consumer<CreativeTabBuilder<S>> config)` / `creativeTab(P parent, String name, Consumer<CreativeTabBuilder<P>> config)`：创建常规独立标签页；
4. 若想直接配置原生构建器，也可调用 `defaultCreativeTab(P parent, String name, Consumer<CreativeModeTab.Builder> config)` 或 `creativeTab(String name, Consumer<CreativeModeTab.Builder> config)`。

### `CreativeTabBuilder<P>` API 一览

| 方法 | 说明 |
| --- | --- |
| `defaultTitle()` | 自动按 `"itemGroup.<modid>.<name>"` 规则设置标题文本 |
| `title(Component displayName)` | 指定自定义标题组件 |
| `icon(Supplier<ItemStack> iconGenerator)` | 指定标签页图标物品堆 |
| `displayItems(CreativeModeTab.DisplayItemsGenerator displayItemsGenerator)` | 标准物品填充生成器 |
| `sectionedDisplayItems(Consumer<CreativeTabSections> displayItems)` | 启用多分组横幅流式填充器（支持横幅标题、换行对齐和提示悬浮框） |
| `alignedRight()` / `hideTitle()` / `noScrollBar()` | 直接转发到底层 `CreativeModeTab.Builder` 布局选项 |
| `backgroundTexture(Identifier)` / `withSearchBar()` / `withSearchBar(int)` | 配置背景纹理与搜索栏 |
| `withTabsImage(Identifier)` / `withTabsBefore(...)` / `withTabsAfter(...)` | 配置标签页贴图与页签排序 |
| `config(Consumer<CreativeModeTab.Builder> config)` | 访问底层 `CreativeModeTab.Builder` 执行其余配置 |
| `lang(String name)` / `lang(String langKey, String name)` | 将标题本地化文本添加到语言生成器 |

### `CreativeModeTabModifier`（通过 `AbstractRegistrum#modifyCreativeModeTab` 或 `ItemBuilder#tab` 使用）

`CreativeModeTabModifier` 实现了 `CreativeModeTab.Output`，同时额外补充了 `Supplier<? extends ItemLike>` 便捷方法，无需在静态构造期提前 `.get()`：

- `getFlags()`：`FeatureFlagSet`
- `getParameters()`：`CreativeModeTab.ItemDisplayParameters`
- `hasPermissions()`：`boolean`（玩家是否具备管理员权限标签页权限）
- `accept(ItemStack stack, CreativeModeTab.TabVisibility visibility)`
- `accept(Supplier<? extends ItemLike> item, CreativeModeTab.TabVisibility visibility)`
- `accept(Supplier<? extends ItemLike> item)`（默认同时在标签页和搜索页可见）

## 横幅分区：`CreativeTabSection` 与 `CreativeTabSections`

要在单个创造模式标签页内部使用图形化横幅分割不同模组阶段或方块家族，可在 `CreativeTabBuilder#sectionedDisplayItems` 回调中配合 `CreativeTabSections` 与 `CreativeTabSection.builder(bannerTexture)`。

### 核心机制

1. 创造模式每行固定为 **9 列**（`CreativeTabSection.MAX_BANNER_LENGTH = 9`，`BANNER_CELL_SIZE = 18` 像素）。
2. 当某分区通过 `CreativeTabSections` 写入物品时，若横幅紧接在物品之后或起始位置未对齐行首，`CreativeTabSections` 会自动插入不可见占位符补全当前行，使横幅始终独占新行开头。
3. 超过横幅跨度的同一组物品在溢出到后续行时正常排版；横幅纹理本身会在客户端由 `CreativeTabSectionRenderListener` 与 `CreativeModeInventoryScreenMixin` 接管绘制，并在鼠标悬停到横幅区域时显示自定义的 `tooltip`。

### `CreativeTabSection.Builder` 全量配置项

| 方法 | 说明 | 默认值 / 约束 |
| --- | --- | --- |
| `CreativeTabSection.builder(Identifier bannerTexture)` | 从横幅纹理创建一个新分区构建器 | 必选，通常放在 `textures/gui/...png` |
| `bannerLength(int bannerLength)` | 横幅占据的槽位宽度（格数） | 默认 `3`（`MIN_BANNER_LENGTH = 1` ~ `MAX_BANNER_LENGTH = 9`） |
| `text(Component text)` | 横幅表面渲染的标题文字 | 默认 `Component.empty()` |
| `textBackgroundColor(int argb)` | 文字后方底衬条的 ARGB 颜色 | 设为 `0` 时不绘制文字背景 |
| `textAlignment(TextAlignment align)` | 文字水平对齐方式（`LEFT` / `CENTER` / `RIGHT`） | 默认左对齐 |
| `textRange(int textStart, int textEnd)` | 文字区域水平起止偏移量（像素） | 默认整幅内边距为 `2px` |
| `textIndent(int textStart)` / `textIndent(int textStart, int textEnd)` | 以缩进量设置起止位置，简化边距调整 | — |
| `textLeft(int)` / `textRight(int)` | 单独设置文字区域左边界或右边界（像素） | — |
| `tooltip(Component... tooltip)` / `tooltip(List<Component>)` | 鼠标悬停在横幅上时展示的多行提示文本 | 默认空列表 |
| `build()` | 返回不可变记录类 `CreativeTabSection` | — |

### `CreativeTabSections` 核心方法

- `add(CreativeTabSection section, Consumer<CreativeModeTab.Output> items)`：追加一个带横幅的物品分组。
- `addSection(CreativeTabSection section)` / `addDisplayItems(Consumer<CreativeModeTab.Output>)`：分别单独登记分区标题或组内物品流。
- `CreativeTabSections.of(ResourceKey<CreativeModeTab> tabKey)` / `findSection(CreativeModeTab tab, ItemStack stack)`：运行时内部查询工具，由屏幕混入和客户端渲染器用于定位给定页签对应的分组元数据。

## 创造模式分组变体选择器 (`CreativeVariantPicker`)

对于颜色变体或同种功能的多外观方块/物品（如 16 色方块、多种材质变体），你可以将完整变体组注册至 `CreativeVariantPickerRegistry`（或让自定义物品类实现 `CreativeVariantPickerItem`）。`CreativeVariantPickerRegistry` 会在初始化阶段先将 `PendingGroup` 放入队列，等到首次展开创造栏（世界注册表与默认组件绑定完成）时统一完成标准化解析并将同组 **2~16** 项折叠为第 1 项入口代表。

### `CreativeVariantPickerRegistry` 与 `CreativeVariantPickerItem` API

| API 签名 | 说明 |
| --- | --- |
| `CreativeVariantPickerItem#createCreativePickerVariants(ItemStack source)` | 让自定义物品实现接口直接返回 2~16 项变体 `List<ItemStack>`（优先级高于静态注册组） |
| `CreativeVariantPickerItem#isCreativePickerEnabled(ItemStack source)` | 根据客户端配置等条件决定当前是否折叠并启用选择器，默认返回 `true` |
| `CreativeVariantPickerRegistry.register(ItemLike... variants)` | 注册 2~16 个独立物品组成的变体组 |
| `CreativeVariantPickerRegistry.register(BooleanSupplier enabled, ItemLike... variants)` | 注册可由配置开关动态控制启用状态的独立物品变体组 |
| `CreativeVariantPickerRegistry.registerStacks(ItemStack... variants)` / `(Collection<ItemStack>)` | 注册包含特定组件差异的 `ItemStack` 变体组（同样受 2~16 项数量限制） |
| `CreativeVariantPickerRegistry.registerStacks(BooleanSupplier enabled, ItemStack... / Collection<ItemStack>)` | 带开关控制的 `ItemStack` 变体组注册 |
| `CreativeVariantPickerRegistry.setVanillaColorVariantPickerEnabled(BooleanSupplier enabled)` | 设置原版独立 16 色物品家族是否自动折叠进选择器（默认 `false`） |
| `CreativeVariantPickerRegistry.colorOrder()` | 返回叠加层排序所用的标准 16 色 `DyeColor` 序列 |
| `CreativeVariantPickerRegistry.createVariants(ItemStack)` / `isCreativePickerEnabled(ItemStack)` / `fold(Collection<ItemStack>)` | 查询物品变体、判断启用状态及对标签页内容执行折叠 |
| `CreativeVariantPickerOverlay` | 内置客户端 Overlay 渲染与交互控制器，悬停在带变体的槽位上时显示网格弹出层并处理选取切换 |
