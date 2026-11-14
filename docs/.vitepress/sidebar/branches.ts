import type { DefaultTheme } from 'vitepress'

export type BranchId =
  | '1.21.1'
  | '1.21.4'
  | '1.21.8'
  | '1.21.11'
  | '26.1'
  | '26.2'
  | '26.3'

export interface BranchMeta {
  id: BranchId
  gitBranch: string
  minecraft: string
  neoforge: string
  javaVersion: number
  renderingTier: 'projection-only' | 'sdf-blur-projection' | 'full-alr'
}

export const BRANCHES: readonly BranchMeta[] = [
  {
    id: '26.3',
    gitBranch: 'dev/26.3',
    minecraft: '26.3',
    neoforge: '26.3.x',
    javaVersion: 25,
    renderingTier: 'full-alr'
  },
  {
    id: '26.2',
    gitBranch: 'dev/26.2',
    minecraft: '26.2',
    neoforge: '26.2.x',
    javaVersion: 25,
    renderingTier: 'full-alr'
  },
  {
    id: '26.1',
    gitBranch: 'dev/26.1',
    minecraft: '26.1.2',
    neoforge: '26.1.2.x',
    javaVersion: 25,
    renderingTier: 'full-alr'
  },
  {
    id: '1.21.11',
    gitBranch: 'dev/1.21.11',
    minecraft: '1.21.11',
    neoforge: '21.11.x',
    javaVersion: 21,
    renderingTier: 'sdf-blur-projection'
  },
  {
    id: '1.21.8',
    gitBranch: 'dev/1.21.8',
    minecraft: '1.21.8',
    neoforge: '21.8.x',
    javaVersion: 21,
    renderingTier: 'sdf-blur-projection'
  },
  {
    id: '1.21.4',
    gitBranch: 'dev/1.21.4',
    minecraft: '1.21.4',
    neoforge: '21.4.x',
    javaVersion: 21,
    renderingTier: 'projection-only'
  },
  {
    id: '1.21.1',
    gitBranch: 'dev/1.21.1',
    minecraft: '1.21.1',
    neoforge: '21.1.x',
    javaVersion: 21,
    renderingTier: 'projection-only'
  }
] as const

export function createBranchSidebar(meta: BranchMeta): DefaultTheme.SidebarItem[] {
  const base = `/${meta.id}`

  const renderingItems: DefaultTheme.SidebarItem[] =
    meta.renderingTier === 'projection-only'
      ? [
          { text: '模块概述与接入', link: `${base}/rendering/` },
          { text: '结构投影场景与网格 (ProjectionScene / Mesh)', link: `${base}/rendering/projection-scene` },
          { text: '投影渲染器与覆盖层 (ProjectionRenderer / Overlay)', link: `${base}/rendering/projection-renderer` },
          { text: '结构只读沙盒与界面预览 (Preview)', link: `${base}/rendering/structure-preview` }
        ]
      : meta.renderingTier === 'sdf-blur-projection'
        ? [
            { text: '模块概述与渲染管线 (ALRPipelines)', link: `${base}/rendering/` },
            { text: '结构投影渲染系统 (Projection)', link: `${base}/rendering/projection` },
            { text: '结构只读沙盒与界面预览 (Preview)', link: `${base}/rendering/structure-preview` },
            { text: '2D SDF 矢量图形渲染 (SdfGraphics / Sdf2d)', link: `${base}/rendering/sdf` },
            { text: '高斯模糊与 UBO 缓冲布局 (Blur & Buffers)', link: `${base}/rendering/buffers-and-blur` },
            { text: 'GUI 渲染状态扩展 (GuiRenderState)', link: `${base}/rendering/gui-state` }
          ]
        : [
            { text: '模块概述与核心入口', link: `${base}/rendering/` },
            { text: 'Blaze3D 扩展与计算着色器 (Compute & Bindless)', link: `${base}/rendering/blaze3d-compute` },
            { text: '缓冲布局与 GPU 资源池 (Buffers & Foundation)', link: `${base}/rendering/buffers-foundation` },
            { text: '后处理管线：泛光、高斯模糊与故障效果', link: `${base}/rendering/post-effects` },
            { text: '缓存方块实体渲染 (CachedBER)', link: `${base}/rendering/cached-ber` },
            { text: '遮挡剔除系统 (Hi-Z & GPU Query Occlusion)', link: `${base}/rendering/occlusion-culling` },
            { text: '结构投影渲染系统 (Projection)', link: `${base}/rendering/projection` },
            { text: '结构只读沙盒与界面预览 (Preview)', link: `${base}/rendering/structure-preview` },
            { text: '2D SDF 矢量图形渲染 (SdfGraphics)', link: `${base}/rendering/sdf` },
            { text: 'GUI 画中画渲染与假世界 (PiP & FakeDisplayLevel)', link: `${base}/rendering/gui-and-fakeworld` }
          ]

  return [
    {
      text: `Main 与快速开始 (${meta.gitBranch})`,
      collapsed: false,
      items: [
        { text: '分支概览与模块矩阵', link: `${base}/` },
        { text: '依赖引入与构建配置 (Main)', link: `${base}/getting-started` }
      ]
    },
    {
      text: 'Codec 数据编解码',
      collapsed: false,
      items: [
        { text: 'CodecUtil 与 StreamCodecUtil 详解', link: `${base}/codec/` }
      ]
    },
    {
      text: 'Collision 碰撞检测工具',
      collapsed: false,
      items: [
        { text: 'AABB 与三角形 SAT 碰撞检测', link: `${base}/collision/` }
      ]
    },
    {
      text: 'Config 注解配置系统',
      collapsed: false,
      items: [
        { text: '配置声明、注解与生命周期', link: `${base}/config/` },
        { text: '客户端配置界面与侧栏样式', link: `${base}/config/client-screen` },
        { text: '语言文件生成与枚举本地化', link: `${base}/config/datagen-and-util` }
      ]
    },
    {
      text: 'Cube 斜棱线与精确拾取',
      collapsed: false,
      items: [
        { text: '模块概述、事件与目标排除规则', link: `${base}/cube/` },
        { text: '精确拾取与动态部件提供器', link: `${base}/cube/picking-and-selection` },
        { text: '模型捕获、解码与几何轮廓缓存', link: `${base}/cube/model-and-geometry` }
      ]
    },
    {
      text: 'Explosion 爆炸系统',
      collapsed: false,
      items: [
        { text: 'ExplosionExecutor 与 ExplosionSession', link: `${base}/explosion/` }
      ]
    },
    {
      text: 'Font 字体与 SDF 文本渲染',
      collapsed: false,
      items: [
        { text: '字体管理、配置与 GuiGraphics 扩展', link: `${base}/font/` },
        { text: 'SDF 字形图集与文本排版渲染', link: `${base}/font/sdf-renderer` },
        { text: '字体配置与测试界面组件', link: `${base}/font/screens` }
      ]
    },
    {
      text: 'Integration 模组兼容集成',
      collapsed: false,
      items: [
        { text: '@Integration 注解与生命周期钩子', link: `${base}/integration/` }
      ]
    },
    {
      text: 'Math 数学表达式系统',
      collapsed: false,
      items: [
        { text: '表达式模型、Flat 语法与 Codec', link: `${base}/math/` },
        { text: '函数体系、变参、内建函数与注册表', link: `${base}/math/functions-and-registries` }
      ]
    },
    {
      text: 'Moveable Entity Block 活塞移动方块实体',
      collapsed: false,
      items: [
        { text: 'IMoveableEntityBlock 与渲染状态扩展', link: `${base}/moveable-entity-block/` }
      ]
    },
    {
      text: 'Multiblock 动态多方块系统',
      collapsed: false,
      items: [
        { text: '多方块定义、构建器与数据包注册', link: `${base}/multiblock/` },
        { text: '控制器、成形状态与动态管理器', link: `${base}/multiblock/controller-and-state` },
        { text: '多方块事件与网络同步包', link: `${base}/multiblock/events-and-network` }
      ]
    },
    {
      text: 'Network 网络通信框架',
      collapsed: false,
      items: [
        { text: '数据包接口与方向模型', link: `${base}/network/` },
        { text: '@Network 注解、自动注册与工具方法', link: `${base}/network/registrar-and-util` }
      ]
    },
    {
      text: 'Recipe 世界内配方系统',
      collapsed: false,
      items: [
        { text: '系统架构、InWorldRecipe 与构建器', link: `${base}/recipe/` },
        { text: '配方触发器 (IRecipeTrigger) 与内置触发', link: `${base}/recipe/triggers` },
        { text: '方块、物品与实体谓词 (IRecipePredicate)', link: `${base}/recipe/predicates` },
        { text: '配方输出、属性映射与批次规划 (Outcome & BatchPlan)', link: `${base}/recipe/outcomes` },
        { text: '世界状态缓存系统 (Block / Item / Entity Cache)', link: `${base}/recipe/caches` },
        { text: '配方上下文、优先级、事件与扩展接口', link: `${base}/recipe/context-and-events` }
      ]
    },
    {
      text: 'Registrum 注册与数据生成',
      collapsed: false,
      items: [
        { text: '核心架构：Registrum 与 RegistryEntry', link: `${base}/registrum/` },
        { text: '方块与方块实体构建器 (Block & BlockEntity)', link: `${base}/registrum/block-and-be` },
        { text: '物品、创造模式标签页与分组变体选择器', link: `${base}/registrum/item-and-creativetab` },
        { text: '实体、流体、菜单、状态效果与药水音效构建器', link: `${base}/registrum/entity-fluid-menu` },
        { text: '村民、生物群系、数据组件、附件与修改器构建器', link: `${base}/registrum/data-villager-modifier` },
        { text: '数据生成連携：模型、配方、战利品表、标签与语言', link: `${base}/registrum/datagen-providers` }
      ]
    },
    {
      text: 'Rendering 渲染扩展系统',
      collapsed: false,
      items: renderingItems
    },
    {
      text: 'RPC 跨端远程过程调用',
      collapsed: false,
      items: [
        { text: '@RemoteCallable 声明、方法引用与 RPC 调用', link: `${base}/rpc/` },
        { text: '方法引用、校验器与配置同步', link: `${base}/rpc/refs-and-validation` }
      ]
    },
    {
      text: 'Space Select 空间区域选择',
      collapsed: false,
      items: [
        { text: '区域模型 (District)、选择器物品与管理器', link: `${base}/space-select/` },
        { text: '客户端区域渲染、滚轮控制、事件与网络', link: `${base}/space-select/client-and-events` }
      ]
    },
    {
      text: 'Sync 字段自动同步框架',
      collapsed: false,
      items: [
        { text: '@Sync 与 @LazySync 注解及同步管理器', link: `${base}/sync/` },
        { text: 'Processor 编译期字节码转换与接入配置', link: `${base}/sync/processor-and-network` }
      ]
    },
    {
      text: 'UI 柔性控件库',
      collapsed: false,
      items: [
        { text: '精灵主题、五态变体与基础 Renderer', link: `${base}/ui/` },
        { text: '按钮与带指针浮窗渲染器', link: `${base}/ui/buttons-and-flyouts` }
      ]
    },
    {
      text: 'Util 通用工具库',
      collapsed: false,
      items: [
        { text: '集合、数学、几何形状与物品栏工具', link: `${base}/util/` },
        { text: '扁平化多维循环 (FlattenLoop)', link: `${base}/util/flatten-loop` },
        { text: '多行组件信息与 Tooltip 工具', link: `${base}/util/components` },
        { text: '方块、物品与 NBT 谓词及概率模型', link: `${base}/util/predicates` },
        { text: '非空函数式接口与无限物品栈', link: `${base}/util/nullness-and-stack` }
      ]
    },
    {
      text: 'Wheel 轮盘菜单客户端 API',
      collapsed: false,
      items: [
        { text: '轮盘模型构建、分页、子菜单与触发回调', link: `${base}/wheel/` },
        { text: '轮盘控制器、界面与毛玻璃渲染', link: `${base}/wheel/controller-and-screen` }
      ]
    }
  ]
}
