# Cube 斜棱线与精确拾取：模块概述与排除规则 (`module.cube`)

<BranchContextCard branch="26.1" />

`module.cube`（构件名 `anvillib-cube-neoforge-26.1`，包名 `dev.anvilcraft.lib.v2.cube`）为包含旋转元素（斜块、机械部件、装饰模型）的方块提供**精确射线拾取（Ray Picking）**与**真实多面体并集斜棱线高亮（Outline Highlight）**。

在 Minecraft 原版中，方块的选择框（`VoxelShape`）只能由轴对齐长方体（AABB）拼成；如果方块 JSON 模型中包含旋转过的 `elements`（例如 22.5° / 45° 斜撑或 26.1 的三轴欧拉角旋转），原版准星拾取和黑框描边要么退化为粗糙的台阶状 AABB，要么只能用整格方块框住。`module.cube` 直接在客户端模型烘焙阶段提取 JSON 模型的真实旋转长方体元素，将其转化为闭凸多面体（`ConvexShape`），构建 BVH 加速结构并在后台线程计算消除共面接缝后的真实外轮廓棱线。

本模块按功能拆分为 3 篇子文档：
- **本篇（模块概述、事件与目标排除规则）**：详解命名空间启用、永久排除、按 ID 可重载的运行时目标排除规则，以及 `AnvilLibCube`、`CubeSelection`（配置入口）、`CubeHighlightEvents`、`CubeModelEvents`。
- **[精确拾取与动态部件提供器](./picking-and-selection)**：详解 `CubePicking`、`BlockSelectionProvider`（方块实体 BER 活动部件适配）、`SelectionPart`、`CubeSelection.Target` 与 `OutlineRenderer`。
- **[模型捕获、解码与几何轮廓缓存](./model-and-geometry)**：详解 `ModelCapture`、`CubeModelDecoder`、`ModelSelection`、`ModelSelections`、`ConvexShape`、`SelectionGeometry`、`OutlineBuilder`、`OutlineCache` 与 `PackedOutline`。

---

## 一、 接入配置与快速启用

### 1. Gradle 依赖

若已引入聚合包 `anvillib-neoforge-26.1`，则已自动包含本模块；若仅需单独引入 `cube` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-cube-neoforge-26.1:2.0.0")
}
```

### 2. 三步启用模组方块的斜棱线与精确拾取

`module.cube` 默认**不会**无差别扫描所有模组的方块，必须由你的模组在**客户端初始化阶段（且在模型烘焙发生前）**调用 `CubeSelection.enableNamespace(MOD_ID)` 显式启用本模组命名空间：

```java
package com.example.mymod.client;

import com.example.mymod.MyMod;
import com.example.mymod.init.ModBlocks;
import dev.anvilcraft.lib.v2.cube.client.CubeSelection;
import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;

@Mod(value = MyMod.MOD_ID, dist = Dist.CLIENT)
public class MyModClient {
    private static final Identifier BLACKLIST_RULE_ID =
        Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "config_blacklist");

    public MyModClient() {
        // 1. 启用本模组命名空间下所有方块的模型精确拾取与斜棱线高亮
        CubeSelection.enableNamespace(MyMod.MOD_ID);

        // 2. （可选）永久排除不需要模型拾取的特定方块（不参与模型几何烘焙）
        CubeSelection.exclude(ModBlocks.SIMPLE_CABLE.get());

        // 3. （可选）注册运行时动态排除规则：随时根据客户端配置或方块状态开关斜棱线，且无需重新烘焙模型
        CubeSelection.registerTargetExclusion(
            BLACKLIST_RULE_ID,
            state -> !MyModClientConfig.INSTANCE.enableFancyOutline
                || state.is(ModBlocks.DEBUG_FRAME.get())
        );
    }
}
```

---

## 二、 核心工作流与生命周期

`module.cube` 从资源加载到每帧渲染的完整生命周期如下：

1. **命名空间与永久排除注册（客户端模组构造期）**：
   调用 `CubeSelection.enableNamespace(modId)` 将命名空间加入白名单；调用 `CubeSelection.exclude(block)` 将特定方块加入永久黑名单。
2. **模型捕获与几何烘焙（资源重载 / 模型烘焙期）**：
   - 原版烘焙每个 `SimpleModelWrapper` 时，Mixin 调用 `ModelCapture.remember(...)` 用弱键映射（`weakKeys`）临时记录 `UnbakedCuboidGeometry` 的 `elements` 与合成后的 `ModelState`。
   - 在 `ModelEvent.ModifyBakingResult`（最低优先级 `EventPriority.LOWEST`）中，`CubeModelEvents.prepare` 调用 `ModelSelections.bake(...)`：消费并清空 `ModelCapture`，遍历所有已启用命名空间的 `BlockState`，将旋转长方体解码为 `ConvexShape`，构建共享 `SelectionGeometry`（上限 `16 MB`、`32768` 个状态）。
   - 在 `ModelEvent.BakingCompleted` 中，`CubeModelEvents.apply` 调用 `CubeSelection.install(snapshot)` 原子替换当前生效的模型表，并清空旧的帧缓存与轮廓缓存。
3. **准星射线精确拾取（每帧 `Entity#pick` 阶段）**：
   客户端玩家准星射线检测时，`CubePicking.pick(...)` 先检查当前方块及邻近越界半径（`searchRadius()`，最大 2 格）内的方块；若命中 `CubeSelection.Target`，则在局部空间使用 BVH 与凸多面体平面裁剪求出精确交点与交互面朝向（仅影响客户端准星选取，不影响实体物理碰撞箱或服务端射线）。
4. **斜棱线描边高亮（每帧 `ExtractBlockOutlineRenderStateEvent` 阶段）**：
   `CubeHighlightEvents.highlight` 获取当前瞄准方块的 `CubeSelection.Target`，从 `OutlineCache` 异步获取（或回退使用轻量 `fallbackOutline`）并集轮廓 `PackedOutline`，再经 `forView(localCamera)` 过滤掉小于 `0.1/16` 像素的微小错位内接缝，最后通过 `OutlineRenderer.render` 绘制原版线条或高对比度双通道描边。

---

## 三、 公开类与 API 详解

### 1. `AnvilLibCube`（模块主类）

| 类 / 常量签名 | 说明 |
| :--- | :--- |
| `public static final String MOD_ID = "anvillib_cube"` | 模块 Mod ID 常量。 |

### 2. `CubeSelection`（命名空间、排除规则与全局状态管理）

位于 `dev.anvilcraft.lib.v2.cube.client.CubeSelection`。本节列出其配置与生命周期管理方法（动态部件与查询方法详见下一篇[精确拾取与动态部件提供器](./picking-and-selection)）：

| 常量 / 方法签名 | 返回值 | 调用时机、参数说明与边界条件 |
| :--- | :--- | :--- |
| `public static final int MAX_PARTS = 32` | `int` | 单个方块状态（含 multipart 与动态 BER 部件）允许包含的最大 `SelectionPart` 数量上限。超过 32 个部件时自动回退为原版选择框。 |
| `public static void enableNamespace(String namespace)` | `void` | **必须在模型烘焙前调用**。校验 `namespace` 合法性（通过 `Identifier.fromNamespaceAndPath(namespace, "cube_selection")`）并将其加入启用集合。若 `namespace` 含非法字符会抛出 `IdentifierException`。 |
| `public static void exclude(Block block)` | `void` | 将指定 `Block` 加入永久排除集合。被排除的方块既不会在 `ModelSelections.bake` 中烘焙模型几何，也不会响应动态部件或 `modelParts` 查询。 |
| `public static void registerTargetExclusion(Identifier id, Predicate<BlockState> exclusion)` | `void` | 注册按 `id` 索引的**运行时目标排除规则**。<br>• 同一 `id` 重复注册会直接替换旧规则；不同 `id` 互不覆盖。<br>• 当任意已注册规则对某个 `BlockState` 返回 `true` 时，`CubeSelection.target(...)` 返回 `null`，精确拾取与高亮立即回退原版。<br>• **优势**：规则在每次帧缓存查询前执行，不影响底层已烘焙的模型缓存；修改客户端配置或注销规则后无需重载资源包即可立即恢复斜棱线。<br>• **注意**：`exclusion` 回调在每帧渲染与拾取热路径中执行，必须保持无副作用且不得强引用 `Level` 或 `BlockEntity`。 |
| `public static boolean unregisterTargetExclusion(Identifier id)` | `boolean` | 移除指定 `id` 的运行时目标排除规则。若此前存在该规则并成功移除则返回 `true`。不会影响其他 `id` 的规则或 `exclude(Block)` 设置的永久排除。 |
| `public static boolean isTargetExcluded(BlockState state)` | `boolean` | 检查 `state.getBlock()` 是否被 `exclude(Block)` 永久排除，或是否命中任意已注册的 `registerTargetExclusion` 规则。 |
| `public static boolean isEnabled(Block block)` | `boolean` | 判断 `block` 是否未被永久排除，且其注册表命名空间已通过 `enableNamespace` 启用（或已通过 `registerDynamic` 注册了动态部件提供器）。 |
| `public static boolean supportedBounds(AABB bounds)` | `boolean` | 校验包围盒的所有坐标均为有限浮点数，且整体位于 `[-2, 3]` 方块坐标范围内（即向周围最多延伸 2 格）。若方块带有原版随机位置偏移（`state.hasOffsetFunction()`），烘焙和动态注册时会先将 `bounds.inflate(0.5)` 后再调用此方法校验。 |
| `public static void install(ModelSelections.Snapshot snapshot)` | `void` | 安装新的模型烘焙快照，清空 `OutlineCache` 与当前帧缓存，并重新计算跨格搜索半径 `radius`（`0 ~ 2`）。由 `CubeModelEvents.apply` 自动调用。 |
| `public static void beginFrame(ClientLevel level, float fraction)` | `void` | 重置单帧目标缓存 `FRAME`，记录当前帧所属的 `ClientLevel` 与 `partialTick` 插值系数。 |
| `public static void clearWorld()` | `void` | 清空单帧目标缓存与 `OutlineCache`。在客户端退出存档时由 `CubeHighlightEvents.disconnect` 自动调用。 |
| `public static OutlineCache outlines()` | `OutlineCache` | 获取全局共享的后台轮廓缓存实例。 |
| `public static int searchRadius()` | `int` | 获取当前所有已注册模型与动态部件中超出单格 `[0, 1]` 范围的最大延伸格数（范围 `0 ~ 2`）。为 `0` 时 `CubePicking` 无需扫描邻近越界方块。 |
| `public static boolean active()` | `boolean` | 当前是否存在至少一个已烘焙的静态模型或已注册的动态方块提供器。 |
| `public static boolean extendsBlock(BlockState state)` | `boolean` | 判断指定 `BlockState` 的模型或动态部件包围盒是否超出了 `[0, 1]^3` 标准单格范围。 |
| `public static Statistics statistics()` | `CubeSelection.Statistics` | 返回当前模块的内存与缓存统计快照：`states`（已缓存状态数）、`geometryBytes`（共享几何估算字节数）、`unsupportedStates`（超预算或非凸被跳过的状态数）、`outlines`（`OutlineCache.Statistics`）。 |

### 3. `CubeModelEvents` 与 `CubeHighlightEvents`（客户端事件监听器）

这两个类均标注了 `@EventBusSubscriber(modid = AnvilLibCube.MOD_ID, value = Dist.CLIENT)`，由 NeoForge 自动挂载：

| 类名 | 监听事件与方法签名 | 说明 |
| :--- | :--- | :--- |
| `CubeModelEvents` | `@SubscribeEvent(priority = EventPriority.LOWEST)`<br>`public static void prepare(ModelEvent.ModifyBakingResult event)` | 在所有模组完成模型修改后，调用 `ModelSelections.bake(event.getBakingResult().blockStateModels())` 提取并烘焙全部启用方块的几何快照。 |
| `CubeModelEvents` | `@SubscribeEvent`<br>`public static void apply(ModelEvent.BakingCompleted event)` | 在模型烘焙彻底完成后，调用 `CubeSelection.install(pending)` 发布几何快照并释放临时引用。 |
| `CubeHighlightEvents` | `@SubscribeEvent(priority = EventPriority.LOWEST)`<br>`public static void highlight(ExtractBlockOutlineRenderStateEvent event)` | 拦截原版方块描边渲染状态提取事件。若当前方块存在有效的 `CubeSelection.Target`，向 `event.addCustomRenderer(...)` 注册自定义描边绘制器：自动适配半透明通道（`translucentPass`）、无障碍高对比度双通道描边（`state.highContrast()`，先画 `7.0F` 宽黑色底线再画高对比色细线）以及单目标超过 `4096` 条线段时的外包盒回退（`fallback`）。 |
| `CubeHighlightEvents` | `@SubscribeEvent`<br>`public static void disconnect(ClientPlayerNetworkEvent.LoggingOut event)` | 玩家断开连接退出世界时调用 `CubeSelection.clearWorld()` 释放缓存。 |
