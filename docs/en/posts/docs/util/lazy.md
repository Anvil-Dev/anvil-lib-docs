# Lazy Initialization

`dev.anvilcraft.lib.v2.util.Lazy<T>` is a thread-safe lazy initialization container.

- **Construction**: `new Lazy(Supplier<T>)`
- **Retrieval**: The `get()` method uses `synchronized` to ensure initialization happens only once.
- **Status**: `isGotten()` checks whether the instance has already been created.
- **Typical usage**: Caching expensive singleton objects.

```java
Lazy<HeavyObject> lazy = new Lazy<>(HeavyObject::new);
if (!lazy.isGotten()) {
    // Not yet created
}
HeavyObject obj = lazy.get();
```
