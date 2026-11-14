# 精灵主题、五态变体与基础 Renderer

`module.ui`（模组 ID：`anvillib_ui`）为 NeoForge 1.21.1 提供了轻量级的**客户端柔性控件渲染库（`dev.anvilcraft.lib.v2.ui.flexible`）**，通过九宫格精灵切图查找表（`FlexibleSprites`）与**“配置态渲染器 (`Renderer`) + 帧作用域 (`Scope`)”**分离模型，轻松绘制自适应文本宽高的 3D/扁平按钮、双主题开关与带方向指示箭头的浮窗（Flyout）。

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，以避免 NeoForge Maven 未完全同步 Maven Central 导致接口注入或传递元数据异常：

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### 入口与客户端限制

- **`AnvilLibUi`**：使用 `@Mod(value = AnvilLibUi.MOD_ID, dist = Dist.CLIENT)` 标记（`MOD_ID = "anvillib_ui"`），提供静态辅助方法 `AnvilLibUi.of(String path)` 生成 `anvillib_ui:<path>` 资源定位符。
- 模块内所有类均属于客户端渲染域，仅可在 `Dist.CLIENT` 渲染路径使用。

## 设计思想：四维精灵查表与 Scope 生命周期

### 1. 四维组合定位九宫格切图

所有内置柔性控件切图路径均为 `anvillib_ui:flex_button/<theme><style><type><variant>`，由 4 个正交枚举唯一决定：

| 维度 | 枚举类 | 可选值与路径段 (`getPath()`) | 设计语义 |
| --- | --- | --- | --- |
| **主题** | `SpriteTheme` | `LIGHT` (`""`)、`DARK` (`"dark"`) | 亮色/暗色底板配色方案 |
| **风格** | `SpriteStyle` | `THREE_D` (`""`)、`FLAT` (`"flat"`) | 立体 bevel 边框风格 / 扁平风格 |
| **阴影** | `SpriteType` | `NON_SHADED`、`SHADED_1PX`、`SHADED_2PX` | 控制底边投影像素；按压态时底部阴影自动转换为顶部加厚以体现“下沉感” |
| **状态** | `SpriteVariant` | `NORMAL` (`""`)、`HIGHLIGHTED`、`PRESSED`、`HIGHLIGHTED_PRESSED`、`HIGHLIGHTED_PRESSING` | 常态、悬停、已选中、选中且悬停、悬停正按住 |

`FlexibleSprites` 在类静态初始化时即一次性算出全部四维组合对应的九宫格内边距（`left/top/right/bottomPadding`）及顶部朝上指针所需下移补偿（`pointerUpInset = max(0, topPadding - 2)`），避免逐帧分配。

### 2. `Renderer` 与 `Scope` 的生命周期分离

- **`Renderer<T extends Scope>`**（长生命周期）：持有一个控件的外观设定（主题、样式、类型、按钮交互模式、切换状态回调 `BooleanSupplier`、鼠标按压起点与当前渐变透明度 `alpha`），可以作为 `Screen` 字段跨帧复用。
- **`Renderer.Scope`**（单帧短生命周期，实现 `AutoCloseable`）：绑定单次绘制才确定的动态上下文（`GuiGraphics`、`pos`、`size` / `flexSize`、`mousePos`、`font`、`text`、`textOffset`）。
  - **推荐写法**：在每帧使用 `try (var scope = renderer.open()) { ... scope.render(); }`。退出作用域时 `close()` 会自动将 `graphics`、`font`、`text` 等引用全部置空，防止 `GuiGraphics` 或临时组件泄漏到帧外。
  - **按压/点击判定循环防护**：`flexSize(...)` 会为尺寸解析单独生成“绑定当前变体”的绘制尺寸函数 `size` 与“固定用 `NORMAL` 常态计算”的命中盒函数 `hitSize`，避免 `basedOnMouse` 在计算变体时反过来调用 `contains` -> 再读 `size` -> 又求变体造成的无限递归。也正因如此，带阴影按钮按下时视觉底部下沉 1px，其命中检测盒仍保持 `NORMAL` 态高度，符合原版手风琴防抖交互逻辑。

## 公开 API 完整参考

### 1. `AnvilLibUi`

包名：`dev.anvilcraft.lib.v2.ui`

| 成员签名 | 说明 |
| --- | --- |
| `public static final String MOD_ID = "anvillib_ui"` | 模块 Mod ID |
| `static ResourceLocation of(String path)` | 创建 `anvillib_ui:<path>` 资源定位符 |

### 2. 基础枚举与 `FlexibleSprites`

包名：`dev.anvilcraft.lib.v2.ui.flexible`

| 类型 / 方法签名 | 说明 |
| --- | --- |
| `enum SpriteTheme` (`LIGHT`, `DARK`) | 提供 `getPath()` (`""` / `"dark"`) |
| `enum SpriteStyle` (`THREE_D`, `FLAT`) | 提供 `getPath()` (`""` / `"flat"`) |
| `enum SpriteType` (`NON_SHADED`, `SHADED_1PX`, `SHADED_2PX`) | 提供 `getPath()` (`"non_shaded"` / `"shaded_1px"` / `"shaded_2px"`) |
| `enum SpriteVariant` (`NORMAL`, `HIGHLIGHTED`, `PRESSED`, `HIGHLIGHTED_PRESSED`, `HIGHLIGHTED_PRESSING`) | 提供 `getPath()` |
| `enum PointerDirection` (`LEFT`, `RIGHT`, `UP`, `DOWN`) | 提供 `getPath()` (`"left"` / `"right"` / `"up"` / `"down"`) |
| `static SpriteInfo FlexibleSprites.pickSprite(SpriteTheme, SpriteStyle, SpriteType, SpriteVariant)` | 返回精确匹配的本体贴图与内边距 `SpriteInfo` |
| `static @Nullable PointerSprite FlexibleSprites.pickPointer(SpriteTheme, SpriteStyle, SpriteType, SpriteVariant, PointerDirection)` | 按组合名读取并缓存 `textures/gui/pointer/...png` 原始尺寸（剔除四周各 `1px` 透明边距后的可见内容宽高）；缺失对应变体贴图时返回 `null` |
| `record SpriteInfo(ResourceLocation sprite, int leftPadding, int topPadding, int rightPadding, int bottomPadding, int pointerUpInset)` | 另提供 5 参兼容构造器（默认 `pointerUpInset = 0`） |
| `record PointerSprite(ResourceLocation texture, int width, int height, int pointerUpInset)` | 指针纹理路径与可见像素尺寸描述 |

### 3. `Renderer<T extends Renderer<T>.Scope>` & `Renderer.Scope`

包名：`dev.anvilcraft.lib.v2.ui.flexible`

#### `Renderer<T>` 外观与交互配置方法

| 方法签名 | 说明 |
| --- | --- |
| `getTheme()` / `getStyle()` / `getType()` / `getAlpha()` | Lombok `@Getter` 属性读取器 |
| `Renderer<T> dark()` | 切换为暗色主题 `SpriteTheme.DARK` |
| `Renderer<T> flat()` | 切换为扁平风格 `SpriteStyle.FLAT` |
| `Renderer<T> shaded1px()` / `shaded2px()` | 切换为 `SHADED_1PX` / `SHADED_2PX` 阴影类型 |
| `Renderer<T> highlighted()` / `pressed()` / `highlightedPressed()` / `highlightedPressing()` | 固定当前渲染器始终使用对应静态变体（覆盖鼠标推导行为） |
| `Renderer<T> buttonType(ButtonType buttonType)` | 设置按钮交互模式（默认 `ButtonType.DISPLAY`） |
| `Renderer<T> toggleState(BooleanSupplier toggleState)` | 绑定 `ButtonType.TOGGLE` 使用的选中状态数据源（默认 `() -> false`） |
| `Renderer<T> alpha(float alpha)` | 设置整体透明度并钳制至 `[0.0F, 1.0F]`；传入 `NaN` 时自动忽略以防淡入淡出异常闪烁 |
| `Renderer<T> basedOnMouse()` | 启用鼠标自适应交互（允许左键与右键触发按压反馈） |
| `Renderer<T> basedOnMouse(IntSet allowedKeys)` | 启用鼠标自适应交互并自定义允许按压触发的 GLFW 鼠标按键码集合 |
| `void onPress(int x, int y)` / `onPress(Vector2f pos)` | 在 `Screen#mouseClicked` 中调用，记录鼠标按下瞬间的起点位置 |
| `void onRelease()` | 在 `Screen#mouseReleased` 中调用，清除按压起点记录 |
| `SpriteVariant variantOf(T scope)` | 在不执行实际绘制的情况下提前求值当前作用域采用的 `SpriteVariant` |
| `abstract T open()` | 打开一个单帧绘制作用域 |

#### `Renderer.Scope` 链式配置与绘制方法 (`implements AutoCloseable`)

| 方法签名 | 说明 |
| --- | --- |
| `Scope graphics(GuiGraphics graphics)` | 绑定本帧的 `GuiGraphics`（必填） |
| `Scope font(Font font)` | 绑定绘制文本与计算 `flexSize` 所需的字体实例 |
| `Scope pos(int x, int y)` / `pos(Vector2i pos)` | 设置左上角像素坐标（必填） |
| `Scope mousePos(int x, int y)` / `mousePos(Vector2f pos)` | 绑定当前帧鼠标坐标（当 `basedOnMouse` 且非 `DISPLAY` 时必填） |
| `Scope size(int width, int height)` / `size(Vector2i size)` | 手动指定固定矩形宽高（与 `flexSize` 互斥，二者必填其一） |
| `Scope flexSize(int padding)` / `(horizontalPadding, verticalPadding)` / `(left, top, right, bottom)` | 根据 `font` 与 `text` 尺寸加上指定内边距以及当前贴图边框厚度自适应计算宽高，同时自动设置对应的 `textOffset` |
| `Scope literal(String)` / `translatable(...)` / `translatableWithFallback(...)` / `text(Component)` | 设置绘制与测算使用的文本组件 |
| `Scope textOffset(int x, int y)` / `textOffset(Vector2i)` | 手动指定文字相对控件左上角内边线内的追加偏移（注意 `flexSize` 会自动写入该值，如需微调应在 `flexSize` **之后**调用） |
| `@Nullable Vector2i resolveSize()` | 返回当前解析到的渲染宽高；若尚未调用 `size`/`flexSize` 则返回 `null` |
| `boolean contains(@Nullable Vector2f point)` | 判断坐标点是否落在本控件命中区域内（使用 `hitSize` 计算） |
| `Scope render()` | 校验所有必填字段（缺漏会抛 `IllegalStateException`）后执行子类绘制并返回 `this` |
| `void close()` | 清空本帧持有的对象引用，释放作用域 |
