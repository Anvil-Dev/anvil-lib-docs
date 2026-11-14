# 结构只读沙盒与界面预览 (Preview)

在 JEI/EMI 配方展示、手册百科书页或机器蓝图提示框中直接渲染多方块结构时，常规客户端世界往往重度耦合区块加载、玩家连接与客户端Tick。为此，`dev.anvilcraft.lib.v2.rendering.preview` 系列提供了完全离线、内存极轻、支持交互拾取与层高过滤的结构预览套件：

- **`level` 子包**：离线只读世界 `SandboxRenderLevel` 及其区块供给器、`StructureSandboxFactory` 模板加载工厂、射线方块拾取器 `StructurePreviewPicker`、方块实体 NBT 只读解析器 `StructureBlockEntityDetails` 与文本分页器 `StructureDetailsPager`，以及 PiP 渲染入口 `StructurePreviewRenderer`。
- **`preview` 根包**：正交轨道相机控制 `ViewportCameraRig`、Minecraft 1.21.8 原生画中画渲染器 `StructurePreviewPipRenderer` 与自动事件绑定 `StructureRenderEvents`。
- **`gui` 子包**：容器界面内右键/快捷键浮窗预览框架 `StructureGuiPreview`、按方块 ID 扩展预览的注册表 `StructureGuiProviders`、离屏虚构玩家会话 `StructureGuiSession` 与几何缓动工具。

---

## 完整示例：在 Screen 中渲染可旋转与拾取的结构预览

以下示例演示如何从 `StructureTemplate` 构建沙盒世界、使用 `ViewportCameraRig` 与 `StructurePreviewRenderer` 在 GUI 中渲染三维结构、拾取悬停方块并读取其方块实体只读详情：

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.rendering.preview.ViewportCameraRig;
import dev.anvilcraft.lib.v2.rendering.preview.level.SandboxRenderLevel;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureBlockEntityDetails;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureDetailsPager;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewPicker;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructurePreviewRenderer;
import dev.anvilcraft.lib.v2.rendering.preview.level.StructureSandboxFactory;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

public class BlueprintPreviewScreen extends Screen {
    private final StructureTemplate template;
    private final BlockPos placementPos;
    private final ViewportCameraRig cameraRig = new ViewportCameraRig();
    private final StructureDetailsPager detailsPager = new StructureDetailsPager();

    private @Nullable SandboxRenderLevel sandboxLevel;
    private @Nullable BlockPos lastPickedPos;
    private int minVisibleY;
    private int maxVisibleYExclusive;
    private float panX;
    private float panY;

    public BlueprintPreviewScreen(StructureTemplate template) {
        super(Component.literal("结构预览"));
        this.template = template;
        this.placementPos = StructureSandboxFactory.centeredPlacement(template);
    }

    @Override
    protected void init() {
        this.sandboxLevel = StructureSandboxFactory.create(Minecraft.getInstance().level, this.template, this.placementPos);
        if (this.sandboxLevel != null) {
            SandboxRenderLevel.Bounds bounds = this.sandboxLevel.getBounds();
            this.minVisibleY = bounds.min().getY();
            this.maxVisibleYExclusive = bounds.max().getY() + 1;
            this.cameraRig.applyPreset(ViewportCameraRig.PerspectivePreset.ISOMETRIC_NORTH_WEST);
            this.cameraRig.setZoom(1.4f);
        }
    }

    @Override
    public void tick() {
        if (this.sandboxLevel != null) {
            this.sandboxLevel.tickFrameClock();
        }
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(graphics, mouseX, mouseY, partialTick);
        if (this.sandboxLevel == null) {
            return;
        }

        int viewWidth = 220;
        int viewHeight = 180;
        int originX = (this.width - viewWidth) / 2;
        int originY = (this.height - viewHeight) / 2;

        graphics.pose().pushMatrix();
        graphics.pose().translate(originX, originY);
        StructurePreviewRenderer.getInstance().render(
            this.sandboxLevel,
            this.cameraRig,
            graphics,
            viewWidth,
            viewHeight,
            this.minVisibleY,
            this.maxVisibleYExclusive,
            this.panX,
            this.panY,
            1.0f
        );
        graphics.pose().popMatrix();

        // 计算鼠标在视口组件内的局部坐标并拾取当前最前方可见方块
        double localX = mouseX - originX;
        double localY = mouseY - originY;
        if (localX >= 0 && localX < viewWidth && localY >= 0 && localY < viewHeight) {
            BlockPos picked = StructurePreviewRenderer.getInstance().pick(
                this.sandboxLevel,
                this.cameraRig,
                viewWidth,
                viewHeight,
                localX,
                localY,
                this.minVisibleY,
                this.maxVisibleYExclusive,
                this.panX,
                this.panY
            );
            if (picked != null) {
                if (!picked.equals(this.lastPickedPos)) {
                    this.lastPickedPos = picked;
                    List<Component> lines = new ArrayList<>(
                        StructurePreviewPicker.tooltip(this.sandboxLevel, picked, this.placementPos)
                    );
                    CompoundTag nbt = this.sandboxLevel.getStructureBlockEntityData(picked);
                    if (nbt != null) {
                        String blockId = BuiltInRegistries.BLOCK.getKey(
                            this.sandboxLevel.getBlockState(picked).getBlock()
                        ).toString();
                        lines.addAll(StructureBlockEntityDetails.describe(blockId, nbt));
                    }
                    this.detailsPager.setLines(lines);
                }
                graphics.setComponentTooltipForNextFrame(
                    this.font,
                    this.detailsPager.visible(this.font, this.width, this.height),
                    mouseX,
                    mouseY
                );
            }
        }
        super.render(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dragX, double dragY) {
        if (button == 0) {
            this.cameraRig.setRotationY(this.cameraRig.getRotationY() + (float) dragX * 0.8f);
            this.cameraRig.setRotationX(this.cameraRig.getRotationX() + (float) dragY * 0.8f);
            return true;
        } else if (button == 1) {
            this.panX += (float) dragX;
            this.panY += (float) dragY;
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, dragX, dragY);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (this.lastPickedPos != null) {
            this.detailsPager.scroll(-scrollY);
            return true;
        }
        this.cameraRig.setZoom(Math.clamp(this.cameraRig.getZoom() + (float) scrollY * 0.15f, 0.3f, 5.0f));
        return true;
    }
}
```

---

## 相机、渲染与只读沙盒 API

### `ViewportCameraRig`

控制结构预览视口尺寸、正交欧拉角旋转、缩放和平移偏移的相机模型（包 `dev.anvilcraft.lib.v2.rendering.preview`）。

| 成员 / 方法签名 | 说明 |
| :--- | :--- |
| `public ViewportCameraRig()` | 构造并默认应用 `PerspectivePreset.ISOMETRIC_NORTH_WEST` |
| `public void configureViewport(int width, int height)` | 以原点为中心设置正交视口 `[-width/2, -height/2, width/2, height/2]` |
| `public void applyPreset(PerspectivePreset preset)` | 应用视角预设：`ISOMETRIC_NORTH_EAST` `(225, 30, 0)`、`ISOMETRIC_NORTH_WEST` `(135, 30, 0)`、`UP` `(120, 0, 45)` |
| `public void setOrthographicAngles(float yawDeg, float pitchDeg, float rollDeg)` | 以角度制设置正交模式下的偏航角 `rotationY`、俯仰角 `rotationX` 与滚转角 `rotationZ` |
| `public Matrix4f buildViewMatrix()` | 根据 `offsetX/Y`、默认 GUI 方块缩放（`0.625f * 16 * zoom`）及绕 `rotationCenter` 的 Z→X→Y 旋转顺序生成视图矩阵 |
| `public Matrix4f buildProjectionMatrix()` | 根据当前视口及远近裁剪面 `[-1000, 3000]` 生成 `Matrix4f` 正交投影矩阵 |
| `getZoom()` / `setZoom(float)` | 相机缩放倍率 |
| `getRotationX()` / `setRotationX(float)` | X 轴俯仰旋转角（度） |
| `getRotationY()` / `setRotationY(float)` | Y 轴偏航旋转角（度） |
| `getRotationZ()` / `setRotationZ(float)` | Z 轴滚转旋转角（度） |
| `getOffsetX()` / `setOffsetX(float)` | 视图 X 轴平移偏移 |
| `getOffsetY()` / `setOffsetY(float)` | 视图 Y 轴平移偏移 |

#### `ViewportCameraRig.PerspectivePreset`

实现 `StringRepresentable`：枚举值包括 `ISOMETRIC_NORTH_EAST`、 `ISOMETRIC_NORTH_WEST`、`UP`。

---

### `StructureSandboxFactory`

负责从原版 `StructureTemplate` 构建可安全脱离服务端/世界连接的预览沙盒（包 `dev.anvilcraft.lib.v2.rendering.preview.level`）。

| 方法签名 | 说明 |
| :--- | :--- |
| `public static @Nullable SandboxRenderLevel create(@Nullable Level clientLevel, StructureTemplate template, BlockPos placementPos)` | 若 `clientLevel == null` 返回 `null`。将模板方块、实体和方块实体数据完整放置到新建的 `SandboxRenderLevel` 中，并在放置前通过 `StructureBlockEntityDetails.capture` 抓取所有原始结构方块实体 NBT 快照 |
| `public static BlockPos centeredPlacement(StructureTemplate template)` | 返回将 `template.getSize()` 中心对齐至 `(0, 0, 0)` 所需的锚点偏移坐标：`new BlockPos(-size.getX() / 2, -size.getY() / 2, -size.getZ() / 2)` |

---

### `SandboxRenderLevel` & 辅助区块类

`SandboxRenderLevel extends net.minecraft.world.level.Level`（包 `dev.anvilcraft.lib.v2.rendering.preview.level`），在无真实世界区块网络包的前提下模拟单次结构快照渲染所需的一切环境查询。

| 公开成员 / 方法签名 | 说明 |
| :--- | :--- |
| `public SandboxRenderLevel()` | 使用空/默认注册表构造沙盒世界 |
| `public SandboxRenderLevel(RegistryAccess registryAccess)` | 指定注册表访问器构造沙盒世界（推荐由 `clientLevel.registryAccess()` 传入） |
| `public SandboxRenderLevel(RegistryAccess registryAccess, FeatureFlagSet enabledFeatures)` | 指定注册表与特性标志集构造沙盒世界 |
| `public @Nullable CompoundTag getStructureBlockEntityData(BlockPos pos)` | 返回结构模板在该位置记录的原始只读 NBT 快照 |
| `public void restoreBlockEntitiesForInspection()` | 将存储的结构方块实体快照重新加载进对应方块实体用于只读检查 |
| `public void tickFrameClock()` | 推进沙盒内时钟与日夜时间分数 (`dayTimeFraction += dayTimePerTick`)，用于流体/附魔/脉冲纹理帧动画 |
| `public boolean hasContent()` / `public boolean hasFilledBlocks()` | 检查是否包含实体或非空气方块 |
| `public Stream<BlockPos> getFilledBlocks()` | 遍历所有已放置的非空气坐标 |
| `public Bounds getBounds()` | 返回记录结构包围盒的 `record Bounds(BlockPos min, BlockPos max)` |
| `public boolean isFilledBlock(BlockPos blockPos)` | 判断坐标是否已登记为非空气方块 |
| `public void refreshLightingAround(BlockPos pos)` | 刷新目标坐标周围的虚拟光学状态 |
| `public void addEntity(Entity entity)` / `removeEntity(int entityId, Entity.RemovalReason reason)` | 向沙盒添加或移除渲染实体（如盔甲架、掉落方块、展示框等） |
| `public Iterable<Entity> getEntitiesForRendering()` | 获取用于绘制的全部沙盒实体集合 |
| `public void setDayTimeFraction(float)` / `getDayTimeFraction()` | 获取/设置太阳/昼夜时间分数 |
| `public void setDayTimePerTick(float)` / `getDayTimePerTick()` | 获取/设置每帧推进的时间增量 |

辅助公开组件（供扩展沙盒行为时使用）：
- `SandboxChunkProvider extends ChunkSource`：懒加载生成 `SandboxLevelChunk` 并常驻内存；提供 `getChunk(int, int, ChunkStatus, boolean)` 与 `getLoadedChunksCount()` 等接口。
- `SandboxLevelChunk extends LevelChunk`：在 `setBlockState` 时同步更新 `SandboxRenderLevel` 的非空气索引与周围光照状态，`getFullStatus()` 返回 `FullChunkStatus.FULL`。
- `DelegatingServerLevelAccessor implements ServerLevelAccessor`：将沙盒 `SandboxRenderLevel` 包装为 `ServerLevelAccessor`，以便复用原版需要服务端级别接口的结构模板放置逻辑。

---

### `StructurePreviewRenderer` & `StructurePreviewPipRenderer` & `StructureRenderEvents`

| 类型 | 方法签名 | 说明 |
| :--- | :--- | :--- |
| `StructurePreviewRenderer` | `public static StructurePreviewRenderer getInstance()` | 获取线程安全单例 |
| `StructurePreviewRenderer` | `public void render(SandboxRenderLevel level, ViewportCameraRig cameraRig, GuiGraphics graphics, int maxX, int height, int visibleMinY, int visibleMaxYExclusive, float panOffsetX, float panOffsetY, float scale)` | 将沙盒渲染任务提交至 1.21.8 原生 `GuiGraphics.submitPictureInPictureRenderState` |
| `StructurePreviewRenderer` | `public @Nullable BlockPos pick(SandboxRenderLevel level, ViewportCameraRig cameraRig, int width, int height, double mouseX, double mouseY, int minY, int maxY, float panOffsetX, float panOffsetY)` | 按屏幕相对坐标发射正交射线，返回最近的处于可见 Y 层 `[minY, maxY)` 内的非空气方块坐标 |
| `StructurePreviewRenderer` | `public Vector2f projectCenter(BlockPos pos, ViewportCameraRig cameraRig, int width, int height, float panOffsetX, float panOffsetY)` | 将指定方块的中心 `(pos + 0.5)` 投影回组件本地 2D 坐标（常用于绘制指针连线或悬浮锚点） |
| `StructurePreviewPipRenderer` | `public StructurePreviewPipRenderer(MultiBufferSource.BufferSource buffers)` | 继承 `PictureInPictureRenderer<State>`，在隔离的纹理目标上先后渲染不透明方块、方块实体、实体以及排序后的半透明方块与流体 |
| `StructurePreviewPipRenderer.Effects` | `void accept(PoseStack pose, MultiBufferSource.BufferSource buffers)` | 函数式接口，用于在 PiP 内部插入额外覆盖渲染（如高亮边框） |
| `StructurePreviewPipRenderer.State` | `State(SandboxRenderLevel level, int minY, int maxY, Matrix4f transform, int x0, int y0, int x1, int y1, float scale, @Nullable ScreenRectangle scissorArea, Effects effects)` | 实现 `PictureInPictureRenderState`，同时提供一个省略 `effects` 的便捷构造器 |
| `StructureRenderEvents` | `previews(RegisterPictureInPictureRenderersEvent)` / `fallingBlocks(RegisterRenderStateModifiersEvent)` | 客户端事件监听器，自动注册 `StructurePreviewPipRenderer` 并修复沙盒内下落方块实体的光照采样 |

---

### 方块拾取与详情分页：`StructurePreviewPicker` / `StructureBlockEntityDetails` / `StructureDetailsPager`

| 类名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| `StructurePreviewPicker` | `public static @Nullable BlockPos pick(SandboxRenderLevel level, Vec3 start, Vec3 end, int minY, int maxY)` | 对可见高度层内的方块碰撞箱执行射线检测；流体等空轮廓方块自动回退使用整块 `Shapes.block()` 以保证可查看配置 |
| `StructurePreviewPicker` | `public static List<Component> tooltip(SandboxRenderLevel level, BlockPos pos, BlockPos placementPos)` | 返回方块翻译名称、相对于 `placementPos` 的局部坐标及完整属性列表 |
| `StructureBlockEntityDetails` | `public static Map<BlockPos, CompoundTag> capture(CompoundTag template, BlockPos placementPos)` | 直接从模板 NBT 抓取并按结构放置原点映射各坐标的方块实体初始数据 |
| `StructureBlockEntityDetails` | `public static List<Component> describe(String blockId, CompoundTag data)` | 解析嵌套方块实体 NBT（自动剔除 `id`/`x`/`y`/`z`/`keepPacked` 元字段），最多支持 32 层递归与 4096 行文本，未翻译字段保留路径与值 |
| `StructureDetailsPager` | `public void setLines(List<Component> lines)` | 设置需要分页显示的提示文本集合并重置页码 |
| `StructureDetailsPager` | `public List<Component> visible(Font font, int screenWidth, int screenHeight)` | 按屏幕宽度与行高动态自动换行（最大宽 320px，最多 12 行）并返回当前页内容及分页指示 |
| `StructureDetailsPager` | `public void scroll(double amount)` | 滚动切换预览详情页码 |

---

## 容器界面内浮窗预览：`gui` 子包

`dev.anvilcraft.lib.v2.rendering.preview.gui` 允许模组为结构中的特定方块注册标准容器 `Screen` 预览浮窗（例如点击/悬停箱子或机器时，在旁侧滑出只读库存界面预览，并绘制指向方块锚点的连线）。

### `StructureGuiProviders`

注册特定方块 ID 到其只读预览 `AbstractContainerScreen` 构建逻辑的注册表。

| 公开成员 | 签名 | 说明 |
| :--- | :--- | :--- |
| `register` | `public static void register(ResourceLocation block, Provider provider)` | 客户端注册将目标方块映射为预览容器界面的工厂回调 |
| `Provider` | `public interface Provider { @Nullable AbstractContainerScreen<?> create(Context context); }` | 返回 `null` 时表示该实例当前无法预览 |
| `Context` | `public record Context(SandboxRenderLevel level, Player player, BlockPos pos, StructureTemplate template)` | 提供只读沙盒、虚拟客户端玩家、方块世界坐标及原始结构模板 |

### `StructureGuiSession`

管理沙盒中创建虚拟预览 `Screen` 所需的伪装客户端玩家（`RemotePlayer` 代理，重写了玩家权限/游戏模式检查以确保本地容器菜单能被打开），以及控制浮窗渲染时物品图标半透明渐变的线程上下文。

| 公开成员 | 说明 |
| :--- | :--- |
| `StructureGuiSession(AbstractContainerScreen<?> screen, SandboxRenderLevel level, Player player)` | 持有被打开的预览容器界面、所在沙盒世界与虚拟玩家 |
| `public static @Nullable StructureGuiSession create(Minecraft minecraft, StructureTemplate template, BlockPos pos)` | 查询 `StructureGuiProviders`，若目标方块有注册 Provider 且成功创建屏幕，则初始化尺寸并构建会话 |
| `public static boolean isRendering()` | 判断当前是否正处于只读浮窗渲染阶段 |
| `public static void renderOnly(Runnable render)` / `renderOnly(float alpha, Runnable render)` | 在抑制交互与背景的前提下执行内联渲染；`alpha` 会同步通过 `StructureGuiItemOpacity` 写入槽位物品图集与超大物品渲染透明度 |
| `public static float opacity()` / `public static int tint(int color)` | 获取当前浮窗渲染透明度及将指定 ARGB 颜色按浮窗透明度缩放的结果 |

### `StructureGuiPreview`

开箱即用的浮窗预览控制器，内置出现/移动/消失平滑缓动动画（基于 `StructureGuiGeometry.easeOut`）、窗口边缘与方块锚点的连线绘制，以及拖拽移动、鼠标拦截与滚轮保护。

| 方法签名 | 说明 |
| :--- | :--- |
| `public StructureGuiPreview()` / `public StructureGuiPreview(BooleanSupplier reducedMotion)` | 默认从原生 `Minecraft.getInstance().options.reducedMotion()` 读取减弱动态效果开关 |
| `public boolean open(Object owner, StructureTemplate template, BlockPos pos, float anchorX, float anchorY)` | 为指定方块打开或切换浮窗界面并设定锚点坐标，成功打开返回 `true` |
| `public @Nullable BlockPos blockFor(Object component)` | 若 `component` 属于当前已打开或正在关闭的浮窗组件，返回其对应的方块坐标 |
| `public void beginFrame()` | 每帧渲染前推进过渡动画进度；当消失动画完全结束时自动释放会话 |
| `public void anchor(float x, float y, boolean visible)` | 当外层 3D 视角旋转或移动后同步更新方块屏幕投影锚点与可见性 |
| `public boolean contains(double mouseX, double mouseY)` | 检查鼠标当前是否位于已展开（非正在退出）的浮窗区域内 |
| `public boolean mouseClicked(double mouseX, double mouseY, int button)` | 支持按住窗口非交互区或 Alt/Ctrl 拖动浮窗，并向内层预览界面转发只读交互事件 |
| `public boolean mouseDragged(double mouseX, double mouseY, int button)` | 处理浮窗拖拽位移，若光标在窗口内则消费事件避免底层视角误旋转 |
| `public boolean mouseReleased(int button)` | 结束拖拽并将鼠标释放事件传递至浮窗（返回是否被消费） |
| `public void clear()` | 发起平滑退出关闭动画并清空浮窗 |
| `public void render(GuiGraphics graphics)` | 依次绘制从窗口边缘到锚点的连接线、浮窗背景、`StructureGuiSession.renderOnly` 只读界面内容与关闭提示 |

### 几何与透明度辅助：`StructureGuiGeometry` / `StructureGuiItemOpacity`

- `StructureGuiGeometry.edge(float x, float y, float width, float height, float anchorX, float anchorY) -> Vector2f`：计算从矩形窗口中心指向 `(anchorX, anchorY)` 的射线与窗口边缘的交点；若锚点在窗口内部则返回锚点自身。
- `StructureGuiGeometry.easeOut(float progress) -> float`：计算 `cubic-bezier(0.23, 1, 0.32, 1)` 缓动曲线值。
- `StructureGuiItemOpacity`：由 Mixin 注入到物品渲染状态上的透明通道查询接口，并提供 `StructureGuiItemOpacity.premultipliedColor(float opacity)` 用于生成预乘透明通道的 ARGB 颜色整数。
