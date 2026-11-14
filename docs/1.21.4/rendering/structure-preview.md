# 结构只读沙盒与界面预览 (`Preview`)

`dev.anvilcraft.lib.v2.rendering.preview` 提供了一套完整的隔离沙盒世界与客户端 GUI 悬停 3D 结构预览系统。它支持从 `StructureTemplate` 构建零副作用只读微世界，并能在配方界面、物品提示或方块详单屏幕中渲染可交互拖拽旋转、支持鼠标拾取检查方块实体内容的 3D 结构预览窗口。

## 只读沙盒世界：`StructureSandboxFactory` & `SandboxRenderLevel`

### `StructureSandboxFactory`

| 方法签名 | 说明 |
| --- | --- |
| `create(@Nullable Level clientLevel, StructureTemplate template, BlockPos placementPos)` | 将 `StructureTemplate` 放入隔离的 `SandboxRenderLevel` 并初始化区块缓存；若 `clientLevel == null` 或模板尺寸为空返回 `null` |
| `centeredPlacement(StructureTemplate template)` | 计算将结构中心锚定在坐标原点附近的推荐偏移 `BlockPos` |

### 沙盒组成：`SandboxRenderLevel` / `DelegatingServerLevelAccessor` / `SandboxLevelChunk`

- `SandboxRenderLevel` 继承 `ClientLevel` 并在其中运行虚拟区块供应器 `SandboxChunkProvider`、`SandboxLevelChunk` 与光照管理 `PreviewLightmapAtlas`，支持动态时间流逝（`tickFrameClock()`）驱动液体动画纹理与发光渲染。
- `DelegatingServerLevelAccessor` 实现 `ServerLevelAccessor`，在需要触发服务端风格查询时（兼容多模组结构填充与特性逻辑）提供只读代理，不修改真实世界状态。

## 3D 渲染与相机控制：`StructurePreviewRenderer` & `ViewportCameraRig`

### `ViewportCameraRig` 正交/等轴测相机

| 方法 / 枚举 | 说明 |
| --- | --- |
| `new ViewportCameraRig()` | 初始化默认正交预览相机控制架 |
| `configureViewport(int width, int height)` | 设置当前离屏或裁剪窗口像素宽高比 |
| `applyPreset(PerspectivePreset preset)` | 快速切换预设视角（包含正交等轴测与多方位预设，实现 `StringRepresentable`） |
| `setOrthographicAngles(float yawDeg, float pitchDeg, float rollDeg)` | 自定义俯仰角、偏航角与滚转角 |
| `buildViewMatrix()` / `buildProjectionMatrix()` | 构造供 Blaze3D `ModelViewStack` 和 `RenderSystem.setProjectionMatrix(..., ProjectionType.ORTHOGRAPHIC)` 使用的矩阵 |

### `StructurePreviewRenderer`

| 方法 | 说明 |
| --- | --- |
| `StructurePreviewRenderer.getInstance()` | 获取全局渲染器单例 |
| `render(SandboxRenderLevel, ViewportCameraRig, MultiBufferSource.BufferSource[, int minY, int maxYExclusive][, Effects effects])` | 按相机架配置清深度缓冲（`RenderSystem.clear(GlConst.GL_DEPTH_BUFFER_BIT)`）、禁用雾效（`FogParameters.NO_FOG`），先渲染不透明方块与 `Entity` / `BlockEntity`，再渲染半透明图层并提交批处理 |
| `renderContent(SandboxRenderLevel, MultiBufferSource.BufferSource[, minY, maxYExclusive, Effects])` | 在外层自行管理矩阵和相机时直接提交场景几何内容 |
| `markFluidSpritesActive(FluidState fluidState)` | 配合 `SodiumSpriteBridge.pingSpriteUsage(...)` 在使用 Sodium 优化模组时通知纹理动画保持每帧更新，避免沙盒水面/岩浆卡帧静止 |

> [!NOTE]
> 在 1.21.4 中，实体渲染已经全面采用 `EntityRenderState` 管线。`StructurePreviewRenderer` 会自动对每个实体调用 `renderer.createRenderState(entity, partialTicks)` 并传给 `renderer.render(renderState, poseStack, buffers, packedLight)`，调用方无需手动维护实体状态缓存。

## GUI 悬停预览浮窗：`StructureGuiPreview` & `StructureGuiProviders`

如果需要在 JEI/EMI 配方或物品说明（如带有结构的工具）旁渲染一个随鼠标锚点缩放淡入的 3D 结构预览卡，可以使用 `StructureGuiPreview` 与 `StructureGuiSession`：

### 注册结构来源：`StructureGuiProviders`

```java
StructureGuiProviders.register(
    ResourceLocation.fromNamespaceAndPath("mymod", "multiblock_core"),
    (StructureGuiProviders.Context ctx) -> {
        // ctx 提供 level()、player()、pos() 与 template()
        // 可在此对特定方块位置附加提示、检查激活条件或追加元数据
        return List.of();
    }
);
```

### `StructureGuiPreview` 生命周期与交互 API

| 方法 | 说明 |
| --- | --- |
| `new StructureGuiPreview()` / `new StructureGuiPreview(BooleanSupplier reducedMotion)` | 创建 GUI 预览浮窗；可接入客户端无障碍减弱动画配置 |
| `open(Object owner, StructureTemplate template, BlockPos pos, float anchorX, float anchorY)` | 打开面向指定 `owner` 的结构预览；若结构有效则返回 `true` 并平滑过渡展开 |
| `beginFrame()` | 每帧渲染开始前重置锚定标记 |
| `anchor(float x, float y, boolean visible)` | 绑定屏幕上的目标触发锚点位置与本帧可见性 |
| `contains(double mouseX, double mouseY)` | 检查鼠标是否在预览面板区域内（用于接管滚轮/悬停交互） |
| `mouseClicked(...)` / `mouseDragged(...)` / `mouseReleased(...)` | 将鼠标左键/右键拖拽与点击转交内部 `ViewportCameraRig` 旋转视角及射线拾取方块 |
| `blockFor(Object component)` | 反查当前渲染或关联组件对应的沙盒局部 `BlockPos` |
| `render(GuiGraphics graphics)` | 在 `Screen#render` 中绘制预览面板，内部利用 `StructureGuiSession.renderOnly(progress, ...)` 配合 `RenderSystem.setShaderColor` 统一控制面板整体透明度淡入淡出 |
| `clear()` | 关闭预览并清理关联沙盒资源 |

## 射线拾取与详情分页：`StructurePreviewPicker` & `StructureDetailsPager`

- `StructurePreviewPicker.pick(SandboxRenderLevel level, Vec3 start, Vec3 end, int minY, int maxY)`：对沙盒内限定 Y 层区间执行射线追踪并返回首个命中的 `BlockPos`（支持镂空裁剪层拾取）；
- `StructurePreviewPicker.tooltip(SandboxRenderLevel level, BlockPos pos, BlockPos placementPos)`：自动抽取目标位置的方块名称、属性状态以及通过 `StructureBlockEntityDetails` 解析出的方框内部库存/流体摘要文本；
- `StructureDetailsPager`：多行提示分页与滚轮翻页控制器（`visible(Font, screenWidth, screenHeight)`、`scroll(double amount)`），解决复杂机器提示超出屏幕高度的问题。
