---
title: Wheel API 模型层
prev: false
next: false
---

# API 模型层

API 层所有类位于 `dev.anvilcraft.lib.v2.wheel.api`，不依赖 Minecraft 客户端类，可安全在逻辑端使用。

## WheelEntry

轮盘上的一个条目，可以是动作项或子菜单项。

```java
// 动作项：被选中时执行动作
WheelEntry actionEntry = WheelEntry.action(
    "entry_id",
    Component.literal("My Action"),
    ctx -> { /* 处理逻辑 */ }
);

// 子菜单项：展开子菜单（子项仅支持 action）
WheelEntry submenuEntry = WheelEntry.submenu(
    "sub_id",
    Component.literal("Sub Menu"),
    List.of(
        WheelEntry.action("sub_1", Component.literal("Option 1"), ctx -> {}),
        WheelEntry.action("sub_2", Component.literal("Option 2"), ctx -> {})
    )
);
```

每个条目有唯一 ID、标签、可选渲染器（`WheelEntryRenderer`）、可选动作以及子菜单列表。

## WheelEntryAction

函数式接口，定义条目被触发时的执行逻辑。

```java
@FunctionalInterface
public interface WheelEntryAction {
    void execute(WheelActionContext ctx);
}
```

### WheelActionContext

| 字段          | 说明               |
|-------------|------------------|
| `pageIndex` | 当前页面索引           |
| `slotIndex` | 当前槽位索引           |
| `entryId`   | 条目唯一标识           |
| `openMode`  | 打开模式（TAP / HOLD） |

## WheelEntryRenderer

可选接口，自定义在轮盘扇区内的渲染（替代默认文本/物品图标等）。

```java
@FunctionalInterface
public interface WheelEntryRenderer {
    void render(GuiGraphics graphics, WheelEntry entry, float x, float y, float radius);
}
```

## WheelMenuModel

完整轮盘菜单模型。

```java
WheelMenuModel model = new WheelMenuModel(
    rootEntries,               // 根条目列表
    slotsPerPage,              // 每页槽位数
    deadZoneRadius,            // 死区半径（内不选中任何扇区）
    selectionEffect,           // 选中效果：DOT 或 ANNULAR_SECTOR
    selectionColor             // 选中效果颜色
);
```

| 方法                | 说明                      |
|-------------------|-------------------------|
| `page(int index)` | 生成指定页的 `WheelPageModel` |

## WheelPageModel

单个页面的模型。

```java
WheelPageModel page = model.page(0);

// 判断槽位是否可选中（长按模式下子菜单不可选择）
boolean selectable = page.isSelectable(slotIndex, openMode);
```

页面包含固定数量的 `slots`，不足时自动填充占位符。

## WheelPagination

静态工具，计算总页数。

```java
int totalPages = WheelPagination.pageCount(totalEntries, slotsPerPage);
```

## 枚举类型

### WheelOpenMode

| 值      | 说明                     |
|--------|------------------------|
| `TAP`  | 点按模式：点击触发当前选中条目，子菜单可进入 |
| `HOLD` | 长按模式：释放时触发动作项，子菜单不可被触发 |

### WheelSelectionEffect <Badge type="tip" text=">=26.1" />

| 值                | 说明       |
|------------------|----------|
| `DOT`            | 圆点跟随光标   |
| `ANNULAR_SECTOR` | 扇形高亮整个扇区 |

## WheelMenuBuilder

流式 API 构建器：

```java
WheelMenuModel model = WheelMenuBuilder.create()
    .slotsPerPage(8)
    .deadZone(20.0f)
    .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
    .selectionColor(0xFF4080FF)
    .action("id1", Component.literal("Action 1"), ctx -> {
        // 执行动作
    })
    .action("id2", Component.literal("Action 2"), ctx -> {
        // 自定义渲染器
    })
    .renderer(myCustomRenderer)
    .submenu("sub1", Component.literal("Sub Menu"), sub -> sub
        .action("sub_a", Component.literal("Sub Option A"), ctx -> {})
        .action("sub_b", Component.literal("Sub Option B"), ctx -> {})
    )
    .build();
```

| 方法                                                                   | 说明                  |
|----------------------------------------------------------------------|---------------------|
| `slotsPerPage(int)`                                                  | 每页槽位数               |
| `deadZone(float)`                                                    | 死区半径（像素）            |
| `selectionEffect(WheelSelectionEffect)`                              | 选中效果类型              |
| `selectionColor(int)`                                                | 选中效果颜色（ARGB）        |
| `action(String id, Component label, WheelEntryAction)`               | 添加动作项               |
| `submenu(String id, Component label, Consumer<WheelSubmenuBuilder>)` | 添加子菜单               |
| `build()`                                                            | 构建 `WheelMenuModel` |

### 注意事项

- `WheelSubmenuBuilder` 仅支持动作项，不支持嵌套子菜单
- API 层模型可安全传输到服务端（如用于验证或权限检查）
