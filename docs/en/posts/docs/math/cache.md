---
title: Math Caching & Lifecycle
prev: false
next: false
---

# Parse Cache and Lifecycle

`FlatExpressionParser` keeps a parse cache internally: the same piece of text against the same function registry is really parsed only once. The cache itself has no expiry time, and the weak keys cannot be relied on either, so its clearing moments are something that has to be maintained explicitly — this document explains the shape of the cache, why it must be cleared, and at which moments it is cleared.

## Cache Structure

```java
private static final int CACHE_CAPACITY = 512;

private static final Map<HolderGetter<IFunction>, Map<String, IExpression>> CACHE =
    Collections.synchronizedMap(new WeakHashMap<>());
```

| Level         | Key                                            | Value                            | Eviction rule                                            |
|---------------|------------------------------------------------|----------------------------------|----------------------------------------------------------|
| Outer (group) | a `HolderGetter<IFunction>` instance           | the text cache on that registry  | weak key, expected to disappear along with the registry  |
| Inner (entry) | the original `String` (with no normalization)  | the parsed `IExpression`         | at most 512 per group, evicted by least recently used    |

- **The group key is "the object the registry was taken from"**, not `RegistryOps`: in 26.1 `RegistryOps.getter(...)` returns the registry itself directly, so several `RegistryOps` on the same registry share one cache group
- **The entry key is the original text**: `1+2` and `1 + 2`, `2x` and `2*x` are all different entries; on a cache hit what is returned is the **same instance** (`==` holds), and some callers rely on this for object comparison
- **Text that fails to parse does not enter the cache**: `parseValue` parses first and only writes after success, so the exception path leaves no half-finished product behind
- **No expiry time**: only a capacity and explicit clearing, no TTL
- The outer and inner maps are both synchronized wrappers, and the cached values are all immutable records (`FunctionExpression` copies the argument list on construction), so parsing from multiple threads is safe

## Why the Weak Keys Never Collect

The outer layer's use of `WeakHashMap` was meant to say "when the registry is gone, the cache follows along", but that expectation cannot hold:

The expression trees in the cache hold `Holder.Reference`, and every `Holder.Reference` strongly references the `HolderOwner` it belongs to (the `owner` field in `Holder.Reference.java`) — for a registry entry, that is the registry itself. The registry is exactly the **key** of the outer map, so a strong reference chain "value → key" is formed: as long as the map still holds this value, the key will never be collected, and the `WeakHashMap`'s weak key will never take effect.

There are two consequences:

- Replacing the registry does not make the old cache disappear: a datapack reload rebuilds the registry, and the old registry together with the expressions it cached is kept by this map, **every `/reload` leaves one more copy behind**, so a datapack reload must clear explicitly
- The cache's positioning is "grouped by registry, at most 512 entries per group" rather than "collected automatically along with the registry"; the capacity limit can only limit the number of entries within a group, not the number of groups; the number of groups is in practice decided by "how many different registry instances have been seen"

## When the Cache Is Cleared

There are three places where clearing happens automatically, all in the module's own event handlers:

| Moment                      | Trigger                                                | Handling                                                                                                     |
|-----------------------------|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| Server start                | `ServerStartedEvent`                                   | `LibCacheReloadHandler` empties it                                                                            |
| Datapack reload (`/reload`) | `OnDatapackSyncEvent`, and `event.getPlayer() == null` | Same as above; only cleared on a whole-pack reload, not when a single player joins the server                 |
| Client disconnect           | `ClientPlayerNetworkEvent.LoggingOut`                  | `LibClientCacheHandler` empties it (client distribution only)                                                 |

```java
@EventBusSubscriber(modid = AnvilLibMath.MOD_ID)
public class LibCacheReloadHandler {
    @SubscribeEvent
    public static void onServerStarted(ServerStartedEvent event) {
        FlatExpressionParser.clearCache();
    }

    @SubscribeEvent
    public static void onDatapackSync(OnDatapackSyncEvent event) {
        // This event also fires when "a player joins the server", and the registry has not been replaced then, so there is no need to drop the whole cache;
        // only getPlayer() being null (that is, a full sync such as /reload) means the datapack has been swapped
        if (event.getPlayer() == null) FlatExpressionParser.clearCache();
    }
}
```

```java
@EventBusSubscriber(modid = AnvilLibMath.MOD_ID, value = Dist.CLIENT)
public class LibClientCacheHandler {
    @SubscribeEvent
    public static void onLoggingOut(ClientPlayerNetworkEvent.LoggingOut event) {
        FlatExpressionParser.clearCache();
    }
}
```

The three moments correspond to the same situation: **the function registry has been replaced**. Start-up and reload rebuild the datapack registry; after the client disconnects, the registry synced over from the server is discarded, and the next join gets a new one. Without clearing, the client would keep evaluating with functions from the old registry.

## When to Clear It Yourself

Downstream should call `FlatExpressionParser.clearCache()` itself on the following occasions:

- **Self-built registries**: a registry you `new` yourself or a custom `HolderGetter` is not covered by the event handlers, so after replacing them you have to clear manually
- **Manually reloading datapacks**: when bypassing `/reload` and rebuilding the registry yourself
- **Memory-sensitive scenarios**: when you know for sure that a batch of expressions is no longer needed (for example, an expression editor screen was closed), clearing once is more thorough than waiting for LRU to squeeze them out
- **Tests**: when registries are constructed repeatedly in the same JVM, the cache keeps the old registry across test cases and needs explicit clearing (this is exactly how the module's own `ParseCacheTest` verifies it)

Clearing is global and coarse-grained: `clearCache()` clears all groups, and there is no interface to "clear only one group". The cost is merely that the next parse has to go through parsing and the self-check again, so if you are unsure whether clearing is needed, clearing is the safe choice.

## Downstream Notes

- Use `registryAccess.lookupOrThrow(LibRegistries.FUNCTION_KEY)` to get the registry, and do not wrap a new `HolderGetter` around it on every parse: a new instance only produces a new group, which can never hit the cache
- A cache entry strongly references the registry, so the cost of holding a parse result for a long time is not just the expression tree itself, but "the whole function registry cannot be released" — this is consistent with the behaviour of vanilla `Holder.Reference` and needs no extra handling, but you should be aware of it
- Concatenating text at runtime (for example, splicing user input into an expression) makes every distinct text occupy one cache entry; the 512-entry cap evicts by least recently used and will not grow without bound, but on a hot path it is advisable to normalize the text once (strip whitespace) to improve the hit rate
- Write-back (`Codec.encode`) re-parses the text once for the self-check, **so encoding also writes into the cache**; encoding in bulk equals parsing in bulk

## Related API

```java
// Clear the whole parse cache
FlatExpressionParser.clearCache();

// Take the function registry out of the dynamic ops (only RegistryOps is recognized); returns null when it cannot be taken
HolderGetter<IFunction> functions = FlatExpressionParser.functionGetter(ops);
```

The parse entry points themselves and the cache behaviour are covered in [Flat Expression Syntax](./flat-syntax), and the declarations of the registries and event handlers are in [Math Expression Module](./index).
