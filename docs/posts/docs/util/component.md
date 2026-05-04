# 文本组件 Util 与 工具提示 Util

## ComponentUtil

`dev.anvilcraft.lib.v2.util.ComponentUtil` 提供文本组件常用工具：

- 静态常量：`TAB`, `LF`, `SPLITTER`, `LIST_HEAD`, `LIST_TAIL`, `ITEM_HEAD`, `ITEM_TAIL`
- `argValidate(Object)` – 将任意类型转为 `Component`（支持 String, Number, Date, UUID, Identifier 等）
- `argsValidate(Object...)` – 批量转换
- `dimension(ResourceKey<Level>)` – 生成维度翻译键组件
- `findPlayerName(CachedUserNameToIdResolver, UUID)` – 根据 UUID 查找玩家名称组件

## TooltipUtil

`dev.anvilcraft.lib.v2.util.TooltipUtil`：

- `tooltip(Block)` – 生成基础方块工具提示（名称、注册名、模组名）
- `recipeIDTooltip(Block, Identifier)` – 添加合成配方 ID 的行
