# 物品栏 Util

`dev.anvilcraft.lib.v2.util.InventoryUtil` 提供物品栏操作。

- `getFirstItem(Inventory, ItemLike)` – 查找第一匹配物品
- `getFirstItem(Inventory, Supplier<ItemLike>)` – 同上，使用延迟供应
- `getFirstItem(Inventory, Predicate<ItemStack>)` – 按条件查找
- `getItems(Inventory, Predicate<ItemStack>)` – 过滤物品栏
- `getItems(Inventory)` – 获取所有物品副本
- `hasItem(Inventory, Item)` – 是否包含物品
- `hasItem(Inventory, Supplier<ItemLike>)` – 同上
- `getItemInCompat(LivingEntity, Predicate<ItemStack>)` – 通过兼容消费者获取物品
- `getCompatItems(LivingEntity)` – 获取兼容物品列表（可注册自定义消费者）
- `hasItemInCompat(LivingEntity, Predicate<ItemStack>)` – 兼容物品检测
- `insertItem(Inventory, ItemStack)` – 将物品插入到合适槽位（含网络同步）

**注意**：`compatConsumer` 默认无操作，可通过设置该 `BiConsumer` 来支持其他模组的物品容器。
