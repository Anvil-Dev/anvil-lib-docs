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
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/index.md` & `/<branch>/getting-started.md`
- [ ] 其余分支 (`1.21.4` / `1.21.8` / `1.21.11` / `26.2` / `26.3`): `/<branch>/index.md` & `/<branch>/getting-started.md`

### 2. Codec 数据编解码 (`module.codec`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/codec/index.md`
- [ ] 其余分支: `/<branch>/codec/index.md` — `CodecUtil` 与 `StreamCodecUtil`

### 3. Collision 碰撞检测工具 (`module.collision`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/collision/index.md`
- [ ] 其余分支: `/<branch>/collision/index.md` — `AnvilLibCollision` 与 `CollisionTest` SAT 碰撞检测详解

### 4. Config 注解配置系统 (`module.config`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/config/index.md`、`client-screen.md`、`datagen-and-util.md`
- [ ] 其余分支: `/<branch>/config/index.md`、`client-screen.md`、`datagen-and-util.md`

### 5. Cube 斜棱线与精确拾取 (`module.cube`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/cube/index.md`、`picking-and-selection.md`、`model-and-geometry.md`
- [ ] 其余分支: `/<branch>/cube/index.md`、`picking-and-selection.md`、`model-and-geometry.md`

### 6. Explosion 爆炸系统 (`module.explosion`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/explosion/index.md`
- [ ] 其余分支: `/<branch>/explosion/index.md` — `AnvilLibExplosion`、`AnvilLibExplosionConfig`、`ExplosionExecutor`、`ExplosionSession`

### 7. Font 字体与 SDF 文本渲染 (`module.font`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/font/index.md`、`sdf-renderer.md`、`screens.md`
- [ ] 其余分支: `/<branch>/font/index.md`、`sdf-renderer.md`、`screens.md`

### 8. Integration 模组兼容集成 (`module.integration`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/integration/index.md`
- [ ] 其余分支: `/<branch>/integration/index.md` — `@Integration`、`IntegrationHook`、`IntegrationType`、`ModVersionRange`、`IntegrationInstance`、`IntegrationManager`

### 9. Math 数学表达式系统 (`module.math`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/math/index.md`、`functions-and-registries.md`
- [ ] 其余分支: `/<branch>/math/index.md`、`functions-and-registries.md`

### 10. Moveable Entity Block 活塞移动方块实体 (`module.moveable-entity-block`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/moveable-entity-block/index.md`
- [ ] 其余分支: `/<branch>/moveable-entity-block/index.md` — `IMoveableEntityBlock`、`AnvilLibMoveableEntityBlock`、`IPistonMovingBlockEntityExtension`

### 11. Multiblock 动态多方块系统 (`module.multiblock`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/multiblock/index.md`、`controller-and-state.md`、`events-and-network.md`
- [ ] 其余分支: `/<branch>/multiblock/index.md`、`controller-and-state.md`、`events-and-network.md`

### 12. Network 网络通信框架 (`module.network`)
- [x] `dev/26.1` & `dev/1.21.1`: `/<branch>/network/index.md`、`registrar-and-util.md`
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
  - [x] `dev/26.1`: `/26.1/rendering/index.md`、`blaze3d-compute.md`、`buffers-foundation.md`、`post-effects.md`、`cached-ber.md`、`occlusion-culling.md`、`projection.md`、`sdf.md`、`gui-and-fakeworld.md`
  - [ ] `dev/26.2` & `dev/26.3`: `/<branch>/rendering/index.md`、`blaze3d-compute.md`、`buffers-foundation.md`、`post-effects.md`、`cached-ber.md`、`occlusion-culling.md`、`projection.md`、`sdf.md`、`gui-and-fakeworld.md`

### 16. RPC 跨端远程过程调用 (`module.rpc`)
- [x] `dev/26.1`: `/26.1/rpc/index.md`、`refs-and-validation.md`
- [ ] 其余分支: `/<branch>/rpc/index.md`、`refs-and-validation.md`

### 17. Space Select 空间区域选择 (`module.space-select`)
- [x] `dev/26.1`: `/26.1/space-select/index.md`、`client-and-events.md`
- [ ] 其余分支: `/<branch>/space-select/index.md`、`client-and-events.md`

### 18. Sync 字段自动同步框架 (`module.sync` & `module.sync:processor`)
- [x] `dev/26.1`: `/26.1/sync/index.md`、`processor-and-network.md`
- [ ] 其余分支: `/<branch>/sync/index.md`、`processor-and-network.md`

### 19. UI 柔性控件库 (`module.ui`)
- [x] `dev/26.1`: `/26.1/ui/index.md`、`buttons-and-flyouts.md`
- [ ] 其余分支: `/<branch>/ui/index.md`、`buttons-and-flyouts.md`

### 20. Util 通用工具库 (`module.util`)
- [x] `dev/26.1`: `/26.1/util/index.md`、`flatten-loop.md`、`components.md`、`predicates.md`、`nullness-and-stack.md`
- [ ] 其余分支: `/<branch>/util/index.md`、`flatten-loop.md`、`components.md`、`predicates.md`、`nullness-and-stack.md`

### 21. Wheel 轮盘菜单客户端 API (`module.wheel`)
- [x] `dev/26.1`: `/26.1/wheel/index.md`、`controller-and-screen.md`
- [ ] 其余分支: `/<branch>/wheel/index.md`、`controller-and-screen.md`
