# Scrollable UI

`dev.anvilcraft.lib.v2.util.Scrollable` is an abstract class for implementing scrollable UI lists.

**Core methods**:

- `calculateRowCount()` – calculates the number of scrollable rows based on `size()` / `column()`
- `getRowIndex()` – the row index corresponding to the current scroll position
- `scrollOnDrag(barHeight, mouseY, top, bottom)` – updates the position when dragging the scroll bar
- `scrollOnScroll(scrollY)` – mouse wheel input
- `reset()` – scrolls back to the top
- `canScroll()` – whether there is enough content to require scrolling

**Abstract methods that must be implemented**:

- `row()` – number of visible rows
- `column()` – number of columns per row
- `size()` – total number of elements
- `setHead(int head)` – sets the starting index of the currently visible items (updates list data based on scroll position)
