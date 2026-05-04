# 延迟初始化

`dev.anvilcraft.lib.v2.util.Lazy<T>` 是一个线程安全的延迟初始化容器。

- **构造**：`new Lazy(Supplier<T>)`
- **获取**：`get()` 方法使用 `synchronized` 保证只初始化一次。
- **状态**：`isGotten()` 检查是否已生成实例。
- **典型用法**：缓存耗资源的单例对象。

```java
Lazy<HeavyObject> lazy = new Lazy<>(HeavyObject::new);
if (!lazy.isGotten()) {
    // 尚未创建
}
HeavyObject obj = lazy.get();
```
