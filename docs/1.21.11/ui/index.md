# 精灵主题、五态变体与基础 Renderer

`module.ui` 提供了一套不强制绑定 Minecraft 原版固定贴图尺寸的柔性控件渲染库（`dev.anvilcraft.lib.v2.ui.flexible`），支持根据字符串文本宽度自适应撑开尺寸、深浅配色主题切换、立体/扁平边框风格以及完整的鼠标交互五态变体解析。

## 模块信息

- 模组 ID：`anvillib_ui`（`AnvilLibUi.MODID`）
- 资源路径生成：`AnvilLibUi.location(String path)`

## 精灵体系维度：`FlexibleSprites`

`FlexibleSprites` 将每一个柔性按钮或浮窗的背景九宫格切片按四个正交维度组合寻址：

| 维度枚举 | 可选枚举值 | 切图命名与视觉含义 |
| --- | --- | --- |
| `SpriteTheme` | `LIGHT("")`、`DARK("dark")` | 亮色（无前缀）或暗色背景风格 |
| `SpriteStyle` | `THREE_D("")`、`FLAT("flat")` | 立体凸起边框（无前缀）或现代扁平风格 |
| `SpriteType` | `NON_SHADED`、`SHADED_1PX`、`SHADED_2PX` | 控制四边内边距与底边/顶边阴影厚度（按压态将阴影转移到顶边产生下沉感） |
| `SpriteVariant` | `NORMAL("")`、`HIGHLIGHTED`、`PRESSED`、`HIGHLIGHTED_PRESSED`、`HIGHLIGHTED_PRESSING` | 正常、悬停高亮、已选中、已选中且悬停、悬停并按住交互五态 |

辅助静态方法与记录：
- `FlexibleSprites.pickSprite(SpriteTheme, SpriteStyle, SpriteType, SpriteVariant)`：计算实际加载的 `SpriteInfo(Identifier sprite, int paddingTop, int paddingBottom, ...)`。
- `FlexibleSprites.pickPointer(SpriteTheme, SpriteStyle, SpriteVariant, PointerDirection)`：计算浮窗指针的 `PointerSprite(Identifier texture, int width, int height, int pointerUpInset)`。

## 交互行为机：`ButtonType` & `ButtonInput`

开发者无需手动组合 `if (hovered && pressed ...)`，只需指定 `ButtonType` 即可将实时鼠标与布尔开关状态映射为 `SpriteVariant`：

```java
public record ButtonInput(boolean toggleState, boolean hovered, boolean pressed, boolean startedInBounds) {}
```

| `ButtonType` 枚举值 | 适用控件场景 | 五态行为规律 |
| --- | --- | --- |
| `DISPLAY` | 纯信息展示面板、标签页角标 | 不读取鼠标位置与按压状态，始终返回 `NORMAL` |
| `MOMENTARY` | 瞬时触发按钮 | 悬停返回 `HIGHLIGHTED`，在控件内部起手按压返回 `HIGHLIGHTED_PRESSING` |
| `TOGGLE` | 持久化开关 / 选项卡 | 读取 `toggleState` 决定是否处于 `PRESSED` 或 `HIGHLIGHTED_PRESSED`，按住反馈 `HIGHLIGHTED_PRESSING` |
| `CLICK` | 标准点击提交按钮 | 兼顾点击过程即时按压与悬停反馈 |

`buttonType.variant(ButtonInput)` 返回解析后的 `SpriteVariant`。

## 抽象渲染基类：`Renderer<T extends Scope>` 与 `Scope`

`Renderer` 保存稳定的外观配置与交互绑定（可在屏幕实例中长期复用，避免每帧重复构造对象）；每次绘制时调用 `renderer.open()` 开启一个实现 `AutoCloseable` 的临时 `Scope` 上下文，设置坐标、字体、文本与鼠标点位后执行 `.render()`，最后利用 `try-with-resources` 自动释放本次绘制对 `GuiGraphics` 等帧对象的引用。

### `Renderer<T>` 配置与输入转发 API

| 方法 | 说明 |
| --- | --- |
| `dark()` | 切换为暗色主题 `SpriteTheme.DARK` |
| `flat()` | 切换为扁平样式 `SpriteStyle.FLAT` |
| `shaded1px()` / `shaded2px()` | 切换边框阴影厚度 |
| `highlighted()` / `pressed()` / `highlightedPressed()` / `highlightedPressing()` | 强制锁定某个静态展示变体（覆盖动态鼠标推导） |
| `buttonType(ButtonType)` | 指定 `ButtonType`，与 `basedOnMouse(...)` 调用顺序无关 |
| `toggleState(BooleanSupplier)` | 绑定 `TOGGLE` 按钮的外部选中状态供应商，每帧读取 |
| `alpha(float alpha)` | 设置总体透明度 `[0.0F, 1.0F]`（传入 `NaN` 时自动忽略保持原值）；控件精灵与文本会直接携带该 alpha 着色 |
| `basedOnMouse()` / `basedOnMouse(IntSet allowedKeys)` | 开启鼠标驱动的动态五态；不传参数时默认响应左键与右键 |
| `onPress(int x, int y)` / `onPress(Vector2f pos)` / `onRelease()` | 在 `Screen#mouseClicked(MouseButtonEvent, boolean)` 与 `Screen#mouseReleased(MouseButtonEvent)` 中转发按压起始位置与释放通知，用于准确判断“是否是在控件范围内起手按压” |
| `variantOf(T scope)` | 查询当前 `Scope` 状态最终解析出的 `SpriteVariant` |
| `open()` | 打开一次帧级渲染作用域 `T` |

### `Renderer.Scope` 常用流式配置方法

| 方法 | 说明 |
| --- | --- |
| `graphics(GuiGraphics)` / `font(Font)` | 传入绘制目标 `GuiGraphics` 与字体 `Font` |
| `pos(int x, int y)` / `pos(Vector2i)` | 设置控件左上角屏幕坐标 |
| `mousePos(int x, int y)` / `mousePos(Vector2f)` | 设置当前鼠标坐标（当启用非 `DISPLAY` 的 `basedOnMouse` 时必填） |
| `size(int width, int height)` / `size(Vector2i)` | 固定控件像素宽高 |
| `flexSize(int padding)` / `flexSize(hPad, vPad)` / `flexSize(left, top, right, bottom)` | 根据文本宽度和精灵四周阴影内边距自适应计算总大小 |
| `literal(String)` / `translatable(String[, args...])` / `translatableWithFallback(...)` / `text(Component)` | 设置绘制文本 |
| `textOffset(int, int)` / `textOffset(Vector2i)` | 微调文本绘制位置偏移 |
| `contains(@Nullable Vector2f point)` | 命中检测当前控件矩阵包围盒 |
| `render()` | 提交精灵背景与居中文案绘制 |
| `close()` | 释放作用域内部帧引用 |
