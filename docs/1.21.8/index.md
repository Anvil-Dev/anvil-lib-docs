# AnvilLib `dev/1.21.8` 分支概览

<BranchContextCard branch="1.21.8" />

本篇文档对应 `AnvilLib` 的 `dev/1.21.8` 分支，面向 **Minecraft 1.21.8**、**NeoForge 21.8.x** 与 **Java 21** 开发环境。本分支下的所有代码示例、类路径（例如 `net.minecraft.resources.ResourceLocation`、`GuiGraphics`、`GuiRenderState`、`ValueInput`/`ValueOutput`、`GatherDataEvent.Client`/`GatherDataEvent.Server` 等 1.21.8 API）与 Maven 坐标均严格对齐 `dev/1.21.8` 源码。

---

## 环境与构建基线

| 配置项 | `dev/1.21.8` 要求 |
| :--- | :--- |
| **JDK 版本** | Java 21 (`java_version=21`) |
| **Minecraft 版本范围** | `[1.21.8, 1.21.9)`（开发环境基于 `1.21.8`，Parchment `2025.09.14`） |
| **NeoForge 版本范围** | `[21,)`（开发环境基于 `21.8.53`） |
| **Loader 版本范围** | `[4,)` |
| **Maven GroupId** | `dev.anvilcraft.lib` |
| **聚合模块 ArtifactId** | `anvillib-neoforge-1.21.8` |
| **当前工程版本 (`mod_version`)** | `2.0.0` |

---

## 模块矩阵（`dev/1.21.8`）

`AnvilLib` 在 `dev/1.21.8` 分支下共提供 **1 个聚合发行模块 (`main`)** 与 **20 个独立功能子模块**（另含 1 个内部测试模块 `test` 与同步注解/字节码处理器 `anvillib-sync-processor-neoforge-1.21.8`）：

| 模块名称 | ArtifactId (`dev.anvilcraft.lib`) | 根包名 | 接口注入数据 | 核心职责与适用场景 |
| :--- | :--- | :--- | :---: | :--- |
| **[Main（聚合包）](./getting-started)** | `anvillib-neoforge-1.21.8` | `dev.anvilcraft.lib.v2` | 聚合透传 | 打包并重导出全部 20 个运行时功能子模块 |
| **[Codec](./codec/)** | `anvillib-codec-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.codec` | 否 | `Codec` / `MapCodec` / `StreamCodec` 预置常量、1~16 参数构建代理与原版 `critereon` 谓词流编解码 |
| **[Collision](./collision/)** | `anvillib-collision-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.collision` | 否 | 基于 13 轴 SAT（分离轴定理）的 AABB 与三角形网格静态碰撞、三轴独立扫掠与真扫掠碰撞计算 |
| **[Config](./config/)** | `anvillib-config-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.config` | 否 | 注解驱动配置声明、数值范围/滑块约束、嵌套折叠对象、半透明侧栏配置 GUI 与语言数据生成 |
| **[Cube](./cube/)** | `anvillib-cube-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.cube` | 否 | 模型斜棱线描边高亮、BVH 精确射线拾取、动态部件拾取提供器与运行时排除规则 |
| **[Explosion](./explosion/)** | `anvillib-explosion-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.explosion` | 否 | 分层球壳爆炸会话 (`ExplosionSession`)、执行器 (`ExplosionExecutor`) 与熔炼/高炉融化缓存 |
| **[Font](./font/)** | `anvillib-font-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.font` | **是** | 客户端 TrueType 字体管理、SDF 字形图集渲染、配置界面与 `GuiGraphics` 扩展 |
| **[Integration](./integration/)** | `anvillib-integration-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.integration` | 否 | 基于 `@Integration` 注解的外部模组存在性、版本范围与物理端/客户端与服务端 Datagen 条件加载框架 |
| **[Math](./math/)** | `anvillib-math-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.math` | 否 | 可序列化数学表达式树、Flat 文本双向解析与自校验回写、变参自定义函数与双注册表 |
| **[Moveable Entity Block](./moveable-entity-block/)** | `anvillib-moveable-entity-block-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.piston` | **是** | 允许带 `BlockEntity` 的方块被活塞推动并保留 NBT/ValueInput 状态与移动渲染数据 |
| **[Multiblock](./multiblock/)** | `anvillib-multiblock-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.multiblock` | 否 | 数据驱动的动态多方块结构定义、控制器注册、Codec `SavedData` 持久化、成形/解体状态管理与网络同步 |
| **[Network](./network/)** | `anvillib-network-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.network` | 否 | 面向 `PLAY` / `CONFIGURATION` / `COMMON` 阶段的数据包方向接口、`@Network` 自动扫描注册与广播/压缩工具 |
| **[Recipe](./recipe/)** | `anvillib-recipe-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.recipe` | **是** | 世界内配方系统：Trigger 触发器、方块/物品/实体 Predicate、Outcome 产出与 `ItemBatchPlan`、`IRecipeMapExtension` |
| **[Registrum](./registrum/)** | `anvillib-registrum-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.registrum` | 否 | 链式注册、`AttachmentSync` 自动同步、创造栏分区变体选择器与 1.21.8 Datagen 生成器 |
| **[Rendering](./rendering/)** | `anvillib-rendering-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.rendering` | 否 | 1.21.8 `RenderPipeline` 基础设施：全息结构投影渲染、结构沙盒预览、SDF 2D 管线、高斯模糊、Std140/Std430 UBO 与 `GuiRenderState` 桥接 |
| **[RPC](./rpc/)** | `anvillib-rpc-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.rpc` | 否 | 基于 `@RemoteCallable` 与方法引用的跨端远程过程调用、返回值异步/同步调用与参数校验 |
| **[Space Select](./space-select/)** | `anvillib-space-select-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.space_select` | 否 | 三维选区 (`District`) 管理、选区工具物品、客户端滚轮缩放与线框渲染 |
| **[Sync](./sync/)** | `anvillib-sync-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.sync` | 否 | 基于 `@Sync` / `@LazySync` 注解与字节码注入 (`anvillib-sync-processor-neoforge-1.21.8`) 的字段自动同步 |
| **[UI](./ui/)** | `anvillib-ui-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.ui` | 否 | 九宫格/三切片柔性控件渲染库：支持亮/暗主题、五态交互变体、透明度、指针箭头、按钮与弹出层 |
| **[Util](./util/)** | `anvillib-util-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.util` | 否 | 集合/数学/体素形状/物品栏工具、`FlattenLoop` 多维循环扁平化、组件信息封装、谓词模型与 `UnlimitedItemStack` |
| **[Wheel](./wheel/)** | `anvillib-wheel-neoforge-1.21.8` | `dev.anvilcraft.lib.v2.wheel` | 否 | 客户端轮盘菜单 API：支持 `TAP` / `HOLD` 模式、自动分页、子菜单跳转、毛玻璃圆盘与 1.21.8 `RenderPipeline` / `GuiElementRenderState` |
