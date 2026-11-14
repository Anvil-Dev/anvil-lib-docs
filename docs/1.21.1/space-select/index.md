# 区域模型 (District)、选择器物品与管理器

`module.space-select`（模组 ID：`anvillib_space_select`）为 NeoForge 1.21.1 提供了一套开箱即用的**三维方块区域框选工具框架**：

- 物品只需实现 `SpaceSelectItem` 接口，即可获得**双端选区创建、主副手隔离识别、半透明实时线框预览、滚轮沿视线方向缩放/平移，以及服务端创建回调**。
- 使用 `District`（可变选区记录）与 `DistrictManager`（按槽位与手别索引的多选区表）统一管理框选几何变换与渲染颜色。

## 接入配置

### Gradle 仓库与依赖

正式版可从 Maven Central 获取，但推荐使用 `Cjsah Maven` 仓库并通过 `exclusiveContent` 过滤组，以避免 NeoForge Maven 未完全同步 Maven Central 导致接口注入或传递元数据异常：

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

## 快速上手：创建一个区域选择魔杖

开发者无需手动编写高亮渲染器、滚轮缩放控制或网络发包逻辑，只需让物品类实现 `SpaceSelectItem` 并在客户端调用 `select(player, pos)` 与 `cancel(player)`，并在 `onCreateDistrict(...)` 中编写服务端收到区域后的业务逻辑。

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
        // 在客户端维护选区起点 -> 终点，并在结束选区时自动发送 SpaceSelectPayload 至服务端
        if (level.isClientSide()) {
            this.select(player, context.getClickedPos());
        }
        return InteractionResult.sidedSuccess(level.isClientSide());
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand usedHand) {
        ItemStack stack = player.getItemInHand(usedHand);
        // 潜行右键空气：取消/清除当前手持魔杖关联的选区
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
        // 仅在服务端收到客户端选区完毕的 SpaceSelectPayload 后由 PlayerCreateDistrictEventHandler 自动分发到此方法
        if (player instanceof ServerPlayer serverPlayer) {
            serverPlayer.sendSystemMessage(Component.literal(
                "已选定区域：(" + start.toShortString() + ") -> (" + end.toShortString() + ")"
            ));
        }
    }
}
```

## 工作机制详解

### 1. 选区交互状态机（主手 / 副手隔离）

`SpaceSelectItem.select(player, pos)` 与 `cancel(player)` 通过 `DistrictManager.DistrictKey` 将选区精确绑定到「物品栏槽位索引 / 是否副手 / 物品类型」：
1. **优先级**：依次检查主手当前选中槽位 (`slot = player.getInventory().selected, offhand = false`) 与副手 (`slot = -1, offhand = true`) 是否持有 `SpaceSelectItem`。
2. **第一次点击 (`!isSelecting(key)`)**：调用 `ClientDistrictManager.startSelect(key, pos)` 记录起点坐标。此时玩家移动准星指向其他方块时，`getTempDistrict()` 会实时动态计算临时预览区域并渲染。
3. **第二次点击 (`isSelecting(key)`)**：调用 `ClientDistrictManager.endSelect(key, pos)`，规范化最小/最大端点并存入已完成选区映射，同时向服务端发送 `SpaceSelectPayload(offhand, start, end)`。

::: warning 注意 `onCreateDistrict` 与客户端滚轮缩放的关系
1. `SpaceSelectItem.select(player, pos)` **设计用于客户端调用**（直接访问 `AnvilLibSpaceSelectClient.MANAGER`）。请勿在专用服务端直接调用 `select(...)` 或 `cancel(...)`，否则会触发客户端类加载崩溃；务必使用 `if (level.isClientSide())` 保护。
2. 客户端使用 `Ctrl/Alt + 滚轮` 缩放或平移选区仅直接修改客户端 `ClientDistrictManager` 中缓存的 `District` 坐标，不会重新发送 `SpaceSelectPayload`；而且 `SpaceSelectPayload` 携带的是 `endSelect` 传入的原始 `(start, blockPos)`，在服务端 `PlayerCreateDistrictEvent` 中若需规范化坐标，建议使用 `District.create(event.getStart(), event.getEnd())`。
:::

## 公开 API 完整参考

### `AnvilLibSpaceSelect`

包名：`dev.anvilcraft.lib.v2.space_select`

| 成员签名 | 说明 |
| --- | --- |
| `public static final String MOD_ID = "anvillib_space_select"` | 模块 Mod ID |
| `static ResourceLocation of(String path)` | 生成 `anvillib_space_select:<path>` 命名空间 `ResourceLocation` |

### `SpaceSelectItem`

包名：`dev.anvilcraft.lib.v2.space_select` · 接口

| 方法签名 | 调用端 | 说明 |
| --- | --- | --- |
| `default void select(Player player, BlockPos pos)` | 客户端 | 对当前主手（优先）或副手的 `SpaceSelectItem` 执行“开始框选”或“完成框选”切换，并在完成时自动向服务端发包 |
| `default void cancel(Player player)` | 客户端 | 清除当前主手与副手键名对应的进行中选区与已完成选区 |
| `default void onCreateDistrict(Player player, ItemStack itemStack, BlockPos start, BlockPos end)` | 服务端 | 当客户端完成选区并同步到服务端后，由 `PlayerCreateDistrictEventHandler` 触发此回调（默认空实现） |

### `District`

包名：`dev.anvilcraft.lib.v2.space_select` · `record District(BlockPos.MutableBlockPos start, BlockPos.MutableBlockPos end)`

| 方法签名 | 参数 / 返回值 | 说明 |
| --- | --- | --- |
| `static District create(BlockPos start, BlockPos end)` | 任意两点坐标 | 自动对各轴取 `Math.min` 和 `Math.max`，构建规范化坐标的 `District` |
| `void expand(Direction direction, int size)` | 方向与格数 | 向指定方向外扩 `size` 格（负方向减小 `start`，正方向增大 `end`） |
| `void contraction(Direction direction, int size)` | 方向与格数 | 向指定方向收缩（注意：未强制拦截负体积翻转，交互场景建议配合 `scaleOnAxis`） |
| `void move(Direction direction, int step)` | 方向与步长 | 同时平移 `start` 与 `end` 各轴坐标 `direction.getStep*() * step` |
| `boolean contains(double x, double y, double z)` | 点坐标 | 判断三维坐标是否落入 `[start, end]` 闭合坐标区间内（基于整数方块顶点对比） |
| `static Direction.Axis getPrimaryAxis(Vec3 lookAngle)` | 视线方向向量 | 返回视线绝对值分量最大的主轴（`X` / `Y` / `Z`） |
| `void scaleOnAxis(Direction.Axis axis, int scrollAmount, Vec3 playerPos, AABB boundingBox, Vec3 lookAngle)` | 轴向、滚轮步进、玩家状态 | 智能推拉距离玩家更近（玩家在外部时）或面向前方（玩家在内部时）的边界，并保证不会翻转缩成负数体积 |
| `VoxelShape shape()` | 返回局部形状 | 返回基于 `(0, 0, 0)` 到 `(dx+1, dy+1, dz+1)` 的 `VoxelShape`，用于与 `district.start()` 对齐渲染 |
| `int color()` | 返回 ARGB 颜色 | 根据当前 `District.hashCode()` 伪随机生成固定半透明颜色（Alpha 固定为 `102`，即 `0x66RRGGBB`） |

### `DistrictManager` & `DistrictManager.DistrictKey`

包名：`dev.anvilcraft.lib.v2.space_select` · 带 Lombok `@Getter`

| 类 / 方法签名 | 说明 |
| --- | --- |
| `record DistrictKey(int slot, boolean offhand, Item item)` | 选区键：`slot` 为背包槽位，`offhand` 表示是否副手，`item` 为手持物品类型 |
| `boolean DistrictKey.check(@Nullable Player player)` | 校验玩家对应槽位/副手目前仍持有该 `item` 且其属于 `SpaceSelectItem` |
| `Map<DistrictKey, District> getDistrictMap()` | 返回当前注册的所有已完成选区映射（Lombok `@Getter`） |
| `void select(DistrictKey districtKey, District district)` | 写入或覆盖指定键的 `District` |
| `void clear(DistrictKey districtKey)` | 从管理器中移除指定键的 `District` |
