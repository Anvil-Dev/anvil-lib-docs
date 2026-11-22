# Collections, Math, Shapes & Inventory Utilities

`module.util` is AnvilLib's cross-module foundational utility module, encapsulating collection helpers, vector math, `VoxelShape` rotation/mirroring, 3D outline extraction, player/compat inventory queries, and standard lifecycle & scrolling utilities.

## Module Info

- Mod ID: `anvillib_util` (`AnvilLibUtil.MOD_ID`)
- Main namespace: `anvillib` (`AnvilLibUtil.MAIN_ID`, resource helper: `AnvilLibUtil.of(String path)`)

## General Utilities & Conversions: `Util`, `DistExecutor`, `ClientTickRecorder`, `Lazy`, `ISerializer`

### `Util` Core Static Helpers

| Method / Constant | Description |
| --- | --- |
| `Util.CORNER_DIRECTIONS` | `Direction[][]` 2D constant array describing the direction combinations for the 8 cube corners |
| `Util.isLoaded(String modId)` | Checks whether `modId` is loaded in `ModList` |
| `Util.isClient()` / `Util.isServer()` | Determines logical side based on environment / active server or client thread |
| `Util.intoOptional(C collection)` | Wraps as `Optional.of(collection)` if non-empty, else `Optional.empty()` |
| `Util.acceptDirections(BlockPos pos, Consumer<BlockPos> consumer)` | Invokes `consumer` on the 6 orthogonal neighbor coordinates around `pos` |
| `Util.cast(Object o)` / `castSafely(@Nullable Object, Class<T>)` | Safe or unchecked generic downcast |
| `Util.instanceOfAny(@Nullable Object, Class<?>... classes)` | Checks whether an object is an instance of any candidate class |
| `Util.ifCastable(@Nullable Object, Class<T>, Consumer<T>)` | Runs `consumer` if the object matches the target class |
| `Util.run(T value, Consumer<T> consumer)` | Fluent scope helper (like Kotlin `.apply {}`): runs `consumer` and returns `value` |
| `Util.throwE(E throwable)` | Generically rethrows a checked exception without wrapping |

### `DistExecutor` & `ClientTickRecorder` & `Lazy` & `ISerializer`

- `DistExecutor.run(Dist expectedDist, Supplier<Runnable> supplier)`: runs the callback only on the expected physical side, preventing servers from touching client-only classes.
- `ClientTickRecorder`: tracks global client animation ticks (`onTick(ClientTickEvent.Pre)`, `onClientExit(ClientPlayerNetworkEvent.LoggingOut)`).
- `Lazy<T>`: lightweight single-threaded lazy evaluation container (`isGotten()` and `get()`).
- `ISerializer<T>`: general serialization strategy marker interface.

## Collections & Lists: `CollectionUtil` & `ListUtil`

| Class | Method Signatures | Description |
| --- | --- | --- |
| `CollectionUtil` | `allMatch(Collection<T>, Predicate<T>)` / `anyMatch(...)` | Fast condition matching over any collection |
| `CollectionUtil` | `newMultimap(M emptyMap, Collection<V> values, Function<V, K> keyFactory)` | Groups a flat collection into a target `Multimap` by extracted keys |
| `CollectionUtil` | `newLinkedList(int ignored)` / `@Nullable get(SequencedCollection<T>, int index)` | Creates a linked list or safely reads an element by index from a sequenced collection (`null` if out of bounds) |
| `ListUtil` | `safelyGet(List<T> list, int index)` | Safe indexed access returning `Optional.empty()` when out of bounds |
| `ListUtil` | `cycle(List<T> original, int times)` | Cyclically shifts list elements |
| `ListUtil` | `createWithValues(int size, IntFunction<T> valueFac)` | Builds a fixed-size list from an index generator |
| `ListUtil` | `cast(List<T> original, Class<R> clazz)` | Filters and casts to a subtype list |
| `ListUtil` | `equals(List<T> first, List<U> second, BiPredicate<T, U> equals)` | Order-preserving comparison across two lists of different generic types |

## Math & Random Providers: `MathUtil` & `NumberProviderUtil`

### `MathUtil` (`dev.anvilcraft.lib.v2.util.MathUtil`)

- **2D vector rotation & angles**: `rotationDegrees(Vector2f v, float deg)`, `rotate(Vector2f v, float rad)`, `copy(Vector2f v)`, `angle(Vector2f from, Vector2f to)`, `angleDegrees(Vector2f from, Vector2f to)`
- **Ranges & discrete directions**: `isInRange(value, min, max)`, `isInRange(x, y, minX, minY, maxX, maxY)`, `dist(BlockPos a, BlockPos b)`, `getDirection(BlockPos from, BlockPos to)` (`null` if not purely axial)
- **Division & wrapping**: `safeDiv(float a, float b)` / `safeDiv(double a, double b)` (returns safe default on divide-by-zero), `clampWithProportion(float value, float min, float max)`

### `NumberProviderUtil`

Statically derives statistical bounds from vanilla loot `NumberProvider`s (commonly used for recipe viewer expected output ranges):
- `NumberProviderUtil.expected(NumberProvider)`: computes expected value;
- `NumberProviderUtil.min(NumberProvider)` / `NumberProviderUtil.max(NumberProvider)`: computes theoretical min/max.

## Collision Geometry & Outline Extraction: `ShapeUtil`, `OutlineUtil` & `Line`

### `ShapeUtil`

- **Boolean clipping & union**: `cut(VoxelShape base, VoxelShape... cutters)`, `cut(AABB base, AABB... cutters)`, `merge(VoxelShape... shapes)`, `merge(AABB... shapes)`, `box(AABB shape)`;
- **Multi-threaded joining**: `threadedJoin(...)` (uses `Callable<VoxelShape>`) to merge large complex voxel shapes;
- **Rotation & mirroring**: `rotate(Direction.Axis axis, float angle, VoxelShape / AABB / AABB[])`, `mirror(Direction.Axis axis, VoxelShape / AABB / AABB[])`.

### `OutlineUtil` & `Line`

Merges a set of adjacent `AABB`s into a list of outer contour edge segments only, eliminating z-fighting from overlapping box faces:
- `OutlineUtil.extractOutline(List<AABB> boxes[, @Nullable Executor executor])` returns `List<Line>` (pass an executor for parallel processing of large volumes).
- `Line(Vec3 start, Vec3 end, int thickness, float length)` provides convenient constructors and writes line vertices directly to `RenderType.lines()` via `line.render(PoseStack / PoseStack.Pose, VertexConsumer vertex, Vec3 camera, int color)`.

## Inventory & Compat Accessory Queries: `InventoryUtil` & Scrolling: `Scrollable`

### `InventoryUtil`

| Method Signature | Description |
| --- | --- |
| `getFirstItem(Inventory inv, ItemLike / Supplier<ItemLike> / Predicate<ItemStack>)` | Finds the first matching item by filter, returning `ItemStack.EMPTY` if not found |
| `getItems(Inventory inv[, Predicate<ItemStack> filter])` | Collects all matching items from offhand (`SLOT_OFFHAND`), main inventory, and armor slots in order |
| `hasItem(Inventory inv, Item / Supplier<ItemLike>)` | Quickly checks whether the player's inventory contains a specific item |
| `insertItem(Inventory inv, ItemStack stack)` | Attempts to insert an item into the inventory (merging stacks and filling empty slots), returning any leftover `ItemStack` |
| `getCompatItems(LivingEntity living)` / `getItemInCompat(...)` / `hasItemInCompat(...)` | Queries third-party accessory slots (e.g., Curios/Accessories integration hook) via static `InventoryUtil.compatConsumer` |

### `Scrollable`

Abstract GUI grid scrollbar base class: subclasses only implement `row()`, `column()`, `size()`, and `setHead(int head)` to get out-of-the-box `calculateRowCount()`, `getRowIndex()`, `calculateScroll(int rowIndex)`, `subtractInputFromScroll(double)`, `scrollTo()`, `scrollOnDrag(...)`, `scrollOnScroll(double)`, `scrolling()`, `notScrolling()`, `reset()`, and `canScroll()`.

```java
// Example: extract merged clean wireframes from multiple adjacent AABBs and render
List<AABB> boxes = List.of(
    new AABB(0, 0, 0, 1, 1, 1),
    new AABB(1, 0, 0, 2, 1, 1)
);
List<Line> cleanOutline = OutlineUtil.extractOutline(boxes);
for (Line line : cleanOutline) {
    line.render(poseStack, lineBuffer, cameraPos, 0xFFFFFFFF);
}
```
