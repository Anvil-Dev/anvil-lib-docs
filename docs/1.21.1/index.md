# AnvilLib `dev/1.21.1` 分支概览

<BranchContextCard branch="1.21.1" />

本篇文档对应 `AnvilLib` 的 `dev/1.21.1` 分支，面向 **Minecraft 1.21.1**、**NeoForge 21.1.x** 与 **Java 21** 开发环境。本分支下的所有代码示例、类路径（例如 `net.minecraft.resources.ResourceLocation`、`GuiGraphics`、`BakedModel`、`ItemStack` 等 1.21.1 命名）与 Maven 坐标均严格对齐 `dev/1.21.1` 源码。

---

## 环境与构建基线

| 配置项 | `dev/1.21.1` 要求 |
| :--- | :--- |
| **JDK 版本** | Java 21 (`java_version=21`) |
| **Minecraft 版本范围** | `[1.21.1, 1.21.2)`（开发环境基于 `1.21.1`，Parchment `2024.11.17`） |
| **NeoForge 版本范围** | `[21,)`（开发环境基于 `21.1.x`） |
| **Loader 版本范围** | `[4,)` |
| **Maven GroupId** | `dev.anvilcraft.lib` |
| **聚合模块 ArtifactId** | `anvillib-neoforge-1.21.1` |
| **当前工程版本 (`mod_version`)** | `2.0.0` |

---

## 模块矩阵（`dev/1.21.1`）

`AnvilLib` 在 `dev/1.21.1` 分支下共提供 **1 个聚合发行模块 (`main`)** 与 **20 个独立功能子模块**（另含 1 个内部测试模块 `test`）：

| 模块名称 | ArtifactId (`dev.anvilcraft.lib`) | 根包名 | 接口注入数据 | 核心职责与适用场景 |
| :--- | :--- | :--- | :---: | :--- |
| **[Main（聚合包）](./getting-started)** | `anvillib-neoforge-1.21.1` | `dev.anvilcraft.lib.v2` | 聚合透传 | 打包并重导出全部 20 个运行时功能子模块 |
| **[Codec](./codec/)** | `anvillib-codec-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.codec` | 否 | `Codec` / `MapCodec` / `StreamCodec` 预置常量、1~16 参数构建代理与原版 `critereon` 谓词流编解码 |
| **[Collision](./collision/)** | `anvillib-collision-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.collision` | 否 | 基于 13 轴 SAT（分离轴定理）的 AABB 与三角形网格静态碰撞、三轴独立扫掠与真扫掠碰撞计算 |
| **[Config](./config/)** | `anvillib-config-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.config` | 否 | 注解驱动配置声明、数值范围/滑块约束、嵌套折叠对象、半透明侧栏配置 GUI 与语言数据生成 |
| **[Cube](./cube/)** | `anvillib-cube-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.cube` | 否 | 模型斜棱线描边高亮、BVH 精确射线拾取、动态部件拾取提供器与运行时黑名单排除 |
| **[Explosion](./explosion/)** | `anvillib-explosion-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.explosion` | 否 | 批量爆炸会话 (`ExplosionSession`) 与自定义爆炸执行器 (`ExplosionExecutor`) |
| **[Font](./font/)** | `anvillib-font-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.font` | **是** | 客户端 TrueType 字体管理、多通道/单通道 SDF 字形图集与 `GuiGraphics` 扩展 |
| **[Integration](./integration/)** | `anvillib-integration-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.integration` | 否 | 基于 `@Integration` 注解的外部模组存在性、版本范围与物理端条件加载框架 |
| **[Math](./math/)** | `anvillib-math-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.math` | 否 | 可序列化数学表达式树、Flat 文本双向解析与自校验回写、变参自定义函数与双注册表 |
| **[Moveable Entity Block](./moveable-entity-block/)** | `anvillib-moveable-entity-block-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.piston` | **是** | 允许带 `BlockEntity` 的方块被活塞推动并保留 NBT 状态与移动渲染数据 |
| **[Multiblock](./multiblock/)** | `anvillib-multiblock-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.multiblock` | 否 | 数据驱动的动态多方块结构定义、控制器注册、成形/解体状态管理与网络同步 |
| **[Network](./network/)** | `anvillib-network-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.network` | 否 | 面向 `PLAY` / `CONFIGURATION` / `COMMON` 阶段的数据包方向接口与 `@Network` 自动扫描注册 |
| **[Recipe](./recipe/)** | `anvillib-recipe-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.recipe` | **是** | 世界内配方系统：Trigger 触发器、方块/物品/实体 Predicate、Outcome 产出与 `ItemBatchPlan` 容量受限批次规划 |
| **[Registrum](./registrum/)** | `anvillib-registrum-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.registrum` | 否 | 链式注册与 Datagen 联动框架，覆盖方块、物品、创造标签页变体选择器、实体、流体、组件与附件等 |
| **[Rendering](./rendering/)** | `anvillib-rendering-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.rendering` | 否 | 全息结构投影渲染系统（`ProjectionScene`、`ProjectionRenderer`、`ProjectionFeatures`、`ProjectionOverlay`） |
| **[RPC](./rpc/)** | `anvillib-rpc-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.rpc` | 否 | 基于 `@RemoteCallable` 与方法引用的跨端远程过程调用、返回值异步回调与参数校验框架 |
| **[Space Select](./space-select/)** | `anvillib-space-select-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.space_select` | 否 | 三维选区 (`District`) 管理、选区工具物品、客户端滚轮缩放与线框渲染 |
| **[Sync](./sync/)** | `anvillib-sync-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.sync` | 否 | 基于 `@Sync` / `@LazySync` 注解与编译期字节码注入 (`anvillib-sync-processor-neoforge-1.21.1`) 的字段自动同步 |
| **[UI](./ui/)** | `anvillib-ui-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.ui` | 否 | 九宫格/三切片柔性控件渲染库：支持亮/暗主题、五态交互变体、透明度、指针箭头、按钮与弹出层 |
| **[Util](./util/)** | `anvillib-util-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.util` | 否 | 集合/数学/体素形状/物品栏工具、`FlattenLoop` 多维循环扁平化、组件信息封装、谓词模型与 `UnlimitedItemStack` |
| **[Wheel](./wheel/)** | `anvillib-wheel-neoforge-1.21.1` | `dev.anvilcraft.lib.v2.wheel` | 否 | 客户端轮盘菜单 API：支持 `TAP` / `HOLD` 模式、自动分页、子菜单跳转与毛玻璃圆盘渲染 |
