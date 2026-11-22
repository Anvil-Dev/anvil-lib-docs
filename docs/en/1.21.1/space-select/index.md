# District Model, Selector Item & Manager

`module.space-select` (Mod ID: `anvillib_space_select`) provides an out-of-the-box **3D block region selection tool framework** for NeoForge 1.21.1:

- Simply implement `SpaceSelectItem` on an item to get **cross-side selection creation, mainhand/offhand isolation, translucent live wireframe preview, scroll-wheel resizing/moving along look direction, and server creation callbacks**.
- Uses `District` (mutable selection record) and `DistrictManager` (multi-selection map indexed by slot and hand) to manage geometric transforms and render colors.

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

## Quick Start: Creating a Region Selector Wand

Without writing any highlight renderers, scroll handlers, or packet code, simply implement `SpaceSelectItem` on your item, call `select(player, pos)` and `cancel(player)` on the client, and handle the confirmed region in `onCreateDistrict(...)` on the server.

```java
package com.example.examplemod.item;

import dev.anvilcraft.lib.v2.space_select.SpaceSelectItem;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

public class RegionWandItem extends Item implements SpaceSelectItem {
    public RegionWandItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Level level = context.getLevel();
        Player player = context.getPlayer();
        if (player == null) {
            return InteractionResult.PASS;
        }
        // Maintain start -> end on client and auto-send SpaceSelectPayload to server when finished
        if (level.isClientSide()) {
            this.select(player, context.getClickedPos());
        }
        return InteractionResult.sidedSuccess(level.isClientSide());
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand usedHand) {
        ItemStack stack = player.getItemInHand(usedHand);
        // Sneak + right-click air: cancel/clear the selection associated with this wand
        if (player.isShiftKeyDown()) {
            if (level.isClientSide()) {
                this.cancel(player);
            }
            return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
        }
        return super.use(level, player, usedHand);
    }

    @Override
    public void onCreateDistrict(Player player, ItemStack itemStack, BlockPos start, BlockPos end) {
        // Dispatched automatically by PlayerCreateDistrictEventHandler on the server after SpaceSelectPayload arrives
        if (player instanceof ServerPlayer serverPlayer) {
            serverPlayer.sendSystemMessage(Component.literal(
                "Selected region: (" + start.toShortString() + ") -> (" + end.toShortString() + ")"
            ));
        }
    }
}
```

## How It Works

### 1. Selection State Machine (Mainhand / Offhand Isolation)

`SpaceSelectItem.select(player, pos)` and `cancel(player)` bind selections precisely to `(inventory slot, isOffhand, itemType)` via `DistrictManager.DistrictKey`:
1. **Priority**: checks mainhand selected slot (`slot = player.getInventory().selected, offhand = false`) then offhand (`slot = -1, offhand = true`) for a `SpaceSelectItem`.
2. **1st click (`!isSelecting(key)`)**: calls `ClientDistrictManager.startSelect(key, pos)` to record the start corner. As the player looks at other blocks, `getTempDistrict()` updates and renders a live preview.
3. **2nd click (`isSelecting(key)`)**: calls `ClientDistrictManager.endSelect(key, pos)`, normalizes min/max corners into the completed selection map, and sends `SpaceSelectPayload(offhand, start, end)` to the server.

::: warning Note on `onCreateDistrict` vs Client Scroll Resizing
1. `SpaceSelectItem.select(player, pos)` is **designed for client calls** (accesses `AnvilLibSpaceSelectClient.MANAGER` directly). Never call `select(...)` or `cancel(...)` on a dedicated server; guard with `if (level.isClientSide())`.
2. Client `Ctrl/Alt + Scroll` resizing or moving mutates only the cached `District` in `ClientDistrictManager` without resending `SpaceSelectPayload`; moreover, `SpaceSelectPayload` carries the raw `(start, blockPos)` passed to `endSelect`, so normalize with `District.create(event.getStart(), event.getEnd())` in `PlayerCreateDistrictEvent` if needed.
:::

## Full Public API Reference

### `AnvilLibSpaceSelect`

Package: `dev.anvilcraft.lib.v2.space_select`

| Member Signature | Description |
| --- | --- |
| `public static final String MOD_ID = "anvillib_space_select"` | Module Mod ID |
| `static ResourceLocation of(String path)` | Creates namespaced `ResourceLocation` `anvillib_space_select:<path>` |

### `SpaceSelectItem`

Package: `dev.anvilcraft.lib.v2.space_select` · Interface

| Method Signature | Side | Description |
| --- | --- | --- |
| `default void select(Player player, BlockPos pos)` | Client | Toggles start/finish corner selection on mainhand (preferred) or offhand `SpaceSelectItem`, auto-sending packet on completion |
| `default void cancel(Player player)` | Client | Clears in-progress and completed selections for both mainhand and offhand keys |
| `default void onCreateDistrict(Player player, ItemStack itemStack, BlockPos start, BlockPos end)` | Server | Fired by `PlayerCreateDistrictEventHandler` after client selection completes and syncs to server (no-op by default) |

### `District`

Package: `dev.anvilcraft.lib.v2.space_select` · `record District(BlockPos.MutableBlockPos start, BlockPos.MutableBlockPos end)`

| Method Signature | Parameters / Return | Description |
| --- | --- | --- |
| `static District create(BlockPos start, BlockPos end)` | Any two corners | Normalizes per-axis `Math.min` and `Math.max` to build `District` |
| `void expand(Direction direction, int size)` | Direction & blocks | Expands outward by `size` blocks along `direction` (decrements `start` for negative, increments `end` for positive) |
| `void contraction(Direction direction, int size)` | Direction & blocks | Contracts inward along `direction` (note: does not clamp against negative-volume inversion; use `scaleOnAxis` for interactive resizing) |
| `void move(Direction direction, int step)` | Direction & step | Translates both `start` and `end` by `direction.getStep*() * step` |
| `boolean contains(double x, double y, double z)` | Point coords | Checks whether 3D coords fall within closed `[start, end]` (integer block corner comparison) |
| `static Direction.Axis getPrimaryAxis(Vec3 lookAngle)` | Look vector | Returns the primary axis (`X` / `Y` / `Z`) with largest absolute component |
| `void scaleOnAxis(Direction.Axis axis, int scrollAmount, Vec3 playerPos, AABB boundingBox, Vec3 lookAngle)` | Axis, scroll step, player state | Pushes/pulls the nearer face (when outside) or front-facing face (when inside) along `axis`, clamping so volume never inverts |
| `VoxelShape shape()` | Local shape | Returns `VoxelShape` from `(0, 0, 0)` to `(dx+1, dy+1, dz+1)` for rendering aligned at `district.start()` |
| `int color()` | ARGB color | Deterministically generates a translucent color from `District.hashCode()` (alpha fixed at `102`, i.e., `0x66RRGGBB`) |

### `DistrictManager` & `DistrictManager.DistrictKey`

Package: `dev.anvilcraft.lib.v2.space_select` · Lombok `@Getter`

| Class / Method Signature | Description |
| --- | --- |
| `record DistrictKey(int slot, boolean offhand, Item item)` | Selection key: inventory `slot`, `offhand` flag, and held `item` |
| `boolean DistrictKey.check(@Nullable Player player)` | Verifies the player still holds that `item` (and it is a `SpaceSelectItem`) in that slot/offhand |
| `Map<DistrictKey, District> getDistrictMap()` | Returns the map of all registered completed selections (Lombok `@Getter`) |
| `void select(DistrictKey districtKey, District district)` | Stores or overwrites the `District` for `districtKey` |
| `void clear(DistrictKey districtKey)` | Removes the `District` for `districtKey` from the manager |
