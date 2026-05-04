# DistExecutor 与 ClientTickRecorder

## DistExecutor

`dev.anvilcraft.lib.v2.util.DistExecutor` 用于在指定物理端执行代码。

```java
DistExecutor.run(Dist.CLIENT, () -> () -> {
    // 仅在客户端执行的代码
});
DistExecutor.run(Dist.DEDICATED_SERVER, () -> () -> {
    // 仅在专用服务端执行
});
```

## ClientTickRecorder

`ClientTickRecorder` 监听 `ClientTickEvent.Pre`，记录客户端累计 ticks（不受暂停影响），每 24 小时（1,728,000
ticks）重置一次，以保持浮点精度。`getTicks()` 获取当前值。
