# Collections, Math, Shapes & Inventory Utilities

`module.util` (Mod ID: `anvillib_util`) is the most foundational utility module in AnvilLib 1.21.1, providing thread-safe lazy loading, collection/list helpers, 2D vector/wrapping math, parallel outline extraction (`OutlineUtil`), multi-threaded VoxelShape boolean ops/rotation/mirroring (`ShapeUtil`), cross-mod accessory inventory lookup (`InventoryUtil`), scrollable UI base (`Scrollable`), and client render tick counter (`ClientTickRecorder`).

## Setup

### Gradle Repositories & Dependencies

Official releases are available on Maven Central, but `Cjsah Maven` with `exclusiveContent` filtering is recommended to avoid NeoForge Maven's incomplete Maven Central sync causing interface injection or transitive metadata errors:

```kotlin
repositories {
    exclusiveContent {
        forRepository {
            maven("https://server.cjsah.net:1002/maven/releases") {
                name = "Cjsah Maven"
            }
        }
        filter {
            includeGroup("dev.anvilcraft.lib")
        }
    }
    mavenCentral()
}

dependencies {
    implementation("dev.anvilcraft.lib:anvillib-neoforge-1.21.1:${anvillib_version}")
}
```

### Module Entry & Subpage Navigation

- **`AnvilLibUtil`**: `MAIN_ID = "anvillib"`, `MOD_ID = "anvillib_util"`, providing `AnvilLibUtil.of(String path)` to create `anvillib:<path>` resource locations (note: uses main namespace `anvillib`, not `anvillib_util`).
- Specialized sub-documents:
  - [Flattened Multi-Dimensional Loop (FlattenLoop)](./flatten-loop.md)
  - [Multi-Line Component Info & Tooltip Utilities](./components.md)
  - [Block, Item & NBT Predicates and Probability Models](./predicates.md)
  - [Nullness Functional Interfaces & UnlimitedItemStack](./nullness-and-stack.md)

## Core API Reference by Category

### 1. Environment Checks, Serialization & Lazy Loading

Package: `dev.anvilcraft.lib.v2.util`

#### `AnvilLibUtil`

| Member Signature | Description |
| --- | --- |
| `public static final String MAIN_ID = "anvillib"` | AnvilLib main namespace |
| `public static final String MOD_ID = "anvillib_util"` | Util module Mod ID |
| `static ResourceLocation of(String path)` | Creates `anvillib:<path>` `ResourceLocation` |

#### `Util`

| Method / Field Signature | Design Intent & Boundary Conditions |
| --- | --- |
| `public static final Direction[][] CORNER_DIRECTIONS` | `8 × 3` direction triple constants corresponding to the 3 orthogonal directions of each of a cube's 8 corners |
| `static boolean isLoaded(String modId)` | Checks whether the target mod is loaded via `ModList.get().isLoaded(modId)` |
| `static Function<InteractionResult, ItemInteractionResult> interactionResultConverter()` | Maps 1.21.1 block `InteractionResult` to `ItemInteractionResult` (`SUCCESS` -> `SUCCESS`, `FAIL` -> `FAIL`, etc.) |
| `static <E, C extends Collection<E>> Optional<C> intoOptional(C collection)` | Returns `Optional.empty()` when empty, or `Optional.of(collection)` when non-empty |
| `static void acceptDirections(BlockPos blockPos, Consumer<BlockPos> blockPosConsumer)` | Visits all **26 neighbor coordinates** at Chebyshev distance 1 around `blockPos` (6 faces + 12 edges + 8 corners), **excluding the center itself** |
| `static boolean isClient()` | Checks `FMLEnvironment.dist.isClient()` |
| `static boolean isServer()` | Checks `FMLEnvironment.dist.isDedicatedServer()` |
| `static <T> T cast(Object o)` | Unchecked generic cast `(T) o` (caller guarantees type safety) |
| `static <T> Optional<T> castSafely(@Nullable Object o, Class<T> clazz)` | Safe cast based on `clazz.isInstance(o)` |
| `static boolean instanceOfAny(@Nullable Object o, Class<? extends Object>... classes)` | Checks whether `o` is an instance of any given class; returns `false` if `o == null` |
| `static <T> void ifCastable(@Nullable Object o, Class<T> clazz, Consumer<T> action)` | Executes `action` if `o` is an instance of `clazz` |
| `static <T> T run(T value, Consumer<T> consumer)` | Runs config callback on `value` and returns `value` unchanged (Kotlin `apply` style) |
| `static <T, E extends Throwable> T throwE(E throwable) throws E` | Generically throws a checked/unchecked exception (usable in expression branches) |

#### `DistExecutor`, `Lazy<T>` & `ISerializer<T>`

| Class / Interface & Signature | Design Intent & Boundary Conditions |
| --- | --- |
| `DistExecutor.run(Dist expectedDist, Supplier<Runnable> supplier)` | Runs `supplier.get().run()` only when `FMLEnvironment.dist == expectedDist`; double `Supplier<Runnable>` defers classloading to prevent server crashes |
| `public final Supplier<T> supplier` (`Lazy<T>`) | Underlying supplier passed to `new Lazy<>(Supplier<T>)`, also used as internal `synchronized (this.supplier)` lock |
| `boolean isGotten()` (`Lazy<T>`) | Returns whether the value has been initialized (`false` before first `get()` returns non-null) |
| `T get()` (`Lazy<T>`) | Double-checked locking lazy evaluation. **Note**: uses `value == null` to detect uninitialized state, so `supplier` should not return `null` |
| `interface ISerializer<T>` | Unified serialization contract for recipes/data objects: `MapCodec<T> codec()` and `StreamCodec<RegistryFriendlyByteBuf, T> streamCodec()` |

### 2. Collection & List Utilities (`CollectionUtil` / `ListUtil`)

| Class & Method Signature | Description & Boundary Conditions |
| --- | --- |
| `CollectionUtil.allMatch(Collection<T> collection, Predicate<T> matcher)` | Checks whether all elements satisfy `matcher` |
| `CollectionUtil.anyMatch(Collection<T> collection, Predicate<T> matcher)` | Checks whether any element satisfies `matcher` |
| `CollectionUtil.newMultimap(M emptyMap, Collection<V> values, Function<V, K> keyFactory)` | Groups `values` by `keyFactory` into the given mutable `Multimap` and returns it |
| `CollectionUtil.newLinkedList(int ignored)` | Ignores capacity arg and constructs an empty `LinkedList<T>`, useful for `ByteBufCodecs.collection(CollectionUtil::newLinkedList)` |
| `CollectionUtil.get(SequencedCollection<T> collection, int index)` | Reads element at `index` from a sequenced collection; returns `null` if out of bounds |
| `ListUtil.safelyGet(List<T> list, int index)` | Returns `Optional.empty()` if `index < 0 \|\| index >= list.size()`, else `Optional.of(list.get(index))` |
| `ListUtil.cycle(List<T> original, int times)` | Repeats `original` `times` times in order; returns an empty immutable list if `times <= 0` or empty |
| `ListUtil.createWithValues(int size, IntFunction<T> valueFac)` | Builds a list of `size` elements by calling `valueFac` for indices `0 .. size - 1` |
| `ListUtil.cast(List<T> original, Class<R> clazz)` | Filters and casts elements that are instances of `clazz` into `List<R>` |
| `ListUtil.equals(List<T> first, List<U> second, BiPredicate<T, U> equals)` | Returns `true` if lengths match and all paired elements satisfy `equals` |

### 3. Math & Loot Value Expectations (`MathUtil` / `NumberProviderUtil`)

#### `MathUtil`

| Method Signature | Description & Boundary Conditions |
| --- | --- |
| `Vector2f rotationDegrees(Vector2f v, float deg)` | Rotates counterclockwise around origin by `deg` degrees (converts to radians and calls `rotate`, returning a new `Vector2f`) |
| `Vector2f rotate(Vector2f v, float d)` | Rotates counterclockwise around origin by `d` radians without mutating `v` |
| `Vector2f copy(Vector2f v)` | Returns `new Vector2f(v.x, v.y)` |
| `float angle(Vector2f from, Vector2f to)` | Computes radian angle of `from -> to` relative to +X (`atan2(to.y - from.y, to.x - from.x)`), in `[-π, π]` |
| `float angleDegrees(Vector2f from, Vector2f to)` | Converts `angle(from, to)` to degrees |
| `boolean isInRange(double value, double min, double max)` | **Open-interval** check `value > min && value < max` (boundary values return `false`) |
| `boolean isInRange(double valueX, double valueY, double minX, double minY, double maxX, double maxY)` | 2D **open-interval** rectangle range check |
| `Vec3i dist(BlockPos a, BlockPos b)` | Computes signed difference vector `b - a` (`dx, dy, dz`) |
| `@Nullable Direction getDirection(BlockPos from, BlockPos to)` | Converts unit offset to `Direction`; returns `null` if non-adjacent or zero offset |
| `float safeDiv(float a, float b)` | Safe float division; returns `0F` when `b == 0` |
| `double safeDiv(double a, double b)` | Safe double division; returns `0D` when `b == 0` |
| `float clampWithProportion(float value, float min, float max)` | **Periodically wraps** `value` into `[min, max]` with period `max - min`; throws `IllegalArgumentException` if `min == max` |

#### `NumberProviderUtil`

Statically evaluates expected value, max, and min of loot `NumberProvider`s:

| Method Signature | Supported Types | Unsupported Return |
| --- | --- | --- |
| `double expected(NumberProvider numberProvider)` | `ConstantValue` (`v`), `UniformGenerator` (`(min+max)/2`), `BinomialDistributionGenerator` (`n * p`) | `-1` |
| `double max(NumberProvider numberProvider)` | `ConstantValue` (`v`), `UniformGenerator` (`max`), `BinomialDistributionGenerator` (`n`) | `-1` |
| `double min(NumberProvider numberProvider)` | `ConstantValue` (`v`), `UniformGenerator` (`min`), `BinomialDistributionGenerator` (`0`) | `-1` |

> [!WARNING]
> The three methods above only handle `ConstantValue`, `UniformGenerator`, and `BinomialDistributionGenerator` (with nested numeric bounds/probabilities evaluated recursively via `expected`/`max`/`min`); other custom `NumberProvider`s return `-1`.

### 4. VoxelShapes & Parallel Outline Segments (`ShapeUtil` / `OutlineUtil` / `Line`)

#### `ShapeUtil`

Block coordinate convention: all methods operate around block center `(8, 8, 8)` (`Block.box` `0..16` units), rotating **counterclockwise** by multiples of `90°` (negatives and `> 360°` normalize to `{0, 90, 180, 270}`; non-90° multiples log a warning and return unchanged).

| Method Signature | Description |
| --- | --- |
| `Future<VoxelShape> threadedJoin(List<VoxelShape> shapes, BooleanOp op, ExecutorService executor)` | Submits tree-reduction tasks to merge large `VoxelShape` lists, returning `Future<VoxelShape>` (empty list completes immediately with `Shapes.empty()`) |
| `VoxelShape cut(VoxelShape base, VoxelShape... cutters)` | Subtracts `cutters` from `base` (`BooleanOp.ONLY_FIRST`) and calls `.optimize()` |
| `VoxelShape cut(AABB base, AABB... cutters)` | Same as above for `AABB`s (converts to `VoxelShape` and subtracts) |
| `VoxelShape merge(VoxelShape... shapes)` | Merges multiple `VoxelShape`s with `BooleanOp.OR` and calls `.optimize()` |
| `VoxelShape merge(AABB... shapes)` | Merges an `AABB` array into a single optimized `VoxelShape` |
| `VoxelShape box(AABB shape)` | Scales a `[0, 1]`-based `AABB` by 16 to construct `Block.box(...)` |
| `VoxelShape rotate(Direction.Axis axis, float angle, VoxelShape shape)` | Rotates counterclockwise around `axis` and `(8, 8, 8)` by `angle` (multiple of 90°) |
| `AABB[] rotate(Direction.Axis axis, float angle, AABB... shapes)` | Batch-rotates an `AABB` array (`0..16` pixel units) |
| `AABB rotate(Direction.Axis axis, float angle, AABB shape)` | Rotates a single `AABB` (`0..16` pixel units) |
| `VoxelShape mirror(Direction.Axis axis, VoxelShape shape)` | Mirrors coordinates `x/y/z -> 16 - x/y/z` along `axis` |
| `AABB[] mirror(Direction.Axis axis, AABB... shapes)` | Batch-mirrors an `AABB` array |
| `AABB mirror(Direction.Axis axis, AABB shape)` | Mirrors a single `AABB` |

#### `OutlineUtil` & Client Line Segment `Line`

`OutlineUtil` uses a **3-axis sweep-plane** algorithm to remove internal coplanar edges from any overlapping or adjacent `AABB`s and extract merged outer contour `List<Line>` segments:

| Method Signature | Description |
| --- | --- |
| `static List<Line> extractOutline(List<AABB> boxes)` | Uses the global common pool (switching to parallel sweep when `boxes.size() >= Integer.getInteger("anvillib.outline.parallelThreshold", 1024)` and parallelism is available) |
| `static List<Line> extractOutline(List<AABB> boxes, @Nullable Executor executor)` | Runs with a custom `Executor` for parallel work, or `null` to force single-threaded execution |

`dev.anvilcraft.lib.v2.util.client.Line` is an immutable record:

```java
public record Line(Vec3 start, Vec3 end, int thickness, float length)
```

| Member / Constructor / Method Signature | Description |
| --- | --- |
| `Line(Vec3 start, Vec3 end, float length)` | Constructs a line with default thickness `1` |
| `Line(Vec3 start, Vec3 end, int thickness)` | Constructs a line with default length `1F` |
| `Line(Vec3 start, Vec3 end)` | Default thickness `1`, length `1F` |
| `@Deprecated(forRemoval = true) void render(PoseStack pose, VertexConsumer vertex, Vec3 camera, int color)` | Deprecated; use the `PoseStack.Pose` overload instead |
| `void render(PoseStack.Pose pose, VertexConsumer vertex, Vec3 camera, int color)` | Translates relative to `camera` and writes both endpoints with segment-direction normals to a `LINES` buffer. **Note**: MC 1.21.1 `VertexConsumer` has no `setLineWidth`, so `thickness` is ignored |

### 5. Inventory Compat, Scrolling & Client Tick Counter (`InventoryUtil` / `Scrollable` / `ClientTickRecorder`)

#### `InventoryUtil`

In addition to checking player `Inventory` (`offhand`, `items`, `armor`), `compatConsumer` provides a hook for third-party accessory mods like Curios:

| Member Signature | Description & Boundary Conditions |
| --- | --- |
| `public static BiConsumer<ArrayList<ItemStack>, LivingEntity> compatConsumer` | Third-party accessory slot hook (defaults to `NonNullBiConsumer.noop()`), appending entity accessory `ItemStack`s during compat integration |
| `static ItemStack getFirstItem(Inventory inventory, ItemLike item)` | Searches `offhand -> items -> armor` for the first matching item, returning `ItemStack.EMPTY` if absent |
| `static ItemStack getFirstItem(Inventory inventory, Supplier<ItemLike> item)` | Lazy item supplier overload |
| `static ItemStack getFirstItem(Inventory inventory, Predicate<ItemStack> filter)` | Searches for the first item matching `filter` |
| `static List<ItemStack> getItems(Inventory inventory, Predicate<ItemStack> filter)` | Collects all non-empty `ItemStack`s across the 3 sections matching `filter` |
| `static List<ItemStack> getItems(Inventory inventory)` | Collects all non-empty `ItemStack`s across the 3 sections |
| `static boolean hasItem(Inventory inventory, Item item)` | Checks whether the inventory contains `item` |
| `static boolean hasItem(Inventory inventory, Supplier<ItemLike> item)` | Lazy item supplier overload |
| `static ItemStack getItemInCompat(LivingEntity entity, Predicate<ItemStack> filter)` | Finds the first item matching `filter` in `compatConsumer` slots, or `ItemStack.EMPTY` |
| `static ArrayList<ItemStack> getCompatItems(LivingEntity living)` | Invokes `compatConsumer` to get all extended compat slot items for `living` |
| `static boolean hasItemInCompat(LivingEntity entity, Predicate<ItemStack> filter)` | Checks whether any item in extended compat slots matches `filter` |
| `static ItemStack insertItem(Inventory inventory, ItemStack stack)` | Inserts/merges `stack` into player inventory; auto-sends `ClientboundContainerSetSlotPacket` for `ServerPlayer` and returns any leftover `ItemStack` |

#### `Scrollable`

Abstract base class for vanilla-style scrollbar GUIs (Lombok `@Getter` provides `isScrolling()` and `getScrollOffs()`):

| Member Signature | Description |
| --- | --- |
| `int calculateRowCount()` | Computes scrollable overflow rows `max(ceil(size / column) - row, 0)` |
| `int getRowIndex()` | Computes top row index from `scrollOffs` and scrollable rows, clamped `>= 0` |
| `void calculateScroll(int rowIndex)` | Converts a row index back into `0.0F..1.0F` `scrollOffs` |
| `void subtractInputFromScroll(double input)` | Adjusts and clamps `scrollOffs` by `input / calculateRowCount()` |
| `void scrollTo()` | Calls `setHead(getRowIndex() * column())` to sync the visible start offset |
| `void scrollOnDrag(float barHeight, double mouseY, int top, int bottom)` | Handles scrollbar mouse dragging (mapping thumb center to `[top, bottom]`) and calls `scrollTo()` |
| `void scrollOnScroll(double scrollY)` | Handles scroll wheel via `subtractInputFromScroll(scrollY)` and `scrollTo()` |
| `void scrolling()` / `void notScrolling()` | Sets `scrolling = true` / `false` |
| `void reset()` | Resets `scrolling = false`, `scrollOffs = 0.0F`, and calls `scrollTo()` |
| `boolean canScroll()` | Returns `true` when `size() > row() * column()` |
| `abstract int row()` / `column()` / `size()` | Subclasses supply visible rows, columns, and total items (`@Range(from = 0, to = Integer.MAX_VALUE)`) |
| `abstract void setHead(int head)` | Subclass callback receiving the updated leading item index |

#### `ClientTickRecorder`

Uses `@EventBusSubscriber(value = Dist.CLIENT)` to auto-subscribe to client tick and disconnect events:

| Member Signature | Description |
| --- | --- |
| `public static int getTicks()` (`@Getter private static int ticks`) | Returns accumulated unpaused client ticks, **wrapping modulo every 24h (`1_728_000` ticks)** |
| `@ApiStatus.Internal static void onTick(ClientTickEvent.Pre e)` | Increments `ticks` when unpaused (internal event handler) |
| `@ApiStatus.Internal static void onClientExit(ClientPlayerNetworkEvent.LoggingOut e)` | Resets `ticks = 0` on world exit (internal event handler) |

## Full Example: Combining Block Facing Rotation, Merged Hitboxes & 26-Neighbor Queries

```java
package com.example.mymod.block;

import dev.anvilcraft.lib.v2.util.MathUtil;
import dev.anvilcraft.lib.v2.util.ShapeUtil;
import dev.anvilcraft.lib.v2.util.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.ArrayList;
import java.util.List;

public final class MachineShapeAndNeighborDemo {
    private static final VoxelShape BASE_NORTH = ShapeUtil.merge(
        Block.box(2, 0, 2, 14, 4, 14),
        Block.box(5, 4, 3, 11, 12, 9)
    );

    public static VoxelShape shapeForFacing(Direction facing) {
        return switch (facing) {
            case NORTH -> BASE_NORTH;
            case WEST -> ShapeUtil.rotate(Direction.Axis.Y, 90F, BASE_NORTH);
            case SOUTH -> ShapeUtil.rotate(Direction.Axis.Y, 180F, BASE_NORTH);
            case EAST -> ShapeUtil.rotate(Direction.Axis.Y, 270F, BASE_NORTH);
            default -> BASE_NORTH;
        };
    }

    public static List<BlockPos> collectRedstoneNeighbors(Level level, BlockPos center) {
        List<BlockPos> powered = new ArrayList<>();
        Util.acceptDirections(center, pos -> {
            if (level.hasNeighborSignal(pos)) {
                powered.add(pos.immutable());
            }
        });
        return powered;
    }

    public static void rewardPlayerSafely(Player player, int amount) {
        ItemStack stack = new ItemStack(Items.IRON_INGOT, Math.max(1, amount));
        float clampedAngle = MathUtil.clampWithProportion(player.getYRot(), 0F, 360F);
        if (player instanceof ServerPlayer && clampedAngle >= 0F) {
            ItemStack leftover = dev.anvilcraft.lib.v2.util.InventoryUtil.insertItem(
                player.getInventory(),
                stack
            );
            if (!leftover.isEmpty()) {
                player.drop(leftover, false);
            }
        }
    }

    public static VoxelShape carvedChannel() {
        return ShapeUtil.cut(
            new AABB(0, 0, 0, 16, 16, 16),
            new AABB(4, 8, 0, 12, 16, 16)
        );
    }
}
```
