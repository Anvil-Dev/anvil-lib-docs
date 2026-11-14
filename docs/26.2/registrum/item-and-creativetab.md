# 物品、创造模式标签页与分组变体选择器 (`ItemBuilder` / `CreativeTabBuilder` / `CreativeVariantPicker`)

<BranchContextCard branch="26.2" />

本篇介绍 `module.registrum` 中与物品及创造模式物品栏相关的三大子系统：
1. **`ItemBuilder` 与 `ItemEntry`**：链式构建物品、配置属性、生成模型/配方/标签/燃料与堆肥 DataMap；
2. **`CreativeTabBuilder` 与分节横幅系统 (`CreativeTabSections` / `CreativeTabSection`)**：在创造模式物品栏中插入跨多格的自定义图文分类横幅（Banner），自动按 9 列网格换行对齐；
3. **创造物品栏 4×4 变体选择器系统 (`CreativeVariantPickerRegistry` / `CreativeVariantPickerItem` / `CreativeVariantPickerOverlay`)**：将同一系列的最多 16 种颜色或状态变体折叠为单个代表物品格，当鼠标指向该格时在上方弹出 `4×4` 变体选择面板。

---

## 一、 `ItemBuilder` 详解与用法

### 1. 默认行为與 DataMap 快捷配置

当你调用 `REGISTRUM.item("my_item", Item::new)` 时，`ItemBuilder.create` 会自动启用：
- **`defaultModel()`**：生成标准平面物品模型（`prov.generateFlatItem(ctx.get(), ModelTemplates.FLAT_ITEM)`，对应贴图 `assets/<modid>/textures/item/<name>.png`）；
- **`defaultLang()`**：根据注册名自动生成英文翻译（如 `"my_item"` → `"My Item"`）；
- **默认创造模式标签页**：自动加入 `REGISTRUM` 当前设置的 `defaultCreativeModeTab`（若不想加入某个标签页可调用 `.removeTab(tabKey)`）。
- **内置 DataMap 快捷方法**：直接调用 `.burnTime(int ticks)` 即可生成 `NeoForgeDataMaps.FURNACE_FUELS` 熔炉燃料数据；调用 `.compostable(float chance)` 即可生成 `NeoForgeDataMaps.COMPOSTABLES` 堆肥桶概率数据。

### 2. 代码示例：注册燃料/可堆肥物品与自定义模型物品

```java
package com.example.mymod.init;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.registrum.util.entry.ItemEntry;
import net.minecraft.client.data.models.model.ModelTemplates;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;

public final class ModItems {
    // 示例 1：既是燃料（燃烧 1600 tick）又可堆肥（65% 概率）的松果物品
    public static final ItemEntry<Item> PINECONE = MyMod.REGISTRUM
        .item("pinecone", Item::new)
        .properties(p -> p.stacksTo(64))
        .burnTime(1600)
        .compostable(0.65f)
        .tag(ItemTags.COALS)
        .lang("Pinecone")
        .register();

    // 示例 2：使用手持工具模型（HANDHELD_ITEM）的锻造锤
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

## 二、 创造模式标签页与分节横幅 (`CreativeTabBuilder` / `CreativeTabSections`)

### 1. 要解决什么问题 / 怎么用

当模组物品较多时，把几百个物品平铺在同一个创造模式标签页里会让玩家难以查找；而拆成五六个创造标签页又会挤占顶栏空间。

`CreativeTabBuilder#sectionedDisplayItems(Consumer<CreativeTabSections>)` 允许你在单个创造标签页内划分多个带横幅背景图、文字标题、背景色和悬停 Tooltip 的**分节（`CreativeTabSection`）**：
- 每个 `CreativeTabSection` 横跨 `1 ~ 9` 个物品栏格子（`bannerLength`，默认 `3` 格，每格 `18px` 宽）；
- 在 `CreativeTabSections.arrange` 排版时，如果上一节末尾不满一整行（9 列），会自动填充空占位格使新分节从下一行行首开始，并在横幅所在位置预留 `bannerLength` 个空槽位，由 `CreativeTabSectionRenderListener` 在客户端直接绘制横幅纹理、对齐文字与悬停提示框，同时自动隐藏被横幅覆盖的空槽位高亮。

### 2. 完整代码示例：构建带图文分节横幅的创造模式标签页

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
            // 第一节：工具与武器（横跨 3 格 = 54px 宽，左侧预留 20px 图标装饰区）
            CreativeTabSection toolsHeader = CreativeTabSection.builder(BANNER_TEX)
                .bannerLength(3)
                .text(Component.translatable("itemGroup.my_mod.section.tools"))
                .textAlignment(CreativeTabSection.TextAlignment.LEFT)
                .textRange(20, 52)
                .tooltip(Component.literal("锻造与加工工具"))
                .build();

            sections.section(toolsHeader, out -> {
                out.accept(ModItems.FORGING_HAMMER);
                out.accept(ModItems.PINECONE);
            });

            // 第二节：机器与矿石
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
        // 将该标签页设为后续物品的默认标签页
        MyMod.REGISTRUM.defaultCreativeTab(MAIN_TAB);
    }
}
```

---

## 三、 创造物品栏 4×4 变体选择器 (`CreativeVariantPickerRegistry` / `CreativeVariantPickerItem`)

### 1. 要解决什么问题 / 怎么用

当模组拥有 16 色染色方块/物品，或同一物品具有多种预设组件变体（最多 16 种）时，全部展开会占满近两行创造物品栏。`module.registrum` 提供两种方式将它们折叠为**单个代表物品格**，并在玩家鼠标悬停该槽位时弹出 `CreativeVariantPickerOverlay`（`4×4` 网格面板，支持左键/中键/Shift 点击与快捷键直接拿取对应变体）：

- **方式 A（独立注册的多个物品/物品栈变体组）**：
  调用 `CreativeVariantPickerRegistry.register(ItemLike... variants)` 或 `registerStacks(ItemStack... variants)`（数量必须在 `2 ~ 16` 之间，可传入 `BooleanSupplier` 绑定客户端配置开关）。当创造标签页启用了变体折叠时，`CreativeVariantPickerRegistry.fold(items)` 会自动将整组物品折叠为第 1 项代表物品。
  此外，调用 `CreativeVariantPickerRegistry.setVanillaColorVariantPickerEnabled(() -> true)` 还可一键开启对原版 `minecraft` 命名空间下所有标准 16 色物品族（羊毛、混凝土、玻璃、陶瓦等）的自动识别与折叠。
- **方式 B（单个 `Item` 类通过组件区分变体）**：
  让你的自定义 `Item` 类实现 `dev.anvilcraft.lib.v2.registrum.util.CreativeVariantPickerItem` 接口，重写 `createCreativePickerVariants(ItemStack source)` 返回 `2 ~ 16` 个变体 `ItemStack`。

### 2. 代码示例：注册 16 色变体组与实现 `CreativeVariantPickerItem`

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

// 方式 B：单个物品类实现 CreativeVariantPickerItem，按稳定 16 色顺序生成变体
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

## 四、 公开类与接口 API 详解

### 1. `ItemBuilder<T, P>`、`ItemEntry<T>` 与 `ItemProviderEntry<R, T>`

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `ItemBuilder<T, P>` | • `properties(NonNullUnaryOperator<Item.Properties>)`<br>• `initialProperties(NonNullSupplier<Item.Properties>)`<br>• `tab(ResourceKey<CreativeModeTab>)` / `tab(ResourceKey<CreativeModeTab>, NonNullBiConsumer<DataGenContext<Item, T>, CreativeModeTabModifier>)` / `removeTab(ResourceKey<CreativeModeTab>)`<br>• `defaultModel()` / `model(NonNullSupplier<NonNullBiConsumer<DataGenContext<Item, T>, RegistrumItemModelGenerator>>)`<br>• `defaultLang()` / `lang(String name)`<br>• `recipe(NonNullBiConsumer<DataGenContext<Item, T>, RegistrumRecipeProvider>)`<br>• `burnTime(int tick)` / `compostable(float chance)`<br>• `clientExtension(NonNullSupplier<Supplier<IClientItemExtensions>>)`<br>• `tag(TagKey<Item>... tags)`<br>• `ItemEntry<T> register()` | 物品构建器。在 `createEntry()` 中自动调用 `properties.setId(getResourceKey())`。 |
| `ItemProviderEntry<R, T>` | • `ItemStack asStack()` / `ItemStack asStack(int count)`<br>• `boolean isIn(ItemStack stack)` / `boolean is(Item item)`<br>• `Item asItem()` | `BlockEntry` 与 `ItemEntry` 的共同父类，实现 `ItemLike`。 |
| `ItemEntry<T>` | `public static <T extends Item> ItemEntry<T> cast(RegistryEntry<Item, T> entry)` | 物品注册项包装类。 |

### 2. `CreativeTabBuilder<P>` 与 `CreativeModeTabModifier`

| 类名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `CreativeTabBuilder<P>` | • `defaultTitle()` / `title(Component)` / `icon(Supplier<ItemStack>)`<br>• `displayItems(DisplayItemsGenerator)` / `displayItems(Collection<? extends Holder<? extends ItemLike>>)` / `displayItems(ItemLike...)`<br>• `sectionedDisplayItems(Consumer<CreativeTabSections>)`<br>• `alignedRight()` / `hideTitle()` / `noScrollBar()`<br>• `backgroundTexture(Identifier)` / `withSearchBar()` / `withSearchBar(int width)`<br>• `withScrollBarSpriteLocation(Identifier)` / `withTabsImage(Identifier)`<br>• `withLabelColor(int)` / `withTabFactory(Function<...>)`<br>• `withTabsBefore(...)` / `withTabsAfter(...)`（支持 `Identifier...`、`DeferredHolder...`、`ResourceKey...`） | 创造模式标签页构建器。 |
| `CreativeModeTabModifier` | `getFlags()` / `getParameters()` / `hasPermissions()` / `accept(ItemStack, TabVisibility)` / `accept(Supplier<? extends ItemLike>, ...)` | 实现 `CreativeModeTab.Output`，在 `BuildCreativeModeTabContentsEvent` 中向标签页追加物品。 |

### 3. `CreativeTabSection` 与 `CreativeTabSections`（分节横幅系统）

| 类名 | 关键常量 / 方法签名 | 说明与校验条件 |
| :--- | :--- | :--- |
| `CreativeTabSection` | • `MIN_BANNER_LENGTH = 1`、`MAX_BANNER_LENGTH = 9`、`DEFAULT_BANNER_LENGTH = 3`、`BANNER_CELL_SIZE = 18`、`DEFAULT_TEXT_PADDING = 2`<br>• `public static Builder builder(Identifier bannerTexture)`<br>• `hasDefaultTextRange()` / `textWidth()` / `textLeft()` / `textRight()`<br>• `enum TextAlignment { LEFT, CENTER, RIGHT }` | 描述单个分节横幅的不可变记录。<br>**校验条件**：`bannerLength` 必须在 `[1, 9]` 之间；文字左右像素边界需满足 `0 <= textStart < textEnd <= bannerLength * 18`，否则抛出 `IllegalArgumentException`。 |
| `CreativeTabSection.Builder` | `bannerLength(int)`、`text(Component)`、`textBackgroundColor(int)`、`textAlignment(TextAlignment)`、`textRange(int start, int end)`、`textIndent(int start)`、`textIndent(int start, int end)`、`textLeft(int)`、`textRight(int)`、`tooltip(Component... / List<Component>)`、`build()` | 链式构建 `CreativeTabSection`。 |
| `CreativeTabSections` | • `public static void build(Identifier tabId, ItemDisplayParameters parameters, Output output, Consumer<CreativeTabSections> contents)`<br>• `public void section(CreativeTabSection section, Consumer<CreativeTabSections> contents)`<br>• `public static Collection<ItemStack> arrange(Identifier tabId, Collection<ItemStack> items, boolean foldVariants)`<br>• `public static boolean hasSections(Identifier tabId)`<br>• `public static List<PlacedSection> placedSections(Identifier tabId)` | 收集分节边界并在客户端按 9 列网格排列物品与横幅占位格（按分节边界独立执行 `foldVariants`，防止前一个分节折叠变体缩短后吞掉后续分节的横幅位置）。 |

### 4. `CreativeVariantPickerRegistry`、`CreativeVariantPickerItem` 与 `CreativeVariantPickerOverlay`

| 类 / 接口名 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `CreativeVariantPickerItem` | • `List<ItemStack> createCreativePickerVariants(ItemStack source)`<br>• `default boolean isCreativePickerEnabled(ItemStack source)` | 物品可实现此接口，为创造物品栏提供最多 16 个变体 `ItemStack`（少于 2 个有效非空栈时忽略）。 |
| `CreativeVariantPickerRegistry` | • `public static List<DyeColor> colorOrder()`<br>• `public static void setVanillaColorVariantPickerEnabled(BooleanSupplier enabled)`<br>• `public static void register(ItemLike... variants)` / `register(BooleanSupplier, ItemLike...)`<br>• `public static void registerStacks(ItemStack... variants)` / `registerStacks(BooleanSupplier, ItemStack...)` / `registerStacks(Collection<ItemStack>)` / `registerStacks(BooleanSupplier, Collection<ItemStack>)`<br>• `public static Optional<List<ItemStack>> createVariants(ItemStack source)`<br>• `public static boolean isCreativePickerEnabled(ItemStack source)`<br>• `public static Collection<ItemStack> fold(Collection<ItemStack> items)` | 创造模式变体组注册表。`register(ItemLike...)` 会将物品延迟到世界注册表默认组件绑定后再实例化 `ItemStack`；`registerStacks` 要求非空变体数量在 `[2, 16]` 之间，否则抛出 `IllegalArgumentException`。 |
| `CreativeVariantPickerOverlay` | • `public static Optional<CreativeVariantPickerOverlay> create(Slot sourceSlot)`<br>• `isValid()` / `sourceSlot()` / `contains(int guiLeft, int guiTop, double mouseX, double mouseY)`<br>• `Optional<ItemStack> variantAt(int guiLeft, int guiTop, double mouseX, double mouseY)`<br>• `render(...)` / `renderTooltip(...)` | 客户端创造模式物品栏 `4×4` 变体选择叠加层组件（由 `CreativeModeInventoryScreenMixin` 自动驱动）。当窗口上方空间不足时会自动翻转到槽位下方渲染。 |
