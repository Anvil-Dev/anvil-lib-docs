# Unlimited ItemStack

`dev.anvilcraft.lib.v2.util.stack.UnlimitedItemStack` is an item stack implementation supporting unlimited quantity (
count can exceed 64), suitable for recipe costs, large item containers, and similar use cases.

**Construction**:

- `new UnlimitedItemStack(ItemStack, int count)` – copies the item and components from a vanilla ItemStack, retaining
  only a single-item stack while storing count separately
- Provides `CODEC`, `MAP_CODEC`, `STREAM_CODEC` for serialization
- `serializeNBT` / `deserializeNBT` – NBT read/write
- `parse(HolderLookup.Provider, Tag)` – parses to an Optional

**Common Methods**:

- `isEmpty()`, `copy()`, `copyWithCount(int)`
- `grow(int)` – increases the count
- `splitUnlimited(int)` – splits and returns a new UnlimitedItemStack (does not affect the vanilla max stack size)
- `split(int)` – returns a vanilla ItemStack (capped at max stack size), reduces the remaining count accordingly
- `toStack()` – produces an ItemStack that may have a count > 64 (not recommended for direct use)
- `toStacks()` – splits into `List<ItemStack>` by the vanilla max stack size
- `is(Item)`, `is(TagKey<Item>)`, `isAny(ItemLike...)` – item matching
- `isSameItemSameComponents(ItemStack/UnlimitedItemStack)` – equality comparison ignoring count
- `listMatches`, `hashStackList` – list comparison and hashing

**Note**: `hashCode()` and `equals()` are based on item, count, and components; when implementing `split`, the count
must not exceed 64.
