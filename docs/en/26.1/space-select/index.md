# Space Select: District Model & Item Integration (`module.space-select`)

<BranchContextCard branch="26.1" />

`module.space-select` (artifact `anvillib-space-select-neoforge-26.1`, package `dev.anvilcraft.lib.v2.space_select`) provides an out-of-the-box utility library for **3D cuboid region (`District`) interactive selection, client wireframe preview, scroll resizing/moving, and server sync**—ideal for builder wands, territory claim tools, multiblock blueprint samplers, and similar corner-selection items.

This module is split into 2 sub-documents by functionality:
- **This page (District Model, Manager & `SpaceSelectItem`)**: Covers `AnvilLibSpaceSelect`, `District`, `DistrictManager`, `DistrictManager.DistrictKey`, and `SpaceSelectItem`.
- **[Client Rendering, Scroll Fine-Tuning & Server Events](./client-and-events)**: Covers `ClientDistrictManager`, `DistrictRenderer`, `SpaceSelectScrollHandler`, `PlayerCreateDistrictEvent`, and `SpaceSelectPayload`.

---

## 1. Setup

If you already depend on the aggregate artifact `anvillib-neoforge-26.1`, this module is included automatically. To depend on `space-select` standalone:

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-space-select-neoforge-26.1:2.0.0")
}
```

---

## 2. Core Workflow & Full Code Example

### 1. How Does the Player Selection Flow Work?

1. Have your custom item implement **`SpaceSelectItem`**;
2. When the player right-clicks a block on the client (e.g., in `Item#useOn`), call `this.select(player, clickedPos)` on the client:
   - **1st click**: `ClientDistrictManager#startSelect` records `startPos`, and `DistrictRenderer` renders a live wireframe preview (`tempDistrict`) from `startPos` to the targeted block as the player looks around;
   - **2nd click**: `ClientDistrictManager#endSelect` locks `endPos`, creates a normalized `District.create(start, end)` on the client, and sends `SpaceSelectPayload` to the server;
3. Upon receiving `SpaceSelectPayload`, the server posts `PlayerCreateDistrictEvent`, and `PlayerCreateDistrictEventHandler` automatically invokes **`SpaceSelectItem#onCreateDistrict(player, itemStack, start, end)`** on the held item!
4. Once a region is selected on the client, holding **`Ctrl + Mouse Scroll`** resizes the selection along the look axis, and **`Alt + Mouse Scroll`** translates the selection along the look direction!

### 2. Full Code Example: Implementing a Blueprint Region Selector Wand

```java
package com.example.mymod.item;

import dev.anvilcraft.lib.v2.space_select.SpaceSelectItem;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

public class RegionSelectorWandItem extends Item implements SpaceSelectItem {
    public RegionSelectorWandItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Player player = context.getPlayer();
        if (player == null) return InteractionResult.PASS;

        Level level = context.getLevel();
        BlockPos clickedPos = context.getClickedPos();

        if (level.isClientSide()) {
            if (player.isSecondaryUseActive()) {
                // Sneak + right-click: cancel current selection
                this.cancel(player);
            } else {
                // Normal right-click: 1st click sets start, 2nd click sets end and reports to server
                this.select(player, clickedPos);
            }
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * Fired automatically on the server main thread after the player finishes selecting two corners
     */
    @Override
    public void onCreateDistrict(Player player, ItemStack itemStack, BlockPos start, BlockPos end) {
        int sizeX = Math.abs(end.getX() - start.getX()) + 1;
        int sizeY = Math.abs(end.getY() - start.getY()) + 1;
        int sizeZ = Math.abs(end.getZ() - start.getZ()) + 1;

        player.displayClientMessage(
            Component.literal("Selected region: " + start.toShortString() + " -> " + end.toShortString()
                + " (" + sizeX + "x" + sizeY + "x" + sizeZ + ")"),
            true
        );
    }
}
```

---

## 3. Public Classes & Interfaces API Reference

### 1. `District` (3D Axis-Aligned Cuboid Selection Record)

```java
public record District(BlockPos.MutableBlockPos start, BlockPos.MutableBlockPos end)
```

`start` always stores the minimum corner `(minX, minY, minZ)` and `end` always stores the maximum corner `(maxX, maxY, maxZ)`.

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `public static District create(BlockPos start, BlockPos end)` | `District` | Normalizes any two opposite corners by per-axis `min` / `max` and creates a `District`. |
| `public void expand(Direction direction, int size)` | `void` | Expands the selection boundary outward by `size` blocks along `direction` (decreases `start` for negative directions, increases `end` for positive directions). |
| `public void contraction(Direction direction, int size)` | `void` | Contracts the selection boundary by `size` blocks along `direction`. |
| `public void move(Direction direction, int step)` | `void` | Translates the entire selection (`start` and `end`) by `step` blocks along `direction`. |
| `public void scaleOnAxis(Direction.Axis axis, int scrollAmount, Vec3 playerPos, AABB boundingBox, Vec3 lookAngle)` | `void` | Intelligently chooses which face along `axis` to push/pull based on player position and look vector (if inside the selection, adjusts the face in front of the view; if outside, adjusts the nearer face), clamping so `start <= end`. |
| `public static Direction.Axis getPrimaryAxis(Vec3 lookAngle)` | `Direction.Axis` | Returns the primary axis (`X`, `Y`, or `Z`) with the largest absolute component in `lookAngle`. |
| `public boolean contains(double x, double y, double z)` | `boolean` | Checks whether `(x, y, z)` lies within `[start, end]` inclusive. |
| `public VoxelShape shape()` | `VoxelShape` | Returns the relative `VoxelShape` from `(0, 0, 0)` to `(dx + 1, dy + 1, dz + 1)` (used by the renderer with `start` as origin). |
| `public int color()` | `int` | Deterministically generates an ARGB color with alpha `102/255` (~40% opacity) from this selection's `hashCode()`. |

### 2. `SpaceSelectItem` (Selection Tool Item Interface)

Located in `dev.anvilcraft.lib.v2.space_select.SpaceSelectItem`.

| Method Signature | Default Implementation & Description |
| :--- | :--- |
| `default void select(Player player, BlockPos pos)` | (Client-side) Checks whether the player holds a `SpaceSelectItem` in mainhand or offhand: if not yet selecting (`!isSelecting`), calls `startSelect` to record the first corner; if already selecting, calls `endSelect` to finish and send `SpaceSelectPayload` to the server. |
| `default void cancel(Player player)` | (Client-side) Clears any in-progress or completed selection associated with the player's mainhand and offhand slots. |
| `default void onCreateDistrict(Player player, ItemStack itemStack, BlockPos start, BlockPos end)` | Empty by default. Invoked on the **server main thread** by `PlayerCreateDistrictEventHandler` when `PlayerCreateDistrictEvent` fires after the client finishes a selection. |

### 3. `DistrictManager` & `DistrictManager.DistrictKey`

| Class / Record | Method Signatures | Description |
| :--- | :--- | :--- |
| `DistrictManager` | • `public Map<DistrictKey, District> getDistrictMap()`<br>• `public void select(DistrictKey districtKey, District district)`<br>• `public void clear(DistrictKey districtKey)` | Base class storing active `District` selections keyed by hand slot `DistrictKey`. |
| `DistrictManager.DistrictKey` | `public record DistrictKey(int slot, boolean offhand, Item item)`<br>`public boolean check(@Nullable Player player)` | Binds hotbar slot index `slot` (offhand is fixed to `-1, offhand = true`) and item type `item`. `check(player)` verifies the player still holds that `SpaceSelectItem` in that slot. |
