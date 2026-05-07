# General Utility Classes

## Util

`dev.anvilcraft.lib.v2.util.Util`:

- `isLoaded(String modId)` – checks whether a mod is loaded
- `intoOptional(Collection)` – converts a non-empty collection to `Optional`
- `acceptDirections(BlockPos, Consumer<BlockPos>)` – iterates over 3x3x3 neighbor offsets (including corners)
- `isClient()` / `isServer()` – determines the current physical side
- `cast(Object)` / `castSafely(Object, Class)` / `ifCastable(...)` – type casting helpers
- `instanceOfAny(Object, Class<?>...)` – checks whether an instance is any of the given types
- `run(T, Consumer<T>)` – executes a side effect and returns the original value
- `throwE(Throwable)` – convenience method for throwing checked exceptions

## AnvilLibUtil

Main mod class and ID utilities:

- `MAIN_ID = "anvillib"` / `MOD_ID = "anvillib_util"`
- `of(String path)` – creates an `Identifier` using the `anvillib` namespace
