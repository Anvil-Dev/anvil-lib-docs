# Inventory Util

`dev.anvilcraft.lib.v2.util.InventoryUtil` provides inventory operations.

- `getFirstItem(Inventory, ItemLike)` – finds the first matching item
- `getFirstItem(Inventory, Supplier<ItemLike>)` – same as above, using a lazy supplier
- `getFirstItem(Inventory, Predicate<ItemStack>)` – finds by condition
- `getItems(Inventory, Predicate<ItemStack>)` – filters the inventory
- `getItems(Inventory)` – gets a copy of all items
- `hasItem(Inventory, Item)` – checks whether the inventory contains the item
- `hasItem(Inventory, Supplier<ItemLike>)` – same as above
- `getItemInCompat(LivingEntity, Predicate<ItemStack>)` – retrieves an item via compat consumers
- `getCompatItems(LivingEntity)` – gets a list of compat items (custom consumers can be registered)
- `hasItemInCompat(LivingEntity, Predicate<ItemStack>)` – compat item detection
- `insertItem(Inventory, ItemStack)` – inserts an item into a suitable slot (with network sync)

**Note**: `compatConsumer` defaults to a no-op. Set this `BiConsumer` to support item containers from other mods.
