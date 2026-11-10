# 全分支模块与子文档拆分清单（Checklist）

本文档记录 `AnvilLib` 全部 **7 个 `dev` 分支** 下 **20 个功能模块（含 `main` 聚合模块）** 的子文档拆分结构与编写进度。

## 一、 7 个目标 `dev` 分支一览

| 序号 | Git 分支 | 路由前缀 | Minecraft | NeoForge | Java | Rendering 模块规模 |
| :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| 1 | `dev/1.21.1` | `/1.21.1/` | `1.21.1` | `21.1.x` | 21 | Projection 结构投影（3 篇） |
| 2 | `dev/1.21.4` | `/1.21.4/` | `1.21.4` | `21.4.x` | 21 | Projection 结构投影（3 篇） |
| 3 | `dev/1.21.8` | `/1.21.8/` | `1.21.8` | `21.8.x` | 21 | Projection + 2D SDF + Blur/Buffers + GuiState（5 篇） |
| 4 | `dev/1.21.11` | `/1.21.11/` | `1.21.11` | `21.11.x` | 21 | Projection + 2D SDF + Blur/Buffers + GuiState（5 篇） |
| 5 | `dev/26.1` | `/26.1/` | `26.1.2` | `26.1.2.x` | 25 | 完整 ALR 渲染引擎：Compute/Bindless/Bloom/CachedBER/Hi-Z/Projection/SDF/PiP（9 篇） |
| 6 | `dev/26.2` | `/26.2/` | `26.2` | `26.2.x` | 25 | 完整 ALR 渲染引擎：Compute/Bindless/Bloom/CachedBER/Hi-Z/Projection/SDF/PiP（9 篇） |
| 7 | `dev/26.3` | `/26.3/` | `26.3` | `26.3.x` | 25 | 完整 ALR 渲染引擎：Compute/Bindless/Bloom/CachedBER/Hi-Z/Projection/SDF/PiP（9 篇） |

---

## 二、 单分支模块与子文档拆分规范（每个分支独立拥有一套）

以下路径以 `/<branch>/` 表示各分支独立路由（如 `/26.1/`、`/1.21.1/`）：

### 1. Main 与快速开始 (`module.main`)
- [x] `dev/26.1`: `/26.1/index.md` & `/26.1/getting-started.md`
- [ ] 其余分支 (`1.21.1` / `1.21.4` / `1.21.8` / `1.21.11` / `26.2` / `26.3`): `/<branch>/index.md` & `/<branch>/getting-started.md`

### 2. Codec 数据编解码 (`module.codec`)
- [x] `dev/26.1`: `/26.1/codec/index.md`
- [ ] 其余分支: `/<branch>/codec/index.md` — `CodecUtil` 与 `StreamCodecUtil`

### 3. Collision 碰撞检测工具 (`module.collision`)
- [x] `dev/26.1`: `/26.1/collision/index.md`
- [ ] 其余分支: `/<branch>/collision/index.md` — `AnvilLibCollision` 与 `CollisionTest` SAT 碰撞检测详解

### 4. Config 注解配置系统 (`module.config`)
- [x] `dev/26.1`: `/26.1/config/index.md`、`/26.1/config/client-screen.md`、`/26.1/config/datagen-and-util.md`
- [ ] 其余分支: `/<branch>/config/index.md`、`client-screen.md`、`datagen-and-util.md`

### 5. Cube 斜棱线与精确拾取 (`module.cube`)
- [x] `dev/26.1`: `/26.1/cube/index.md`、`/26.1/cube/picking-and-selection.md`、`/26.1/cube/model-and-geometry.md`
- [ ] 其余分支: `/<branch>/cube/index.md`、`picking-and-selection.md`、`model-and-geometry.md`

### 6. Explosion 爆炸系统 (`module.explosion`)
- [x] `dev/26.1`: `/26.1/explosion/index.md`
- [ ] 其余分支: `/<branch>/explosion/index.md` — `AnvilLibExplosion`、`AnvilLibExplosionConfig`、`ExplosionExecutor`、`ExplosionSession`

### 7. Font 字体与 SDF 文本渲染 (`module.font`)
- [x] `dev/26.1`: `/26.1/font/index.md`、`/26.1/font/sdf-renderer.md`、`/26.1/font/screens.md`
- [ ] 其余分支: `/<branch>/font/index.md`、`sdf-renderer.md`、`screens.md`

### 8. Integration 模组兼容集成 (`module.integration`)
- [x] `dev/26.1`: `/26.1/integration/index.md`
- [ ] 其余分支: `/<branch>/integration/index.md` — `@Integration`、`IntegrationHook`、`IntegrationType`、`ModVersionRange`、`IntegrationInstance`、`IntegrationManager`

### 9. Math 数学表达式系统 (`module.math`)
- [x] `dev/26.1`: `/26.1/math/index.md`、`/26.1/math/functions-and-registries.md`
- [ ] 其余分支: `/<branch>/math/index.md`、`functions-and-registries.md`

### 10. Moveable Entity Block 活塞移动方块实体 (`module.moveable-entity-block`)
- [x] `dev/26.1`: `/26.1/moveable-entity-block/index.md`
- [ ] 其余分支: `/<branch>/moveable-entity-block/index.md` — `IMoveableEntityBlock`、`AnvilLibMoveableEntityBlock`、`IPistonMovingBlockEntityExtension`、`IPistonHeadRenderStateExtension`

### 11. Multiblock 动态多方块系统 (`module.multiblock`)
- [x] `dev/26.1`: `/26.1/multiblock/index.md`、`/26.1/multiblock/controller-and-state.md`、`/26.1/multiblock/events-and-network.md`
- [ ] 其余分支: `/<branch>/multiblock/index.md`、`controller-and-state.md`、`events-and-network.md`

### 12. Network 网络通信框架 (`module.network`)
- [x] `dev/26.1`: `/26.1/network/index.md`、`/26.1/network/registrar-and-util.md`
- [ ] 其余分支: `/<branch>/network/index.md`、`registrar-and-util.md`

### 13. Recipe 世界内配方系统 (`module.recipe`)
- [x] `dev/26.1`: `/26.1/recipe/index.md`、`triggers.md`、`predicates.md`、`outcomes.md`、`caches.md`、`context-and-events.md`
- [ ] 其余分支: `/<branch>/recipe/index.md`、`triggers.md`、`predicates.md`、`outcomes.md`、`caches.md`、`context-and-events.md`

### 14. Registrum 注册与数据生成 (`module.registrum`)
- [x] `dev/26.1`: `/26.1/registrum/index.md`、`block-and-be.md`、`item-and-creativetab.md`、`entity-fluid-menu.md`、`data-villager-modifier.md`、`datagen-providers.md`
- [ ] 其余分支: `/<branch>/registrum/index.md`、`block-and-be.md`、`item-and-creativetab.md`、`entity-fluid-menu.md`、`data-villager-modifier.md`、`datagen-providers.md`

### 15. Rendering 渲染扩展系统 (`module.rendering`)
- **在 `dev/1.21.1` 与 `dev/1.21.4` 中（3 篇）**：
  - [ ] `/<branch>/rendering/index.md` — `AnvilLibRendering`、`ProjectionRenderTypes`、`ProjectionShaders`、`ProjectionBuffers`
  - [ ] `/<branch>/rendering/projection-scene.md` — `ProjectionScene`、`ProjectionMesh`、`GhostConsumer`
  - [ ] `/<branch>/rendering/projection-renderer.md` — `ProjectionRenderer`、`ProjectionOverlay`
- **在 `dev/1.21.8` 与 `dev/1.21.11` 中（5 篇）**：
  - [ ] `/<branch>/rendering/index.md` — `AnvilLibRendering` 与 `ALRPipelines`
  - [ ] `/<branch>/rendering/projection.md` — `ProjectionScene`、`ProjectionMesh`、`ProjectionRenderer`、`ProjectionOverlay`、`ProjectionRenderTypes`、`ProjectionFeatures`、`ProjectionRenderEvents`
  - [ ] `/<branch>/rendering/sdf.md` — `Sdf2d`、`SdfGraphics`、`SdfParameters`、`SdfPassType`、`SdfRenderType`
  - [ ] `/<branch>/rendering/buffers-and-blur.md` — `GaussianBlur`、`BlurParametersUbo`、`TransformsUbo`、`BufferLayout`（`Std140` / `Std430`）、`BufferObject`、`VertexBufferHost`、`EmptyBufferSource`
  - [ ] `/<branch>/rendering/gui-state.md` — `GuiRenderAccess`、`LibGuiElementRenderState`、`LibQuadGuiElementRenderState`
- **在 `dev/26.1`、`dev/26.2` 与 `dev/26.3` 中（9 篇）**：
  - [ ] `/<branch>/rendering/index.md` — 核心入口与全局配置：`AnvilLibRendering`、`ALROptions`、`ALRPipelines`、`ALRComputePipelines`、`ALRPostEffects`、`ALROptimizations`、`ALRDebugEntries`、`ALRSharedMath`、`MainTargetResizeEvent`、`RegisterComputePipelinesEvent`
  - [ ] `/<branch>/rendering/blaze3d-compute.md` — Blaze3D 扩展、计算着色器与无绑定纹理：`ALRGpuDeviceExtension`、`ALRCommandEncoderExtension`、`ALRHICapabilities`、`ALRComputeCapabilities`、`ALRComputePipeline`、`ALRComputePass`、`ComputeBindingLayout` 及各类 Binding、`ALRComputeShaderManager`、`ExtendedGpuTexture`、`BindlessTexturingSupport`、`GpuQueryObject`
  - [ ] `/<branch>/rendering/buffers-foundation.md` — 缓冲布局、UBO/SSBO 对象与资源池：`BufferLayout`（`Std140` / `Std430`）、`BufferObject`、`FullTransformsUbo` / `IntSizeUbo`、`StagingSupport`、`FullyBufferedBufferSource`、`VertexBufferHost`、`GpuReusableResourcePool`、`LoopResetPool` / `SimpleResetPool`、`CompoundSubmitNodeStorage`、`ALRMeshSorting`
  - [ ] `/<branch>/rendering/post-effects.md` — 后处理管线：`BloomPostEffect`、`BloomRenderCallback`、`BloomParametersUbo`、`BloomSubmitNodeStorage`、`GaussianBlur`、`BlurParametersUbo`、`GlitchPostEffect`、`GlitchParametersUbo`
  - [ ] `/<branch>/rendering/cached-ber.md` — 缓存方块实体渲染：`CachedBlockEntityRenderer`、`CachedBlockEntityRenderState`、`CachedBlockEntityRenderDispatcher`、`CachedBlockEntityRenderingPipeline`、`CachedRenderingChunk`、`RebuildTask`、`IrisSupport`
  - [ ] `/<branch>/rendering/occlusion-culling.md` — 遮挡剔除系统：`OcclusionCuller`、`OcclusionMethod`、`OcclusionKey`、`OcclusionFeatureRendererHelper`、`HierarchicalZOcclusionCuller`（Hi-Z + SPD）、`GpuQueryOcclusionCuller`、`CullingStatistics`、`OcclusionCullingDebugEntry`
  - [ ] `/<branch>/rendering/projection.md` — 结构投影渲染：`ProjectionScene`、`ProjectionMesh`、`ProjectionRenderer`、`ProjectionOverlay`、`ProjectionRenderTypes`、`ProjectionFeatures`、`ProjectionRenderEvents`
  - [ ] `/<branch>/rendering/sdf.md` — 2D SDF 矢量渲染：`Sdf2d`、`SdfGraphics`、`SdfParameters`、`SdfPassType`、`SdfRenderType`
  - [ ] `/<branch>/rendering/gui-and-fakeworld.md` — GUI 画中画与假世界访问：`GuiRenderExtras`、`GuiGraphicsExtractorExtension`、`BlockStatePipRenderer` / `BlockStatePipRenderingState`、`StructurePipRenderer` / `StructurePipRenderingState`、`DynamicTextureBlitRenderState`、`LibGuiElementRenderState`、`FakeDisplayLevel`、`SimpleOffsetBlockAccess`、`SimpleDelegatingTintAccess`、`SimpleTintedEmptyLevelAccess`

### 16. RPC 跨端远程过程调用 (`module.rpc`)
- [ ] `/<branch>/rpc/index.md` — 远程调用声明与调用入口：`AnvilLibRpc`、`@RpcMethods`、`@RemoteCallable`、`@CallableParam`、`RPC`、`RpcMethodRef`、`RpcFunctionRef`、`LambdaResolver`
- [ ] `/<branch>/rpc/targets-and-validation.md` — 调用目标、参数校验、注册表与握手同步：`RpcTarget`、`ClientRpcTargets`、`IRemoteCallableValidator`、`RpcRegistry`、`RpcPendingCalls`、`IRpcPayload` / `RpcPayload` / `RpcRequestPayload` / `RpcResponsePayload`、`RpcConfigurationTask`

### 17. Space Select 空间区域选择 (`module.space-select`)
- [ ] `/<branch>/space-select/index.md` — 区域模型与管理：`AnvilLibSpaceSelect`、`District`、`DistrictManager`、`SpaceSelectItem`
- [ ] `/<branch>/space-select/client-and-events.md` — 客户端渲染、滚轮调整与事件网络：`AnvilLibSpaceSelectClient`、`ClientDistrictManager`、`DistrictRenderer`、`SpaceSelectScrollHandler`、`PlayerCreateDistrictEvent`、`SpaceSelectPayload`

### 18. Sync 字段自动同步框架 (`module.sync` & `module.sync:processor`)
- [ ] `/<branch>/sync/index.md` — 注解同步与管理器：`AnvilLibSync`、`@Sync`、`@LazySync`、`SyncDirection`、`SideUtil`、`SyncManager`、`LazySyncManager`、`SyncConfigManager`、`SyncProxy`、`SyncRegisterEntry`
- [ ] `/<branch>/sync/processor-and-network.md` — 编译期字节码注入处理器与网络协议：`SyncClassProcessor`、`SyncBytecodeInjector`、`LazySyncBytecodeInjector`、`SyncTargetIndex`、`LazySyncTargetIndex`、`SyncPayload` / `LazySyncPayload` / `SyncConfigurationPayload`

### 19. UI 柔性控件库 (`module.ui`)
- [ ] `/<branch>/ui/index.md` — 精灵资源与基础渲染器：`AnvilLibUi`、`FlexibleSprites`、`SpriteTheme`、`SpriteStyle`、`SpriteType`、`SpriteVariant`、`PointerDirection`、`Renderer`
- [ ] `/<branch>/ui/button-and-flyout.md` — 柔性按钮与弹出层渲染：`ButtonRenderer`、`ButtonType`、`ButtonInput`、`FlyoutRenderer`

### 20. Util 通用工具库 (`module.util`)
- [ ] `/<branch>/util/index.md` — 集合、数学、几何与物品栏工具：`AnvilLibUtil`、`Util`、`CollectionUtil`、`ListUtil`、`MathUtil`、`ShapeUtil`、`OutlineUtil`、`InventoryUtil`、`NumberProviderUtil`、`DistExecutor`、`Lazy`、`ISerializer`、`Scrollable`、`ClientTickRecorder`、`Line`
- [ ] `/<branch>/util/flatten-loop.md` — 扁平化多维循环：`FlattenLoop` 全套构建器与游标 API 详解
- [ ] `/<branch>/util/component-and-tooltip.md` — 文本组件与提示框工具：`ComponentUtil`、`TooltipUtil`、`IComponentInfo`、`DirectInfo`、`LiteralInfo`、`TranslatableInfo`、`MultilineComponentHelper`
- [ ] `/<branch>/util/predicates-and-stack.md` — 谓词模型与无限物品栈：`BlockStatePredicate`、`ChanceBlockState`、`WeightedChanceBlockStates`、`ChanceItemStack`、`IItemStackPredicate`、`ItemIngredientPredicate`、`ItemPredicate`、`NbtPredicate`、`UnlimitedItemStack`
- [ ] `/<branch>/util/nullness.md` — 非空类型与函数式接口：`@FieldsAreNonnullByDefault`、`@NonnullType`、`@NullableType`、`NonNullConsumer`、`NonNullBiConsumer`、`NonNullFunction`、`NonNullBiFunction`、`NonNullSupplier`、`NonNullUnaryOperator`、`NullableSupplier`

### 21. Wheel 轮盘菜单客户端 API (`module.wheel`)
- [ ] `/<branch>/wheel/index.md` — 轮盘构建器与数据模型：`AnvilLibWheel`、`WheelMenuBuilder`、`WheelMenuModel`、`WheelPageModel`、`WheelPagination`、`WheelEntry`、`WheelEntryAction`、`WheelEntryRenderer`、`WheelActionContext`、`WheelOpenMode`、`WheelSelectionEffect`
- [ ] `/<branch>/wheel/controller-and-rendering.md` — 轮盘控制器、界面与毛玻璃渲染状态：`WheelScreenController`、`WheelScreen`、`WheelWidget`、`WheelFrostedBackground`、`AnnularSectorRenderState`、`FrostedDiscRenderState`、`RingRenderState`、`SelectionRenderState`、`LibRenders`、`LibDynamicUniforms`
