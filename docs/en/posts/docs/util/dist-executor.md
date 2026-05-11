# DistExecutor and ClientTickRecorder

## DistExecutor

`dev.anvilcraft.lib.v2.util.DistExecutor` is used to execute code on a specific physical side.

```java
DistExecutor.run(Dist.CLIENT, () -> () -> {
    // Code that runs only on the client
});
DistExecutor.run(Dist.DEDICATED_SERVER, () -> () -> {
    // Code that runs only on the dedicated server
});
```

## ClientTickRecorder

`ClientTickRecorder` listens to `ClientTickEvent.Pre`, recording the cumulative client ticks (unaffected by pausing),
and resets every 24 hours (1,728,000
ticks) to maintain floating-point precision. Use `getTicks()` to obtain the current value.
