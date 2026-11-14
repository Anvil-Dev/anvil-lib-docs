# 物品、创造模式物品栏与变体选择器

本节涵盖 `ItemBuilder`、`CreativeTabBuilder`、基于 `CreativeTabSections` / `CreativeTabSection` 的带横幅分区创造栏，以及可在创造物品栏格位上方弹出 4x4 选择面板的 `CreativeVariantPickerRegistry` / `CreativeVariantPickerItem` 机制。

## 物品构建器 (`ItemBuilder`)

通过 `REGISTRUM.item(name, factory)`、`.object(name).item(factory)`，或在 `BlockBuilder` 中调用 `.item(...)` 进入 `ItemBuilder<T, P>`。独立创建时默认携带：

- `defaultModel()`：调用 `RegistrumItemModelProvider#generated`，生成使用 `textures/item/<name>.png`、`parent = "item/generated"` 的物品模型。
- `defaultLang()`：由内部名自动派生首字母大写英文及倒置英文翻译条目（通过 `BlockBuilder.item(...)` 创建时会被设为无操作以避免覆写方块名称）。

### 核心方法一览

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `initialProperties(NonNullSupplier<Item.Properties> properties)` | `ItemBuilder<T, P>` | 替换初始 `Item.Properties` 提供器，已有的 `properties(...)` 修改链仍会在新初值上依次执行 |
| `properties(NonNullUnaryOperator<Item.Properties> func)` | `ItemBuilder<T, P>` | 追加懒加载属性修饰器（如 `.stacksTo(16)`、`.fireResistant()`、`.component(...)`） |
| `tab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | 使用默认 `ItemStack` 将此物品加入指定创造标签页（可重复对不同标签页调用；同键多次调用会替换） |
| `tab(ResourceKey<CreativeModeTab> tab, NonNullBiConsumer<DataGenContext<Item, T>, CreativeModeTabModifier> modifier)` | `ItemBuilder<T, P>` | 自定义入栏逻辑（如注入多份带不同 `DataComponent` 的 `ItemStack` 或设置 `TabVisibility`）。注：仅接收 `Consumer<CreativeModeTabModifier>` 的重载已标记 `@Deprecated` |
| `removeTab(ResourceKey<CreativeModeTab> tab)` | `ItemBuilder<T, P>` | 移除先前（例如通过全局 `defaultCreativeTab`）附加的目标创造栏映射 |
| `burnTime(int tick)` | `ItemBuilder<T, P>` | 向 `NeoForgeDataMaps.FURNACE_FUELS` DataMap 注册该物品的熔炉燃烧时间（单位：Tick） |
| `compostable(float chance)` | `ItemBuilder<T, P>` | 向 `NeoForgeDataMaps.COMPOSTABLES` DataMap 注册堆肥箱增加一级的概率（`0.0f`–`1.0f`） |
| `color(NonNullSupplier<Supplier<ItemColor>> colorHandler)` | `ItemBuilder<T, P>` | 在 `Dist.CLIENT` 通过 `RegisterColorHandlersEvent.Item` 注册物品动态着色回调 |
| `clientExtension(NonNullSupplier<Supplier<IClientItemExtensions>> clientExtension)` | `ItemBuilder<T, P>` | 注册 NeoForge 客户端物品扩展（自定义第一/三人称手持渲染、`BlockEntityWithoutLevelRenderer` 等）；带 `Function<T, ...>` 参数的重载已标记 `@Deprecated(forRemoval = true)` |
| `defaultModel()` / `model(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumItemModelProvider> cons)` | `ItemBuilder<T, P>` | 配置或重置物品模型生成器 |
| `defaultLang()` / `lang(String name)` | `ItemBuilder<T, P>` | 配置或重置翻译名称（基于 `Item::getDescriptionId`） |
| `recipe(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumRecipeProvider> cons)` | `ItemBuilder<T, P>` | 为物品生成合成/熔炼/切石配方数据 |
| `tag(TagKey<Item>... tags)` | `ItemBuilder<T, P>` | 为物品添加物品标签（委托给 `ProviderType.ITEM_TAGS`） |
| `register()` | `ItemEntry<T>` | 提交注册并返回 `ItemEntry<T>`（继承 `ItemProviderEntry<Item, T>`） |

::: tip `BlockBuilder` 联动提示
在 `ItemBuilder` 中添加的所有 `tab(...)` 会在该物品实际在 `RegisterEvent` 完成注册时才调用 `owner.modifyCreativeModeTab(...)` 并立即 `clear()`，避免重复触发。若想在 `defaultCreativeTab` 之外把方块物品放到其他分页，推荐写法为 `.item().removeTab(...).tab(...).build()`。
:::

## 创造模式物品栏 (`CreativeTabBuilder` 与 `CreativeModeTabModifier`)

### `CreativeTabBuilder<P>`

通过 `REGISTRUM.defaultCreativeTab(name, icon)`（底层由 `CreativeTabBuilder.create(...)` 创建，且返回前先调用 `.icon(...)` 与 `.defaultTitle()`，生成 `itemGroup.<modid>.<name>` 翻译键）或 `REGISTRUM.creativeTab(name)` 获取 `CreativeTabBuilder`。注册结果为 `RegistryEntry<CreativeModeTab, CreativeModeTab>`。

可用链式配置方法包括：

- `defaultTitle()` / `title(Component displayName)`
- `icon(Supplier<ItemStack> iconGenerator)`
- `displayItems(CreativeModeTab.DisplayItemsGenerator displayItemsGenerator)`
- `displayItems(Collection<? extends Holder<? extends ItemLike>> collection)` / `displayItems(ItemLike... itemLikes)`
- `sectionedDisplayItems(Consumer<CreativeTabSections> displayItems)`：启用分组横幅排版（详见下文）
- 布局与视觉方法：`alignedRight()`、`hideTitle()`、`noScrollBar()`、`backgroundTexture(ResourceLocation)`、`withSearchBar()`、`withSearchBar(int searchBarWidth)`、`withScrollBarSpriteLocation(ResourceLocation)`、`withTabsImage(ResourceLocation)`、`withLabelColor(int labelColor)`、`withTabFactory(Function<CreativeModeTab.Builder, CreativeModeTab>)`
- 标签页排序方法：`withTabsBefore(...)` 与 `withTabsAfter(...)`（均分别支持 `ResourceLocation...`、`ResourceKey<CreativeModeTab>...` 与 `DeferredHolder<CreativeModeTab, CreativeModeTab>...` 三种重载）。

### `CreativeModeTabModifier`

当物品通过 `.tab(tabKey, (ctx, modifier) -> ...)` 或 `REGISTRUM.modifyCreativeModeTab(...)` 追加到创造栏时，接收的 `CreativeModeTabModifier` 实现了原版 `CreativeModeTab.Output` 接口，并额外提供：

- `getFlags()` -> `FeatureFlagSet`：获取当前世界已启用的特性集（如试验性开关）。
- `getParameters()` -> `CreativeModeTab.ItemDisplayParameters`：获取完整显示上下文参数。
- `hasPermissions()` -> `boolean`：判断当前玩家是否具有创造栏编辑权限（决定命令方块、调试棒等权限物品是否展示）。
- `accept(ItemStack stack, CreativeModeTab.TabVisibility visibility)` / `accept(Supplier<? extends ItemLike> item)` / `accept(Supplier<? extends ItemLike> item, CreativeModeTab.TabVisibility visibility)`。

## 分区横幅创造栏 (`CreativeTabSections` & `CreativeTabSection`)

当单个模组创造标签页内物品较多时，Registrum 附带了一套客户端 Mixin 渲染管线（`CreativeModeTabMixin` + `CreativeModeInventoryScreenMixin` + `CreativeTabSectionRenderListener`），允许在创造标签网格内整行对齐插入“横幅分区标题”，并支持文本排版、背景底色与鼠标悬停 Tooltip。

### 分区数据模型：`CreativeTabSection`

`CreativeTabSection` 是一个不可变 `record`，包含以下属性及约束规则：

- `bannerLength`（`1`–`9` 格，默认 `DEFAULT_BANNER_LENGTH = 3`）：横幅在 9 列创造物品格中所占宽度（每格 `BANNER_CELL_SIZE = 18` 像素，非法长度抛出 `IllegalArgumentException`）。
- `bannerTexture`：渲染在格位上的横幅纹理 `ResourceLocation`。
- `text`：标题文本 `Component`（默认 `Component.empty()`）。
- `textBackgroundColor`：文字区域背景颜色 ARGB（默认 `0x00000000` 全透明）。
- `tooltip`：`List<Component>`，鼠标停留在横幅上时显示的提示文本列表。
- `textAlignment`：`CreativeTabSection.TextAlignment` 枚举（`LEFT` / `CENTER` / `RIGHT`，默认 `CENTER`）。
- `textStart` / `textEnd`：文字绘制区域相对横幅左边缘的左闭右开像素范围（默认左右各留 `DEFAULT_TEXT_PADDING = 2` 像素边距；超出 `[0, bannerLength * 18]` 会抛出 `IllegalArgumentException`）。

可通过 `CreativeTabSection.builder(ResourceLocation bannerTexture)` 流畅构造，Builder 支持：
- `bannerLength(int)`
- `text(Component)`
- `textBackgroundColor(int)`
- `textAlignment(TextAlignment)`
- `textRange(int textStart, int textEnd)` / `textIndent(int textStart)` / `textIndent(int textStart, int textEnd)` / `textLeft(int)` / `textRight(int)`
- `tooltip(Component...)` / `tooltip(List<Component>)`
- `build()`

额外实例辅助查询方法：`hasDefaultTextRange()`、`textWidth()`、`textLeft()`、`textRight()`。

### 输出排列器：`CreativeTabSections`

`CreativeTabSections` 实现了 `CreativeModeTab.Output`。当在 `CreativeTabBuilder` 上调用 `.sectionedDisplayItems(sections -> ...)` 后，在回调中使用 `sections.section(section, subOutput -> ...)` 分组输出物品；不属于任何分区的全局物品也可以直接在 `sections.accept(...)` 中添加。

渲染与排版机制说明：
1. 若某一个分区的实际有效可见物品数为 0（比如全部被当前 `FeatureFlagSet` 禁用或仅在 `SEARCH_TAB_ONLY` 可见），Registrum 不会为其保留空横幅。
2. 当分区含有效物品时，系统会在该分区第一个物品之前先填充 `ItemStack.EMPTY` 使游标对齐至下一行第 0 列，随后插入 `bannerLength` 个占位空格并记录横幅布局坐标 `PlacedSection`。

## 创造栏 4x4 变体折叠选择器

对于拥有 2 至 16 个高度近似的变体（例如原版 16 色方块、模块化的各种颜色涂装工具），可以将其折叠为创造栏里的**单个代表物品格**。玩家鼠标悬停于该代表格或进行选取操作时，将在该格位正上方弹出最多 `4x4`（16 个槽位）的 `CreativeVariantPickerOverlay` 选择窗。

接入该能力有两种途径：

### 方式一：物品实现 `CreativeVariantPickerItem` 接口

让自定义 `Item` 实现 `CreativeVariantPickerItem`（优先级高于注册表声明）：

- `List<ItemStack> createCreativePickerVariants(ItemStack source)`：按从左到右、从上到下返回最多 16 个可选变体栈。
- `default boolean isCreativePickerEnabled(ItemStack source)`：可根据客户端配置实时决定是否折叠显示叠加层（默认返回 `true`）。

### 方式二：向 `CreativeVariantPickerRegistry` 显式注册独立物品组

对于未持有共同类或原版风格的多物品家族，使用 `CreativeVariantPickerRegistry` 声明变体组：

| 方法签名 | 说明 |
| :--- | :--- |
| `colorOrder()` | 返回内置 16 种 `DyeColor` 标准排列顺序（按常见原版/装饰色阶排序） |
| `setVanillaColorVariantPickerEnabled(BooleanSupplier enabled)` | 控制是否自动扫描并折叠原版 Minecraft 命名空间下具有完整 16 色前缀家族（`<color>_*`）的物品（默认关闭 `() -> false`，通常绑定客户端配置文件） |
| `register(ItemLike... variants)` / `register(BooleanSupplier enabled, ItemLike... variants)` | 注册 2 到 16 个独立物品组成的变体组（首项作为代表项显示在创造栏），可附带配置开关谓词 |
| `registerStacks(...)` | 提供 `ItemStack...` / `Collection<ItemStack>` + 可选 `BooleanSupplier enabled` 多种重载，适合以不同组件区分的堆叠；条目数量不在 `[2, 16]` 时抛出 `IllegalArgumentException` |
| `createVariants(ItemStack source)` / `isCreativePickerEnabled(ItemStack source)` | 内部及 UI 校验辅助方法 |
| `fold(Collection<ItemStack> items)` | 由创造栏内容整合阶段调用，将完整出现在标签页内的启用组折叠为其第一项 |

## 完整实用示例：分区创造栏与自定义变体产品组

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

    // 批量注册 16 色装饰物品并使用 CreativeVariantPickerRegistry 折叠
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
        // 注册 16 色金属板作为单个创造栏折叠变体组
        CreativeVariantPickerRegistry.register(COLORED_PLATES);
    }
}
```
