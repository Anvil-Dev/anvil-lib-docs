# CollectionUtil and ListUtil

## CollectionUtil

Located at `dev.anvilcraft.lib.v2.util.CollectionUtil`, provides collection operations:

- `allMatch(Collection<T>, Predicate<T>)` – matches all elements
- `anyMatch(Collection<T>, Predicate<T>)` – matches any element
- `newMultimap(M, Collection<V>, Function<V,K>)` – creates a Guava Multimap
- `newLinkedList(int)` – creates a `LinkedList` (ignores the parameter, for convenience)
- `get(SequencedCollection<T>, int)` – safely retrieves by index, returns `null` if out of bounds

## ListUtil

Located at `dev.anvilcraft.lib.v2.util.ListUtil`:

- `safelyGet(List<T>, int)` – returns `Optional<T>`, handling empty lists or out-of-bounds access
- `cycle(List<T>, int)` – cyclically shifts elements, returns a new list
- `createWithValues(int, IntFunction<T>)` – builds a list of the specified size
- `cast(List<T>, Class<R>)` – filters and casts to a subtype list
- `equals(List<T>, List<U>, BiPredicate<T,U>)` – compares two lists using a custom comparator
