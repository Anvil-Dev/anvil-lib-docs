# 结构只读沙盒与界面预览 (Preview)

在游戏内手册、配方查看器（如 JEI/EMI 扩展）或蓝图浏览器中，开发者常常需要在 GUI 内嵌入一个**可旋转缩放的 3D `StructureTemplate` 预览**，并允许玩家悬停查看方块实体 NBT 详情，甚至点击箱子/机器弹出其原生容器界面。

若直接在真实世界中操作或尝试打开真实 `AbstractContainerScreen`，会引发一系列严重问题：发包篡改玩家当前菜单、点击槽位吞掉物品、触发方块的 `tick` 或方块更新破坏结构。`dev.anvilcraft.lib.v2.rendering.preview` 正是为解决这类需求而生的**完全隔离的客户端沙盒与只读界面框架**。

## 整体架构概览

| 分层 | 子包 | 核心类 | 职责 |
| --- | --- | --- | --- |
| **视口与工具** | `preview` | `ViewportCameraRig`、`SectionOffsetVertexConsumer`、`SodiumSpriteBridge` | 正交相机矩阵计算、16x16x16 分段顶点偏移、Sodium 动态纹理标记 |
| **沙盒关卡与渲染** | `preview.level` | `StructureSandboxFactory`、`SandboxRenderLevel`、`StructurePreviewRenderer`、`PreviewLightmapAtlas` | 从 `StructureTemplate` 生成隔离假世界、离屏/视口内 3D 渲染、`Effects` 扩展注入 |
| **拾取与详情分页** | `preview.level` | `StructurePreviewPicker`、`StructureBlockEntityDetails`、`StructureDetailsPager` | 3D 射线拾取、方块实体 NBT 树结构文本化与滚轮分页 |
| **只读容器浮窗** | `preview.gui` | `StructureGuiProviders`、`StructureGuiSession`、`StructureGuiPreview`、`StructureGuiGeometry` | 在隔离玩家/沙盒中实例化并渲染原版或自定义只读容器界面 |

---

## 第一部分：构造沙盒关卡与渲染 (`preview.level`)

### 1. 构建隔离世界：`StructureSandboxFactory` & `SandboxRenderLevel`

使用 `StructureSandboxFactory.create(clientLevel, template, placementPos)` 可以将原版 `StructureTemplate` 安全加载进一个独立的 `SandboxRenderLevel` 中：

- 使用内部 `DelegatingServerLevelAccessor` 与 `Block.UPDATE_KNOWN_SHAPE` 标志放置方块，**不触发邻接方块更新或物理掉落**。
- 在放置前预先截取结构模板内所有方块实体的原始 NBT 快照（可通过 `level.getStructureBlockEntityData(pos)` 查询）。
- 自动重建结构内的实体（包括对 `FallingBlockEntity` 与悬挂实体的 `TileX`/`TileY`/`TileZ` 局部偏移修复）。

::: warning 重要坑点：`getFilledBlocks()` 复用可变坐标
`SandboxRenderLevel.getFilledBlocks()` 返回 `Stream<BlockPos>`，出于性能优化目的，流在遍历过程中**内部复用同一个 `BlockPos.MutableBlockPos` 实例**。如果你需要收集到集合或跨元素保留坐标，**必须调用 `.immutable()`**（如 `level.getFilledBlocks().map(BlockPos::immutable).toList()`）。
:::

### 2. 正交相机与 3D 渲染：`ViewportCameraRig` & `StructurePreviewRenderer`

`ViewportCameraRig` 提供以 GUI 方块比例（`0.625F * 16 * zoom`）缩放的正交投影与旋转预设（`PerspectivePreset`），确保**渲染器 (`StructurePreviewRenderer`)** 与**射线拾取器 (`StructurePreviewPicker`)** 共用完全一致的变换矩阵。

`StructurePreviewRenderer`（通过 `getInstance()` 获取单例，仅渲染线程调用）除了支持全结构绘制，还支持按 Y 轴切片过滤（`visibleMinY` ~ `visibleMaxYExclusive`，常用于分层建筑教程）以及 `Effects` 扩展回调（在 1.21.1 中于相机矩阵生效状态下直接向同一 `BufferSource` 提交附加模型或轮廓效果）。

### 3. 完整代码示例：在 Screen 中渲染可切片交互的 3D 结构并支持 NBT 分页与射线拾取

```java
package com.example.examplemod.client;

import dev.anvilcraft.lib.v2.rendering.preview.ViewportCameraRig;
import dev.anvilcraft.lib.v2.rendering.preview.gui.StructureGuiPreview;
import dev.anvilcraft.lib.v2.rendering.preview.level.SandboxRenderLevel;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewPicker;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewRenderer;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureSandboxFactory;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureDetailsPager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector2f;
import org.joml.Vector4f;

import java.util.List;

public class DemoStructureScreen extends Screen {
    private final StructureTemplate template;
    private final BlockPos placementPos;
    private final ViewportCameraRig cameraRig = new ViewportCameraRig();
    private final StructureDetailsPager pager = new StructureDetailsPager();
    private final StructureGuiPreview guiPreview = new StructureGuiPreview();

    private SandboxRenderLevel sandboxLevel;
    private BlockPos hoveredPos;
    private int layerCapY = Integer.MAX_VALUE;

    public DemoStructureScreen(Component title, StructureTemplate template) {
        super(title);
        this.template = template;
        this.placementPos = StructureSandboxFactory.centeredPlacement(template);
    }

    @Override
    protected void init() {
        this.sandboxLevel = StructureSandboxFactory.create(Minecraft.getInstance().level, this.template, this.placementPos);
        this.cameraRig.applyPreset(ViewportCameraRig.PerspectivePreset.ISOMETRIC_NORTH_EAST);
        this.cameraRig.configureViewport(this.width, this.height);
        this.cameraRig.setZoom(1.5F);
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);
        if (this.sandboxLevel == null) {
            return;
        }
        this.sandboxLevel.tickFrameClock();
        this.guiPreview.beginFrame();

        // 1. 准备视图投影矩阵与切片范围
        SandboxRenderLevel.Bounds bounds = this.sandboxLevel.getBounds();
        int maxY = bounds == null ? Integer.MAX_VALUE : Math.min(this.layerCapY, bounds.max().getY() + 1);
        int minY = bounds == null ? Integer.MIN_VALUE : bounds.min().getY();

        // 2. 渲染 3D 结构主体（含附加 Effects 示例）
        StructurePreviewRenderer.getInstance().render(
            this.sandboxLevel,
            this.cameraRig,
            graphics.bufferSource(),
            minY,
            maxY,
            StructurePreviewRenderer.Effects.NONE
        );

        // 3. 将屏幕鼠标位置反算至世界射线，执行拾取
        this.hoveredPos = pickAtScreen(mouseX, mouseY, minY, maxY);
        if (this.hoveredPos != null) {
            List<Component> lines = StructurePreviewPicker.tooltip(this.sandboxLevel, this.hoveredPos, this.placementPos);
            this.pager.setLines(lines);

            // 更新只读容器浮窗的屏幕锚点（此处简化使用当前鼠标附近，实际应投影 hoveredPos 中心）
            Vector2f anchor = projectBlockCenter(this.hoveredPos);
            this.guiPreview.anchor(anchor.x, anchor.y, !this.guiPreview.contains(mouseX, mouseY));
        }

        // 4. 渲染只读容器浮窗与分页提示
        this.guiPreview.render(graphics);
        if (this.hoveredPos != null && !this.guiPreview.contains(mouseX, mouseY)) {
            List<Component> visibleTooltip = this.pager.visible(this.font, this.width, this.height);
            if (!visibleTooltip.isEmpty()) {
                graphics.renderComponentTooltip(this.font, visibleTooltip, mouseX, mouseY);
            }
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (this.guiPreview.mouseClicked(mouseX, mouseY, button)) {
            return true;
        }
        if (button == 0 && this.hoveredPos != null && this.sandboxLevel != null) {
            Vector2f anchor = projectBlockCenter(this.hoveredPos);
            // 左键点击带容器/提供器的方块，打开只读原生 GUI 浮窗
            if (this.guiPreview.open(this.hoveredPos, this.template, this.hoveredPos, anchor.x, anchor.y)) {
                return true;
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dragX, double dragY) {
        if (this.guiPreview.mouseDragged(mouseX, mouseY, button)) {
            return true;
        }
        this.cameraRig.setRotationY(this.cameraRig.getRotationY() + (float) dragX * 0.6F);
        this.cameraRig.setRotationX(this.cameraRig.getRotationX() + (float) dragY * 0.6F);
        return true;
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (this.guiPreview.mouseReleased(button)) {
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (this.hoveredPos != null && !this.guiPreview.contains(mouseX, mouseY)) {
            this.pager.scroll(scrollY);
            return true;
        }
        this.cameraRig.setZoom(Math.max(0.25F, Math.min(4.0F, this.cameraRig.getZoom() + (float) scrollY * 0.15F)));
        return true;
    }

    @Override
    public void removed() {
        // 离开界面时必须 clear() 清理隔离会话，严禁手动调用 AbstractContainerScreen#onClose
        this.guiPreview.clear();
        super.removed();
    }

    private BlockPos pickAtScreen(double mouseX, double mouseY, int minY, int maxY) {
        Matrix4f inv = new Matrix4f(this.cameraRig.buildProjectionMatrix())
            .mul(this.cameraRig.buildViewMatrix())
            .invert();
        float ndcX = (float) (2.0 * mouseX / this.width - 1.0);
        float ndcY = (float) (1.0 - 2.0 * mouseY / this.height);
        Vector4f near = new Vector4f(ndcX, ndcY, -1.0F, 1.0F).mul(inv);
        Vector4f far = new Vector4f(ndcX, ndcY, 1.0F, 1.0F).mul(inv);
        near.div(near.w);
        far.div(far.w);
        return StructurePreviewPicker.pick(
            this.sandboxLevel,
            new Vec3(near.x, near.y, near.z),
            new Vec3(far.x, far.y, far.z),
            minY,
            maxY
        );
    }

    private Vector2f projectBlockCenter(BlockPos pos) {
        Matrix4f vp = new Matrix4f(this.cameraRig.buildProjectionMatrix())
            .mul(this.cameraRig.buildViewMatrix());
        Vector4f clip = new Vector4f(pos.getX() + 0.5F, pos.getY() + 0.5F, pos.getZ() + 0.5F, 1.0F).mul(vp);
        clip.div(clip.w);
        return new Vector2f((clip.x * 0.5F + 0.5F) * this.width, (0.5F - clip.y * 0.5F) * this.height);
    }
}
```

---

## 第二部分：只读容器浮窗与自定义提供器 (`preview.gui`)

`StructureGuiPreview` 允许在不修改真实玩家背包或发送任何网络包的情况下，把箱子、熔炉、漏斗或自定义机器的界面作为悬浮窗口渲染到屏幕上：

- **自动识别原版容器**：若目标方块实体实现了 `MenuProvider`，`StructureGuiSession.create(...)` 会创建一个隔离的创造模式伪造 `Player`，调用 `MenuScreens.getScreenFactory(...)` 构建屏幕，并在异常安全作用域中自动恢复真实玩家的 `containerMenu`。
- **自定义无菜单方块界面 (`StructureGuiProviders`)**：对于没有标准 `MenuProvider` 或使用特殊存储协议的方块，在客户端初始化时调用 `StructureGuiProviders.register(blockId, provider)` 注册只读屏幕构造器。
- **生命周期安全规则**：
  1. 只读屏幕**只触发初始化、尺寸调整与绘制**，不会触发 `tick`、`mouseClicked`（除 `StructureGuiPreview` 自己的拖拽关闭外）、`onClose` 或 `removed`，从根源上避免向服务端发出发包指令或掉落槽位物品。
  2. 提供器内**只能使用传入的 `context.level()`、`context.player()`、`context.pos()` 与 `context.template()`**，禁止将其安装为 `Minecraft.screen`。
  3. 界面关闭、尺寸改变或切换展示结构时，必须调用 `guiPreview.clear()`。

### 注册自定义只读屏幕示例

```java
package com.example.examplemod.client;

import dev.anvilcraft.lib.v2.rendering.preview.gui.StructureGuiProviders;
import net.minecraft.resources.ResourceLocation;

public final class CustomGuiProviderInit {
    public static void onClientSetup() {
        StructureGuiProviders.register(
            ResourceLocation.fromNamespaceAndPath("examplemod", "arcane_pedestal"),
            context -> {
                // 使用 context.level() 与 context.pos() 读取隔离沙盒中的方块实体或原始结构数据
                if (context.level().getBlockEntity(context.pos()) == null) {
                    return null;
                }
                return new ReadonlyPedestalScreen(context.level(), context.pos(), context.player().getInventory());
            }
        );
    }
}
```

::: danger 重复注册保护
同一方块 `ResourceLocation` 若被重复注册至 `StructureGuiProviders.register(...)`，将直接抛出 `IllegalStateException`。请在客户端设置事件（`FMLClientSetupEvent`）中确保每个方块仅注册一次。
:::

---

## 公开 API 完整参考

### 1. `dev.anvilcraft.lib.v2.rendering.preview`

#### `ViewportCameraRig` & `PerspectivePreset`

| 成员 / 方法签名 | 参数 / 属性 | 说明 |
| --- | --- | --- |
| `enum PerspectivePreset` | `ISOMETRIC_NORTH_EAST` (`225, 30, 0`), `ISOMETRIC_NORTH_WEST` (`135, 30, 0`), `UP` (`120, 0, 45`) | 预设正交俯视角度 (`yawDeg, pitchDeg, rollDeg`) |
| `ViewportCameraRig()` | 无参 | 创建相机控制器，默认 `zoom = 1` |
| `void configureViewport(int width, int height)` | 视口宽高（像素） | 配置正交视口尺寸 |
| `void applyPreset(PerspectivePreset preset)` | 预设视角枚举 | 一键应用偏航/俯仰/滚转角 |
| `void setOrthographicAngles(float yawDeg, float pitchDeg, float rollDeg)` | 角度（度） | 设置自定义正交欧拉角 |
| `Matrix4f buildViewMatrix()` | 返回视图矩阵 | 按 `0.625F * 16 * zoom` 比例与偏移/旋转生成正交视图矩阵 |
| `Matrix4f buildProjectionMatrix()` | 返回投影矩阵 | 生成近裁剪 `-1000`、远裁剪 `3000` 的正交投影矩阵 |
| `get/setZoom(float)` | Lombok `@Getter/@Setter` | 读取或设置缩放倍率 |
| `get/setRotationX/Y/Z(float)` | Lombok `@Getter/@Setter` | 读取或设置各轴旋转角度 |
| `get/setOffsetX/Y(float)` | Lombok `@Getter/@Setter` | 读取或设置视口平移偏移量 |

#### `SectionOffsetVertexConsumer` & `SodiumSpriteBridge`

| 类 / 方法签名 | 说明 |
| --- | --- |
| `SectionOffsetVertexConsumer(VertexConsumer delegate, SectionPos sectionPos)` | 包装任意 `VertexConsumer`，拦截 `addVertex(x, y, z)` 并将局部区段坐标自动平移 `sectionPos * 16` |
| `static void SodiumSpriteBridge.pingSpriteUsage(@Nullable TextureAtlasSprite sprite)` | 若安装了 Sodium 模组，则通知 Sodium 的 `SpriteUtil` 将当前用到的精灵标记为活跃，保证预览中的流水/岩浆纹理正常播放帧动画 |

---

### 2. `dev.anvilcraft.lib.v2.rendering.preview.level`

#### `StructureSandboxFactory`

| 方法签名 | 参数与返回值 | 说明 |
| --- | --- | --- |
| `static @Nullable SandboxRenderLevel create(@Nullable Level clientLevel, StructureTemplate template, BlockPos placementPos)` | `clientLevel`: 用于读取注册表与特性集的参考世界（可为 `null`）；`template`: 原版结构模板；`placementPos`: 放置锚点 | 构建填充完毕的隔离沙盒关卡；捕获方块实体原始 NBT，并在结构中无内容或无法解析注册表时按需返回或构造对应状态 |
| `static BlockPos centeredPlacement(StructureTemplate template)` | 返回居于原点附近的建议放置坐标 | 根据模板尺寸计算居中锚点 `BlockPos` |

#### `SandboxRenderLevel`

继承自 `net.minecraft.world.level.Level`，额外包含公开记录类 `record Bounds(BlockPos min, BlockPos max)`。

| 构造器 / 方法签名 | 说明 |
| --- | --- |
| `SandboxRenderLevel()` | 使用默认空注册表与默认特性集构造沙盒关卡 |
| `SandboxRenderLevel(RegistryAccess registryAccess)` | 指定 `RegistryAccess` 构造沙盒关卡 |
| `SandboxRenderLevel(RegistryAccess registryAccess, FeatureFlagSet enabledFeatures)` | 同时指定 `RegistryAccess` 与 `FeatureFlagSet` |
| `@Nullable CompoundTag getStructureBlockEntityData(BlockPos pos)` | 返回结构模板在该坐标处原始捕获的方块实体 NBT **副本**（若无则为 `null`） |
| `void restoreBlockEntitiesForInspection()` | 将所有捕获的原始方块实体 NBT 重新写回对应方块实体，供只读 GUI 检查物品栏/字段使用 |
| `@Nullable BlockEntity getBlockEntity(BlockPos pos)` | 获取沙盒中已加载的方块实体 |
| `Iterable<Entity> getEntitiesForRendering()` | 遍历加载进沙盒的展示实体列表 |
| `void addEntity(Entity entity)` | 向沙盒中添加实体 |
| `void removeEntity(int id, Entity.RemovalReason reason)` | 从沙盒中移除实体 |
| `void tickFrameClock()` | 推进沙盒渲染时钟与动画插值刻度（通常在每帧渲染前调用一次） |
| `float getPartialTick()` | 获取当前沙盒帧时钟的小数刻进度 |
| `boolean hasContent()` | 是否包含任何方块或实体 |
| `boolean hasFilledBlocks()` | 是否存在非空气方块 |
| `Stream<BlockPos> getFilledBlocks()` | 遍历所有非空气方块坐标；**注意：流元素复用同一个 `MutableBlockPos`，存储时需调用 `.immutable()`** |
| `@Nullable Bounds getBounds()` | 返回包含所有非空气方块的包围盒 `Bounds(min, max)`；无方块时返回 `null` |
| `boolean isFilledBlock(BlockPos pos)` | 查询指定坐标是否为非空气填充方块 |
| `void refreshLightingAround(BlockPos pos)` | 局部刷新指定坐标周围的光照引擎数据 |

#### `StructurePreviewRenderer`

| 成员 / 方法签名 | 说明 |
| --- | --- |
| `interface Effects` | 附加渲染效果回调接口：含默认空实现 `Effects.NONE`、`default void submit(MultiBufferSource.BufferSource buffers)` 与 `default void render()` |
| `static StructurePreviewRenderer getInstance()` | 获取单实例渲染器（限渲染线程使用） |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig)` | 使用默认缓冲区渲染整个沙盒关卡 |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, MultiBufferSource.BufferSource buffers)` | 使用调用方 `buffers` 渲染整个沙盒关卡 |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, MultiBufferSource.BufferSource buffers, int visibleMinY, int visibleMaxYExclusive)` | 仅渲染 Y 坐标满足 `[visibleMinY, visibleMaxYExclusive)` 的方块层，实体与方块实体同步裁剪 |
| `void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, MultiBufferSource.BufferSource buffers, int visibleMinY, int visibleMaxYExclusive, Effects effects)` | 在上述切片渲染的基础上触发 `effects` 回调 |
| `void renderContent(SandboxRenderLevel level, MultiBufferSource.BufferSource buffers)` | 直接使用外部已配置好的相机/矩阵状态绘制全部沙盒几何体、方块实体与实体 |
| `void renderContent(SandboxRenderLevel level, MultiBufferSource.BufferSource buffers, int visibleMinY, int visibleMaxYExclusive)` | 直接使用外部已配置好的相机/矩阵状态，按 Y 轴范围 `[visibleMinY, visibleMaxYExclusive)` 切片绘制内容 |
| `static void markFluidSpritesActive(FluidState fluidState)` | 将流体当前静止/流动贴图精灵通过 `SodiumSpriteBridge` 标记为活跃 |

#### 拾取、NBT 详情与光照/区块支持类

| 类名 | 核心公开方法与说明 |
| --- | --- |
| `StructurePreviewPicker` | `static @Nullable BlockPos pick(SandboxRenderLevel level, Vec3 start, Vec3 end, int minY, int maxY)`：沿射线在指定 Y 范围内执行 DDA/包围盒拾取。<br>`static List<Component> tooltip(SandboxRenderLevel level, BlockPos pos, BlockPos placementPos)`：生成带相对坐标、方块名及格式化 NBT 摘要的提示行。 |
| `StructureBlockEntityDetails` | `static Map<BlockPos, CompoundTag> capture(CompoundTag template, BlockPos placementPos)`：从原始模板 NBT 提取按目标位置索引的方块实体数据。<br>`static List<Component> describe(String blockId, CompoundTag data)`：将 NBT 格式化为可读组件列表（上限 4096 行、递归深度 32，使用 `tooltip.anvillib_rendering.structure_preview.nbt.*` 翻译键）。 |
| `StructureDetailsPager` | `void setLines(List<Component> lines)`：设置完整详情行。<br>`List<Component> visible(Font font, int screenWidth, int screenHeight)`：按最大宽度 `min(320, screenWidth - 24)` 与单页最多 `12` 行裁剪并附加 `page x / total` 页码。<br>`void scroll(double amount)`：响应鼠标滚轮切换页码。 |
| `PreviewLightmapAtlas` | 实现 `AutoCloseable`：管理预览专用的独立光照贴图纹理，提供 `computeSkyDarken(Level, float partialTick)`、`update(Level)`、`bind()` 与 `close()`。 |
| `SandboxChunkProvider` | 继承自 `ChunkSource`，为 `SandboxRenderLevel` 按需提供并缓存 `SandboxLevelChunk` 与 `LevelLightEngine`。 |
| `SandboxLevelChunk` | 继承自 `LevelChunk`，支持在隔离客户端沙盒中直接存放方块状态与方块实体而无需真实世界连接。 |
| `DelegatingServerLevelAccessor` | 实现 `ServerLevelAccessor`，在 `StructureSandboxFactory` 调用 `StructureTemplate#placeInWorld` 时拦截写世界行为并将其导向 `SandboxRenderLevel`。 |

---

### 3. `dev.anvilcraft.lib.v2.rendering.preview.gui`

#### `StructureGuiProviders`

| 成员 / 方法签名 | 说明 |
| --- | --- |
| `@FunctionalInterface interface Provider` | `@Nullable AbstractContainerScreen<?> create(Context context)`：根据沙盒上下文生成只读容器屏幕 |
| `record Context(SandboxRenderLevel level, Player player, BlockPos pos, StructureTemplate template)` | 传递给自定义提供器的沙盒只读上下文 |
| `static void register(ResourceLocation block, Provider provider)` | 为指定方块 ID 注册自定义只读屏幕提供器；若重复注册同一 ID 则抛出 `IllegalStateException` |

#### `StructureGuiSession`

| 成员 / 方法签名 | 说明 |
| --- | --- |
| `StructureGuiSession(AbstractContainerScreen<?> screen, SandboxRenderLevel level, Player player)` | 包装已初始化的只读屏幕、隔离关卡与伪造玩家 |
| `static @Nullable StructureGuiSession create(Minecraft minecraft, StructureTemplate template, BlockPos pos)` | 从模板与目标坐标构造只读会话：恢复沙盒 BE -> 创建伪造创造模式玩家 -> 优先查询 `StructureGuiProviders`，否则回退至 `MenuProvider` + `MenuScreens` -> 在 `renderOnly` 中初始化屏幕并确保恢复真实玩家菜单 |
| `static boolean isRendering()` | 查询当前是否正处于只读 GUI 预览渲染/初始化作用域中 |
| `static void renderOnly(Runnable action)` | 以不透明度 `1.0F` 进入只读作用域并执行动作（内部带 `try/finally` 自动退栈，兼容嵌套调用） |
| `static void renderOnly(float alpha, Runnable action)` | 以指定缩放透明度 `alpha` 进入只读作用域并执行动作 |
| `static float opacity()` | 返回当前嵌套只读作用域的不透明度 |
| `static int tint(int color)` | 将传入 ARGB 颜色的 Alpha 通道乘以 `opacity()`，供 Mixin 与自定义绘制调用 |

#### `StructureGuiPreview` & `StructureGuiGeometry`

| 类 / 方法签名 | 说明 |
| --- | --- |
| `StructureGuiPreview()` / `StructureGuiPreview(BooleanSupplier reducedMotion)` | 构造只读浮窗控制器；可传入读取“减少动态效果”偏好的回调（如 `() -> Minecraft.getInstance().options.reducedMotion().get()`） |
| `boolean open(Object owner, StructureTemplate template, BlockPos pos, float anchorX, float anchorY)` | 为指定归属组件 `owner` 和方块 `pos` 打开只读容器浮窗并从锚点展开动画；无可用容器屏幕时返回 `false` |
| `@Nullable BlockPos blockFor(Object component)` | 查询给定界面组件/归属对象当前绑定的结构坐标 |
| `void beginFrame()` | 每帧渲染开始前调用一次，重置帧级可见性标记与更新开关动画进度 |
| `void anchor(float x, float y, boolean visible)` | 在每帧传入目标方块投影到屏幕上的最新锚点坐标及是否保持可见 |
| `boolean contains(double mouseX, double mouseY)` | 检测鼠标当前是否位于已展开的只读浮窗区域内 |
| `boolean mouseClicked(double mouseX, double mouseY, int button)` | 处理鼠标点击：在浮窗内左键开始拖拽移动，右键触发关闭动画 |
| `boolean mouseDragged(double mouseX, double mouseY, int button)` | 处理拖拽平移浮窗位置 |
| `boolean mouseReleased(int button)` | 结束拖拽状态 |
| `void clear()` | 立即销毁当前浮窗会话并重置动画状态（**绝不触发 `Screen#onClose` / `removed`**，确保安全） |
| `void render(GuiGraphics graphics)` | 在 `StructureGuiSession.renderOnly(alpha, ...)` 作用域内绘制浮窗及缩放过渡动画 |
| `static Vector2f StructureGuiGeometry.edge(float x, float y, float width, float height, float anchorX, float anchorY)` | 计算矩形边缘距离锚点 `(anchorX, anchorY)` 最近的锚接边缘坐标 |
| `static float StructureGuiGeometry.easeOut(float progress)` | 对应 `cubic-bezier(0.23, 1, 0.32, 1)` 的缓出动画插值函数 |
