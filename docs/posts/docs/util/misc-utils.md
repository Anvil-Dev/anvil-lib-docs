# 通用工具类

## Util

`dev.anvilcraft.lib.v2.util.Util`：

- `isLoaded(String modId)` – 检查模组是否加载
- `intoOptional(Collection)` – 非空集合转 `Optional`
- `acceptDirections(BlockPos, Consumer<BlockPos>)` – 遍历 3×3×3 邻居偏移（含角块）
- `isClient()` / `isServer()` – 当前物理端判断
- `cast(Object)` / `castSafely(Object, Class)` / `ifCastable(...)` – 类型转换辅助
- `instanceOfAny(Object, Class<?>...)` – 判断实例是否为任意类型之一
- `run(T, Consumer<T>)` – 执行副作用后返回原值
- `throwE(Throwable)` – 抛出受检异常的便利方法

## AnvilLibUtil

模组主类与 ID 工具：

- `MAIN_ID = "anvillib"` / `MOD_ID = "anvillib_util"`
- `of(String path)` – 使用 `anvillib` 命名空间创建 `Identifier`
