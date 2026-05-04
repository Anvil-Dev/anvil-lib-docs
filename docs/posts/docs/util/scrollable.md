# 带滚动 UI

`dev.anvilcraft.lib.v2.util.Scrollable` 是一个抽象类，用于实现带滚动功能的 UI 列表。

**核心方法**：

- `calculateRowCount()` – 根据 `size()` / `column()` 计算可滚动行数
- `getRowIndex()` – 当前滚动位置对应的行索引
- `scrollOnDrag(barHeight, mouseY, top, bottom)` – 拖拽滚动条时更新位置
- `scrollOnScroll(scrollY)` – 鼠标滚轮输入
- `reset()` – 滚动回顶部
- `canScroll()` – 是否有足够内容需要滚动

**需要实现的抽象方法**：

- `row()` – 可见行数
- `column()` – 每行列数
- `size()` – 总元素数
- `setHead(int head)` – 设置当前显示的起始下标（根据滚动位置更新列表数据）
