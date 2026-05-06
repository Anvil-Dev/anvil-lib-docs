---
title: Wheel 客户端渲染
prev: false
next: false
---

# 客户端渲染

## WheelWidget

`AbstractWidget` 子类，核心控件，负责扇区计算、交互和渲染。

### 布局

根据中心点、内外半径、每页槽位数计算每个扇区（`WheelSection`）的位置和检测角度。

### 交互

| 方法                | 说明                     |
|-------------------|------------------------|
| `checkMousePos()` | 根据鼠标相对于中心的极坐标判断当前指向的扇区 |
| `mouseScrolled()` | 扇区间循环切换选中              |
| `onClosing()`     | 播放关闭动画                 |

死区（`deadZone`）内不选中任何扇区。

### 动画

- 打开时弹性缩放动画
- 关闭时反向动画

### 自定义渲染

- 圆环背景：`RingRenderState` + 自定义 `RingUniform` 着色器
- 选中圆点：`SelectionRenderState`（`WheelSelectionEffect.DOT`）
- 扇形高亮：`AnnularSectorRenderState`（`WheelSelectionEffect.ANNULAR_SECTOR`）
- 条目渲染器 + 文本绘制

## WheelScreen

轮盘菜单的屏幕宿主，管理页面堆栈和模式触发。

### 核心字段

| 字段                                  | 说明              |
|-------------------------------------|-----------------|
| `WheelMenuModel model`              | 轮盘菜单模型          |
| `WheelOpenMode mode`                | 打开模式            |
| `Deque<List<WheelEntry>> menuStack` | 菜单栈（支持子菜单压栈/回退） |

### 交互行为

**点按模式**:

- 鼠标左键触发当前选中条目
- 若无选中则关闭屏幕
- 有子菜单时进入子菜单

**长按模式**:

- `triggerFromHoldRelease()` 由外部长按释放时调用
- 触发当前选中的动作项（忽略子菜单）

### 翻页

鼠标滚轮在页面间切换。

## 渲染管道与 Uniform

### 着色器管道 (LibRenders)

| 管道                        | Uniform                | 作用      |
|---------------------------|------------------------|---------|
| `RING_PIPELINE`           | `RingUniform`          | 抗锯齿圆环   |
| `SELECTION_PIPELINE`      | `SelectionUniform`     | 边缘柔和的圆点 |
| `ANNULAR_SECTOR_PIPELINE` | `AnnularSectorUniform` | 扇形高亮    |

所有管道基于通用 `SNIPPET_COMMON`，通过 `RingRenderState`、`SelectionRenderState`、`AnnularSectorRenderState`（均实现
`LibQuadGuiElementRenderState`）自动绑定 UBO。

### 动态 Uniform (LibDynamicUniforms)

管理并复用帧内 Uniform Buffer，避免每帧大量 GPU 内存分配：

```java
LibDynamicUniforms uniforms = AnvilLibWheel.getLibDynamicUniforms();

// 写入 Uniform 数据
uniforms.writeRing(center, innerDiameter, outerDiameter, aa);
uniforms.writeSelection(framebufferSize, center, radius, aa);
uniforms.writeAnnularSector(...);

// 每帧结束时复位
uniforms.reset();
```

内部使用 `DynamicUniformStorage` 搭配三个数据类（`RingUniform`、`SelectionUniform`、`AnnularSectorUniform`），按 STD140 布局写入。

全局单例通过 `AnvilLibWheel.getLibDynamicUniforms()` 获取，在 `ConfigureMainRenderTargetEvent` 时初始化。

## 输入控制

### WheelScreenController

封装点按与长按两种模式的输入逻辑，避免在 tick 事件中直接操作导致重复打开。

```java
WheelScreenController controller = new WheelScreenController();

// 打开点按屏幕
controller.openTap(menuModel);

// 长按键按下
controller.onHoldKeyPressed(menuModel);

// 长按键释放（触发选中动作 + 关闭）
controller.onHoldKeyReleased();
```

## 测试与示例

`dev.anvilcraft.lib.v2.test.wheel` 包提供完整的可运行示例。

### 测试组件

| 类                        | 说明                                               |
|--------------------------|--------------------------------------------------|
| `WheelTestKeys`          | 注册四个按键（点按/长按 + 圆点/扇形）                            |
| `WheelTestClientHandler` | `ClientTickEvent.Pre` 处理点按，`InputEvent.Key` 处理长按 |
| `WheelDemoMenus`         | 构建 `buildTapDemo()` / `buildHoldDemo()` 演示菜单     |

### 演示菜单特性

- 动作项（Action entries）
- 子菜单（Submenus）
- 自定义渲染器（渲染苹果物品图标）

## 扩展指南

### 自定义渲染器

```java
// 实现 WheelEntryRenderer
WheelEntryRenderer myRenderer = (graphics, entry, x, y, radius) -> {
    // 在扇区内绘制任意 GUI 元素
};

// 传入 action 或 submenu 的重载方法
builder.action("id", Component.literal("Custom"), ctx -> {}, myRenderer);
```

### 动态样式

通过 `WheelMenuBuilder` 和 `WheelWidget` 构造参数调整：

- 动画时长
- 选中效果颜色
- 字体缩放
- 死区大小

### 与服务端交互

`WheelEntryAction` 可通过 `WheelActionContext` 获取页面与槽位信息，结合 `PacketDistributor` 发送网络包：

```java
builder.action("action", Component.literal("Do Something"), ctx -> {
    PacketDistributor.sendToServer(new MyActionPacket(ctx.slotIndex(), ctx.openMode()));
});
```
