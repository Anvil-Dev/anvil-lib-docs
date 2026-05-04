---
title: Wheel 轮盘
prev: false
next: false
---

# 轮盘菜单模块 (Wheel Module)

包 `dev.anvilcraft.lib.v2.wheel` 提供了一个高度可定制的**环形菜单（Radial Menu）**
系统，支持点按（Tap）和长按（Hold）两种打开模式、自定义扇形/圆点选中效果、子菜单以及自定义渲染器。

模型层（`api` 包）完全独立于渲染逻辑，可在服务端或逻辑层使用；客户端渲染层（`client` 包）通过自定义 GUI 渲染管道实现高效的环形
UI。

---

## 1. 模块概览

| 包                         | 职责                                                        |
|---------------------------|-----------------------------------------------------------|
| `api`                     | 轮盘菜单的数据模型，包含条目、页面、分页、打开模式及选中效果定义。                         |
| `client.gui.component`    | 核心控件 `WheelWidget`，处理鼠标交互、动画与渲染。                          |
| `client.gui.screen`       | `WheelScreen`，作为轮盘菜单的顶层屏幕，管理页面堆栈和模式触发。                    |
| `client.gui.render.state` | GUI 元素的渲染状态，为圆环、选中效果提供自定义着色器。                             |
| `client.init`             | 着色器管道、动态 Uniform 缓冲实现（`LibDynamicUniforms`、`LibRenders`）。 |
| `client.input`            | `WheelScreenController`，封装了点按和长按两种模式的输入处理。                |

**模块主类**：`AnvilLibWheel` – 负责初始化全局动态 Uniform 存储，并提供 `Identifier` 工具。

---

## 2. API 层 – 轮盘菜单模型

API 层所有类均位于 `dev.anvilcraft.lib.v2.wheel.api`，不依赖 Minecraft 客户端类，可安全在逻辑端使用。

### 2.1 核心实体

- **`WheelEntry`**：轮盘上的一个条目。可以是带动作的动作项，也可以是包含子条目的子菜单项。  
  通过静态工厂方法创建：`action(...)` / `submenu(...)`。  
  每个条目有唯一 ID、标签、可选渲染器、可选动作以及子菜单列表。

- **`WheelEntryAction`**：`@FunctionalInterface`，定义条目被触发时的执行逻辑，参数为 `WheelActionContext`（页面索引、槽位索引、条目
  ID、打开模式）。

- **`WheelEntryRenderer`**：可选，自定义在轮盘扇区内的渲染（替代默认文本/物品图标等）。

- **`WheelMenuModel`**：完整轮盘菜单模型，包含根条目列表、每页槽位数、死区半径、选中效果类型（`WheelSelectionEffect.DOT` 或
  `ANNULAR_SECTOR`）及颜色。  
  提供 `page(int)` 方法生成 `WheelPageModel`。

- **`WheelPageModel`**：单个页面的模型，记录页面索引和该页的 `slots`（固定数量，不足时自动填充 `placeholder` 占位符）。  
  `isSelectable(slotIndex, mode)` 可根据打开模式和条目类型判断槽位是否可选中。

- **`WheelPagination`**：静态工具，计算总页数 `pageCount(entryCount, slotsPerPage)`。

- **`WheelOpenMode`**：枚举，`TAP`（点按）和 `HOLD`（长按）。决定子菜单行为与触发逻辑。

- **`WheelSelectionEffect`**：枚举，`DOT`（圆点跟随光标）或 `ANNULAR_SECTOR`（扇形高亮整个扇区）。

### 2.2 构建器

**`WheelMenuBuilder`** 提供了流式 API：

```java
WheelMenuModel model = WheelMenuBuilder.create()
    .slotsPerPage(8)
    .selectionEffect(WheelSelectionEffect.ANNULAR_SECTOR)
    .action("id1", Component.literal("Action"), ctx -> { ... })
    .submenu("sub", Component.literal("Sub"), sub -> sub
        .action(...)
    )
    .build();
```

内部类 `WheelSubmenuBuilder` 用于构造子菜单（仅支持动作项，不支持嵌套子子菜单）。

---

## 3. 客户端渲染层

### 3.1 控件 `WheelWidget`

`WheelWidget`（`AbstractWidget` 子类）负责：

- **布局**：根据中心点、内外半径、每页槽位数计算每个扇区（`WheelSection`）的位置和检测角度。
- **交互**：
    - `checkMousePos()` 根据鼠标相对于中心的极坐标判断当前指向的扇区。
    - `mouseScrolled()` 在扇区之间循环切换选中。
    - 死区（`deadZone`）内不选中任何扇区。
- **动画**：打开时的弹性缩放动画、关闭时的反向动画。
- **自定义渲染**：
    - 圆环背景：通过 `RingRenderState` + 自定义 `RingUniform` 着色器渲染。
    - 选中效果：根据 `WheelSelectionEffect` 绘制圆点或环形扇区，使用对应的 `SelectionRenderState` 或
      `AnnularSectorRenderState`。
    - 条目渲染器 + 文本绘制。

### 3.2 `WheelScreen`

`WheelScreen` 是轮盘菜单的屏幕宿主：

- 持有 `WheelMenuModel` 和 `WheelOpenMode`。
- 使用 `Deque<List<WheelEntry>>` 管理菜单栈（支持子菜单压栈/回退）。
- 滚轮翻页（`mouseScrolled`）。
- **点按模式**：鼠标左键触发当前选中条目，若无选中则关闭屏幕；有子菜单时进入子菜单。
- **长按模式**：`triggerFromHoldRelease()` 由外部长按释放时调用，触发当前选中的动作项（忽略子菜单）。
- 关闭时调用 `WheelWidget.onClosing()` 播放关闭动画。

### 3.3 渲染管道与 Uniform 动态存储

轮盘菜单使用**自定义渲染管道** + **动态 Uniform 缓冲**，通过 `LibGuiElementRenderState` 接口向 GUI 渲染注入额外的 UBO 数据。

#### `LibRenders`

定义了四个渲染管道（均基于通用的 `SNIPPET_COMMON`）：

- `RING_PIPELINE`：使用 `RingUniform` 绘制抗锯齿圆环。
- `SELECTION_PIPELINE`：使用 `SelectionUniform` 绘制边缘柔和的圆点。
- `ANNULAR_SECTOR_PIPELINE`：使用 `AnnularSectorUniform` 绘制扇形高亮。

这些管道通过 `RingRenderState`、`SelectionRenderState`、`AnnularSectorRenderState`（均实现 `LibQuadGuiElementRenderState`
）提交给渲染器，自动绑定对应的 UBO。

#### `LibDynamicUniforms`

负责管理并复用帧内 Uniform Buffer，避免每帧大量 GPU 内存分配。提供：

- `writeRing(center, innerDiameter, outerDiameter, aa)`
- `writeSelection(framebufferSize, center, radius, aa)`
- `writeAnnularSector(...)`
- 每帧结束时调用 `reset()` 清除缓存。

内部使用 `DynamicUniformStorage` 搭配三个数据类（`RingUniform`、`SelectionUniform`、`AnnularSectorUniform`），按 STD140 布局写入。

全局单例通过 `AnvilLibWheel.getLibDynamicUniforms()` 获取，在 `ConfigureMainRenderTargetEvent` 时初始化。

---

## 4. 输入控制

### `WheelScreenController`

封装了点按与长按两种模式的输入逻辑，避免在 tick 事件中直接操作导致重复打开。

- `openTap(WheelMenuModel)`：直接打开点按屏幕。
- `onHoldKeyPressed(WheelMenuModel)`：按下对应键时打开长按屏幕（若已存在则忽略）。
- `onHoldKeyReleased()`：松开键时调用 `WheelScreen.triggerFromHoldRelease()` 触发当前选项，并关闭屏幕。

**推荐用法**：在按键事件中监听长短按，调用控制器对应方法。

---

## 5. 测试与示例

`dev.anvilcraft.lib.v2.test.wheel` 包提供了完整的可运行示例，用于验证不同模式下轮盘菜单的行为。

- **`WheelTestKeys`**：注册四个按键（点按/长按 + 圆点/扇形效果），可通过键位绑定控制。
- **`WheelTestClientHandler`**：在 `ClientTickEvent.Pre` 处理点按触发，在 `InputEvent.Key` 处理长按的按下与释放边沿。
- **`WheelDemoMenus`**：提供两个演示菜单构建方法 `buildTapDemo` / `buildHoldDemo`，展示动作项、子菜单、自定义渲染器（渲染苹果物品）。

运行测试前需确保对应模组 `anvillib_test` 已加载并绑定按键。

---

## 6. 扩展指南

- **自定义渲染器**：实现 `WheelEntryRenderer` 并传入 `action` 或 `submenu` 的重载方法，可在扇区中绘制任意 GUI 元素。
- **自定义选中效果**：`WheelSelectionEffect` 目前仅支持两种枚举。若需新效果，可扩展枚举并添加对应的渲染管道、RenderState 和
  Uniform 类型。
- **动态样式**：通过 `WheelMenuBuilder.selectionEffectColor()` 等可调整颜色；`WheelWidget` 的构造参数支持更细致的动画时长、颜色、字体缩放。
- **与服务端交互**：`WheelEntryAction` 可通过 `WheelActionContext` 获取页面与槽位信息，结合 `PacketDistributor` 发送网络包执行逻辑。

---

## 注意事项

1. **客户端专用**：模块中所有 `client` 包下的类仅能在物理客户端调用，不要存储在服务端逻辑中。
2. **性能**：动态 Uniform 使用帧内缓存，渲染大量轮盘菜单时保持高效；避免在单帧内过于频繁地重建 `WheelWidget`。
3. **兼容性**：`GlobalRendererMixin`（来自渲染模块）已支持通过 `LibGuiElementRenderState` 注入自定义 UBO，确保该 Mixin
   存在方可正常显示自定义管道。
4. **子菜单深度**：当前 `WheelMenuBuilder.WheelSubmenuBuilder` 仅支持一层子菜单，嵌套子菜单需自行扩展 `WheelEntry` 模型。
5. **打开模式**：长按模式下子菜单不可被触发（`WheelEntry.isSelectable` 限制），符合常规交互习惯。