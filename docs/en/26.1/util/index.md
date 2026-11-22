# Util General Utilities: Collections, Math, Geometry & Inventory (`module.util`)

<BranchContextCard branch="26.1" />

`module.util` (artifact `anvillib-util-neoforge-26.1`, package `dev.anvilcraft.lib.v2.util`) is the foundational utility library shared across AnvilLib modules and downstream mods, covering collection and list helpers, 2D/3D vector and range math, multi-threaded VoxelShape boolean merging and rotation/mirroring, large-scale AABB outer outline extraction (`OutlineUtil`), inventory lookup and compat insertion, multi-line localizable component building, block/item/NBT predicates, and `UnlimitedItemStack`.

This module is split into 5 sub-documents by functional domain:
- **This page (Core, Collections, Math, Shapes & Inventory)**: Covers `AnvilLibUtil`, `Util`, `CollectionUtil`, `ListUtil`, `MathUtil`, `ShapeUtil`, `OutlineUtil`, `Line`, `InventoryUtil`, `NumberProviderUtil`, `DistExecutor`, `Lazy`, `ISerializer`, `Scrollable`, and `ClientTickRecorder`.
- **[Flattened Multi-Dimensional Loop (FlattenLoop)](./flatten-loop)**: Covers `FlattenLoop` 2D–8D Cartesian product flattened iteration and early-termination cursor APIs.
- **[Multi-Line Component Info & Tooltip Utilities](./components)**: Covers `ComponentUtil`, `TooltipUtil`, `IComponentInfo`, `DirectInfo`, `LiteralInfo`, `TranslatableInfo`, and `MultilineComponentHelper`.
- **[Block, Item & NBT Predicates and Probability Models](./predicates)**: Covers `BlockStatePredicate`, `ChanceBlockState`, `WeightedChanceBlockStates`, `ChanceItemStack`, `IItemStackPredicate`, `ItemPredicate`, `ItemIngredientPredicate`, and `NbtPredicate`.
- **[Nullness Functional Interfaces & UnlimitedItemStack](./nullness-and-stack)**: Covers `dev.anvilcraft.lib.v2.util.nullness.*` and `UnlimitedItemStack`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.1`, this module is included automatically. To depend on `util` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-util-neoforge-26.1:2.0.0")
}
```

---

## 2. Core Geometry & Outline Highlights (`ShapeUtil` & `OutlineUtil`)

### 1. `ShapeUtil`: 16× Pixel-Space VoxelShape Rotation, Mirroring & Multi-Threaded Merging

When authoring directional blocks (4-way horizontal or 6-way facing), manually recalculating rotated `Block.box(minX, minY, minZ, maxX, maxY, maxZ)` coordinates is tedious. `ShapeUtil` provides counterclockwise rotation around block center `(8, 8, 8)` via `rotate(axis, angle, shape)`, axial mirroring via `mirror(axis, shape)`, boolean subtraction `cut(base, cutters...)`, union `merge(shapes...)`, and thread-pool divide-and-conquer merging `threadedJoin(shapes, BooleanOp, executor)`.

### 2. `OutlineUtil`: Exact Outer Contour Extraction for Arbitrary Overlapping AABBs

When you have dozens or thousands of adjacent/overlapping `AABB`s (e.g., multiblock highlights or vein-mining previews), drawing all 12 edges of each `AABB` creates cluttered internal grid lines on shared faces. `OutlineUtil.extractOutline(boxes)` uses 3-axis plane sweep and 2D discrete grid `BitSet` XOR to **remove all internal flush faces and edges, automatically merging collinear connected outer edges into maximal `List<Line>` segments** (automatically parallelizing across 3 axes when `boxes.size() >= 1024`)!

### 3. Code Example: Rotating Block Shapes & Extracting Merged Multiblock Outlines

```java
package com.example.mymod.util;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.anvilcraft.lib.v2.util.OutlineUtil;
import dev.anvilcraft.lib.v2.util.ShapeUtil;
import dev.anvilcraft.lib.v2.util.client.Line;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.List;

public final class GeometryUtilExample {
    // 1. Define a north-facing L-shaped base hitbox and generate the east-facing (90° Y-rotation) VoxelShape
    public static final VoxelShape SHAPE_NORTH = ShapeUtil.merge(
        Block.box(0, 0, 0, 16, 4, 16),
        Block.box(2, 4, 10, 14, 16, 16)
    );
    public static final VoxelShape SHAPE_EAST = ShapeUtil.rotate(Direction.Axis.Y, 90.0f, SHAPE_NORTH);

    // 2. Extract merged outer contour segments for adjacent blocks (internal coplanar edges removed automatically)
    public static List<Line> buildMergedOutline(List<BlockPos> positions) {
        List<AABB> boxes = positions.stream()
            .map(AABB::new)
            .toList();
        return OutlineUtil.extractOutline(boxes);
    }

    // 3. Render the extracted Line list on the client
    public static void renderLines(PoseStack poseStack, VertexConsumer lineBuffer, Vec3 cameraPos, List<Line> lines) {
        PoseStack.Pose lastPose = poseStack.last();
        for (Line line : lines) {
            line.render(lastPose, lineBuffer, cameraPos, 0xFF00E5FF);
        }
    }
}
```

---

## 3. Public Utility Classes API Reference

### 1. `Util`, `DistExecutor`, `Lazy<T>`, `ISerializer<T>` & `ClientTickRecorder`

| Class / Interface | Method Signatures | Description |
| :--- | :--- | :--- |
| **`Util`** | • `public static final Direction[][] CORNER_DIRECTIONS`<br>• `public static boolean isLoaded(String modId)`<br>• `public static boolean isClient()` (checks `FMLEnvironment.getDist() == Dist.CLIENT`)<br>• `public static boolean isServer()` (checks whether current thread group is `SidedThreadGroups.SERVER`)<br>• `public static void acceptDirections(BlockPos pos, Consumer<BlockPos> consumer)` (visits 6 orthogonal + 8 planar diagonal + 12 3D corner neighbors around `pos`, 26 total)<br>• `public static <E, C extends Collection<E>> Optional<C> intoOptional(C collection)`<br>• `public static <T> T cast(Object o)`<br>• `public static <T> Optional<T> castSafely(@Nullable Object o, Class<T> clazz)`<br>• `public static boolean instanceOfAny(@Nullable Object o, Class<?>... classes)`<br>• `public static <T> void ifCastable(@Nullable Object o, Class<T> clazz, Consumer<T> action)`<br>• `public static <T> T run(T value, Consumer<T> consumer)`<br>• `public static <T, E extends Throwable> T throwE(E throwable)` | General foundational utilities. |
| **`DistExecutor`** | `public static void run(Dist expectedDist, Supplier<Runnable> supplier)` | Executes `supplier.get().run()` when the physical side equals `expectedDist`. |
| **`Lazy<T>`** | `public Lazy(Supplier<T> supplier)` / `public boolean isGotten()` / `public T get()` | Thread-safe double-checked/synchronized lazy wrapper. |
| **`ISerializer<T>`** | `MapCodec<T> codec()` / `StreamCodec<RegistryFriendlyByteBuf, T> streamCodec()` | Unified serialization interface providing both `MapCodec` and `StreamCodec`. |
| **`ClientTickRecorder`** | `public static int getTicks()` | Client global tick counter incremented every non-paused tick (resets every `1,728,000` ticks = 24h to preserve float precision, and resets to 0 on world exit). |

### 2. `CollectionUtil` & `ListUtil` (Collection & List Utilities)

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| **`CollectionUtil`** | • `<T> boolean allMatch(Collection<T> collection, Predicate<T> matcher)`<br>• `<T> boolean anyMatch(Collection<T> collection, Predicate<T> matcher)`<br>• `<K, V, M extends Multimap<K, V>> M newMultimap(M emptyMap, Collection<V> values, Function<V, K> keyFactory)`<br>• `<T> LinkedList<T> newLinkedList(int ignored)`<br>• `<T> @Nullable T get(SequencedCollection<T> collection, int index)` | Allocation-free collection predicates and index lookup helpers. |
| **`ListUtil`** | • `<T> Optional<T> safelyGet(List<T> list, int index)`: returns `Optional.empty()` on out-of-bounds or `null` element<br>• `<T> List<T> cycle(List<T> original, int times)`: returns a new list cyclically shifted by `times`<br>• `<T> List<T> createWithValues(int size, IntFunction<T> valueFac)`<br>• `<T, R extends T> List<R> cast(List<T> original, Class<R> clazz)`: filters and casts to subtype list<br>• `<T, U> boolean equals(List<T> first, List<U> second, BiPredicate<T, U> equals)` | Safe list access, cyclic rotation, and custom equality helpers. |

### 3. `MathUtil` & `NumberProviderUtil` (Math & Loot Value Expectation Utilities)

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| **`MathUtil`** | • `Vector2f rotate(Vector2f v, float radians)` / `Vector2f rotationDegrees(Vector2f v, float deg)` / `Vector2f copy(Vector2f v)`<br>• `float angle(Vector2f from, Vector2f to)` (radians) / `float angleDegrees(Vector2f from, Vector2f to)`<br>• `boolean isInRange(double value, double min, double max)` (open interval `(min, max)`, auto-swaps if `min > max`)<br>• `boolean isInRange(double vx, double vy, double minX, double minY, double maxX, double maxY)`<br>• `Vec3i dist(BlockPos a, BlockPos b)` / `@Nullable Direction getDirection(BlockPos from, BlockPos to)`<br>• `float safeDiv(float a, float b)` / `double safeDiv(double a, double b)` (returns `0` when divisor is `0`)<br>• `float clampWithProportion(float value, float min, float max)` (wraps out-of-range values back into `[min, max]` periodically) | 2D vector rotation/angles, range checks, and safe division utilities. |
| **`NumberProviderUtil`** | • `double expected(NumberProvider provider)`<br>• `double max(NumberProvider provider)`<br>• `double min(NumberProvider provider)` | Computes expected value, max, and min for vanilla `ConstantValue`, `UniformGenerator` (`(min+max)/2`), and `BinomialDistributionGenerator` (`n*p`) (returns `-1` for unknown types). Widely used for JEI recipe probability and average output display. |

### 4. `ShapeUtil`, `OutlineUtil` & `Line` (Geometry & Outline Utilities)

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| **`ShapeUtil`** | • `VoxelShape box(AABB shape)` (converts `[0, 16]` pixel-space `AABB` to `Block.box`)<br>• `VoxelShape merge(VoxelShape... shapes)` / `VoxelShape merge(AABB... shapes)`<br>• `VoxelShape cut(VoxelShape base, VoxelShape... cutters)` / `VoxelShape cut(AABB base, AABB... cutters)`<br>• `VoxelShape rotate(Direction.Axis axis, float angle, VoxelShape shape)` / `AABB rotate(axis, angle, AABB)` / `AABB[] rotate(axis, angle, AABB...)`<br>• `VoxelShape mirror(Direction.Axis axis, VoxelShape shape)` / `AABB mirror(axis, AABB)` / `AABB[] mirror(axis, AABB...)`<br>• `Future<VoxelShape> threadedJoin(List<VoxelShape> shapes, BooleanOp function, ExecutorService executor)` | Block hitbox boolean ops, rotation, mirroring, and parallel merging (`AABB` overloads use `0..16` pixel coordinates). |
| **`OutlineUtil`** | • `public static List<Line> extractOutline(List<AABB> boxes)`<br>• `public static List<Line> extractOutline(List<AABB> boxes, @Nullable Executor executor)` | Extracts merged outer contour lines with internal overlaps removed (parallel threshold configurable via `-Danvillib.outline.parallelThreshold=1024`). |
| **`Line`** | `public record Line(Vec3 start, Vec3 end, int thickness, float length)`<br>`public void render(PoseStack.Pose pose, VertexConsumer vertex, Vec3 camera, int color)` | 3D line segment record (default `thickness = 4`) with a `render` method writing camera-relative vertices and normals to `RenderTypes.lines()`. |

### 5. `InventoryUtil` & `Scrollable`

| Class | Method Signatures | Description |
| :--- | :--- | :--- |
| **`InventoryUtil`** | • `public static BiConsumer<ArrayList<ItemStack>, LivingEntity> compatConsumer`<br>• `ItemStack getFirstItem(Inventory, ItemLike / Supplier<ItemLike> / Predicate<ItemStack>)`<br>• `List<ItemStack> getItems(Inventory)` / `List<ItemStack> getItems(Inventory, Predicate<ItemStack>)`<br>• `boolean hasItem(Inventory, Item / Supplier<ItemLike>)`<br>• `ArrayList<ItemStack> getCompatItems(LivingEntity)` / `ItemStack getItemInCompat(LivingEntity, Predicate<ItemStack>)` / `boolean hasItemInCompat(LivingEntity, Predicate<ItemStack>)`<br>• `ItemStack insertItem(Inventory inventory, ItemStack stack)` | Player inventory lookup, third-party accessory inventory lookup (extensible via `compatConsumer` for Curios/Accessories), and item insertion that auto-syncs `ClientboundContainerSetSlotPacket`. |
| **`Scrollable`** | Abstract methods: `int row()`, `int column()`, `int size()`, `void setHead(int head)`;<br>Utility methods: `canScroll()`, `calculateRowCount()`, `getRowIndex()`, `scrollOnDrag(float barHeight, double mouseY, int top, int bottom)`, `scrollOnScroll(double scrollY)`, `scrolling()`, `notScrolling()`, `reset()` | Base class for grid/list scrollbar math. Subclasses only implement visible `row()`, `column()`, total `size()`, and `setHead(int)` to update the leading index. |
