# 函数体系、变参、内建函数与注册表 (`dev.anvilcraft.lib.v2.math.expression.function` / `init`)

<BranchContextCard branch="26.1" />

在 `module.math` 中，表达式树里的所有计算——无论是常数、变量读取、四则运算、聚合统计还是数据包自定义公式——在底层都是对 `IFunction` 的调用。本篇详解函数接口、形参绑定与任意位置变参机制、13 个内建函数、5 种通用函数实现以及双注册表扩展架构。

---

## 一、 核心设计：任意位置变参（Variadic Parameter）与闭包求值

### 1. 形参声明与变参配位规则 (`Parameter` & `Parameters`)

在自定义函数（`CustomFunction`）或匿名函数（`LambdaFunction`）中，形参通过字符串列表声明（如 `["a", "x...", "b"]`）：

- **标识符约束**：形参基名必须以字母或下划线开头，后续字符仅限字母、数字或下划线（与 Flat 文本标识符规则严格一致），且同一个参数列表中**不允许重名**。
- **任意位置的单个变参（`...`）**：形参声明以 `"..."` 结尾（`Parameter.VARIADIC_SUFFIX`）代表该参数为变参。一个函数签名中**最多只能声明 1 个变参**，但该变参**不必局限于最后一个参数**（例如 `["prefix", "middle...", "suffix"]` 完全合法）。
- **变参配位算法（`IFunction.bind`）**：
  假设函数共有 $F$ 个固定形参和 1 个变参，调用时展开全部 `$(name...)` 后共传入了 $N$ 个实参（需满足 $N \ge F$，变参最少可吃 $0$ 个实参）：
  - 固定形参每人分得 $1$ 个实参；
  - 变参自动吃掉中间剩余的 $N - F$ 个实参，打包为 `Arguments.Value.Many(List<Double>)` 绑定到形参名上。
- **在函数体中使用变参**：
  - 若直接写 `$(x)`（单值引用），取到的是变参列表中的**最大值**（空列表为 `0`）；
  - 若写 `$(x...)`（`Reference.Spread` 展开引用），会将整份列表原样转发给另一个接受变参的函数（如 `min($(x...))`、`max($(x...))` 或 `foreach($(x...), item -> $(item) * 2)`）。

### 2. 调用深度守卫（防止自引用无限递归）

数据包中的 `CustomFunction` 或注册表中的 `LambdaFunction` 可以按名调用注册表中的任何函数（包括它自己或互相调用）。为了防止递归死循环打穿 JVM 调用栈，`IFunction` 内置了线程局部深度守卫 `IFunction.MAX_CALL_DEPTH = 64`。一旦单次求值的函数调用栈深度达到 `64`，`IFunction#guarded` 会立即抛出可读的 `IllegalStateException("Function call depth exceeded 64 at ...")` 并安全恢复线程深度计数。

---

## 二、 完整代码示例

### 1. 在数据包 JSON 中定义自定义函数 (`data/<namespace>/anvillib/function/*.json`)

数据包函数存放在 `data/<namespace>/anvillib/function/<name>.json` 下。若 `<namespace>` 为 `anvillib`，在 Flat 文本中可直接省略命名空间按短名调用；若在其他命名空间（如 `my_mod`），则在 Flat 文本中按 `my_mod:<name>(...)` 调用：

```json
// 文件路径: data/my_mod/anvillib/function/weighted_sum.json
{
  "type": "anvillib:custom",
  "parameters": ["scale", "items...", "bias"],
  "body": "$(bias) + $(scale) * foreach($(items...), v -> $(v)^2)"
}
```

解析并调用上述数据包函数（注意变参 `items...` 位于中间，首尾 `scale` 与 `bias` 为固定参数）：

```java
// 1.0 为 scale，中间 2.0, 3.0, 4.0 全部归入 items...，末尾 10.0 归入 bias
// 结果: 10.0 + 1.0 * (4 + 9 + 16) = 39.0
IExpression expr = IExpression.of(functions, "my_mod:weighted_sum(1.0, 2.0, 3.0, 4.0, 10.0)");
double result = expr.evaluate();
```

### 2. 在 Java 代码中构造带变参的 `CustomFunction` 或注册新 `IFunction.Type`

```java
package com.example.mymod.math;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import dev.anvilcraft.lib.v2.math.expression.IExpression;
import dev.anvilcraft.lib.v2.math.expression.function.CustomFunction;
import dev.anvilcraft.lib.v2.math.expression.function.IFunction;
import dev.anvilcraft.lib.v2.math.expression.function.Parameters;
import dev.anvilcraft.lib.v2.math.init.LibBuiltInFunctions;
import dev.anvilcraft.lib.v2.math.init.LibRegistries;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.List;

public final class ModMathExtensions {
    // 1. 用代码直接构造一个求平均值的内联 CustomFunction
    public static CustomFunction createAverageFunction(
        net.minecraft.core.HolderGetter<IFunction> functions
    ) {
        // foreach($(x...), n -> $(n)) 求和，除以 foreach($(x...), n -> 1) 求个数
        IExpression body = IExpression.of(
            functions,
            "foreach($(x...), n -> $(n)) / max(1, foreach($(x...), n -> 1))"
        );
        return CustomFunction.of(List.of("x..."), body);
    }

    // 2. 向 LibRegistries.FUNCTION_TYPE 注册自定义函数类型 IFunction.Type
    public static final DeferredRegister<IFunction.Type<?>> FUNCTION_TYPES =
        DeferredRegister.create(LibRegistries.FUNCTION_TYPE, "my_mod");

    public static final DeferredHolder<IFunction.Type<?>, ClampFunction.Type> CLAMP_TYPE =
        FUNCTION_TYPES.register("clamp", ClampFunction.Type::new);

    public static void register(IEventBus modEventBus) {
        FUNCTION_TYPES.register(modEventBus);
    }

    public record ClampFunction(double min, double max) implements IFunction {
        private static final Parameters PARAMS = Parameters.of(List.of("value"));

        @Override
        public Parameters parameters() {
            return PARAMS;
        }

        @Override
        public double apply(Call call) {
            return Math.clamp(call.valueAt(0), this.min, this.max);
        }

        @Override
        public IFunction.Type<? extends IFunction> type() {
            return IFunction.typeOf(CLAMP_TYPE.getKey());
        }

        public static class Type implements IFunction.Type<ClampFunction> {
            public static final MapCodec<ClampFunction> CODEC =
                com.mojang.serialization.codecs.RecordCodecBuilder.mapCodec(inst -> inst.group(
                    Codec.DOUBLE.fieldOf("min").forGetter(ClampFunction::min),
                    Codec.DOUBLE.fieldOf("max").forGetter(ClampFunction::max)
                ).apply(inst, ClampFunction::new));

            public static final StreamCodec<RegistryFriendlyByteBuf, ClampFunction> STREAM_CODEC =
                StreamCodec.composite(
                    ByteBufCodecs.DOUBLE, ClampFunction::min,
                    ByteBufCodecs.DOUBLE, ClampFunction::max,
                    ClampFunction::new
                );

            @Override
            public MapCodec<ClampFunction> codec() {
                return CODEC;
            }

            @Override
            public StreamCodec<RegistryFriendlyByteBuf, ClampFunction> streamCodec() {
                return STREAM_CODEC;
            }

            @Override
            public String getSerializedName() {
                return "clamp";
            }
        }
    }
}
```

---

## 三、 13 个内建函数一览 (`LibBuiltInFunctions`)

`LibBuiltInFunctions` 枚举实现了 `IFunction` 与 `StringRepresentable`，其函数类型注册名为 `anvillib:builtin`。所有内建函数的详细签名与边界行为如下：

| 枚举常量 | 序列化/Flat 名称 | 形参声明 | 求值语义与边界条件 |
| :--- | :--- | :--- | :--- |
| `ADD` | `add` | `["a", "b"]` | `a + b`（对应中缀 `+`） |
| `SUBTRACT` | `subtract` | `["a", "b"]` | `a - b`（对应中缀 `-`，一元负号 `-x` 表示为 `subtract(0, x)`） |
| `MULTIPLY` | `multiply` | `["a", "b"]` | `a * b`（对应中缀 `*`、`×`、`·` 及隐式并置乘法） |
| `DIVIDE` | `divide` | `["a", "b"]` | `a / b`（对应中缀 `/`、`÷`；除零返回 `NaN` 或 `±Infinity`，不抛异常） |
| `ABS` | `abs` | `["value"]` | `Math.abs(value)` |
| `FLOOR` | `floor` | `["value"]` | `Math.floor(value)` |
| `CEIL` | `ceil` | `["value"]` | `Math.ceil(value)` |
| `ROUND` | `round` | `["value"]` | `Math.round(value)`（注意：`NaN` 返回 `0`，超出 `long` 范围夹到 `Long.MIN_VALUE / MAX_VALUE`） |
| `SQRT` | `sqrt` | `["value"]` | `Math.sqrt(value)`（负数返回 `NaN`，不抛异常） |
| `POW` | `pow` | `["base", "exponent"]` | `Math.pow(base, exponent)`（对应右结合中缀 `^`） |
| `MIN` | `min` | `["x..."]` | 变参最小值；当传入 0 个实参或空变参列表时返回 `0.0` |
| `MAX` | `max` | `["x..."]` | 变参最大值；当传入 0 个实参或空变参列表时返回 `0.0` |
| `FOREACH` | `foreach` | `["x...", "function"]` | 遍历前 `N - 1` 个实参（支持展开 `$(list...)`），将每个元素依次传给最后一个参数（**必须是单固定形参的 `LambdaFunction`**），返回各次调用结果之和。若末位不是单固定参数 Lambda 则抛出 `IllegalArgumentException`。 |

### `LibBuiltInFunctions` 常用方法

| 方法签名 | 说明 |
| :--- | :--- |
| `public static @Nullable LibBuiltInFunctions byName(String name)` | 按忽略大小写的函数名查找内建函数枚举，不存在则返回 `null`。 |
| `public FunctionExpression call(IExpression... arguments)` / `call(List<IExpression> arguments)` | 构造对该内建函数的调用节点，并立即调用 `Parameters#checkArity(List)` 校验参数个数与 `Spread` 位置；不合法时抛出 `IllegalArgumentException`。 |
| `public DataResult<FunctionExpression> callChecked(List<IExpression> arguments)` | 同上，但参数不合法时返回 `DataResult.error(...)`。 |
| `public int minimumArity()` / `public int maximumArity()` / `public Identifier id()` | 获取最少参数个数、最多参数个数及 `anvillib:<name>` 标识符。 |

---

## 四、 `IFunction` 及 5 种通用函数实现详解

### 1. `IFunction` 接口核心成员

| 常量 / 方法 / 内部类型签名 | 说明 |
| :--- | :--- |
| `IFunction.DIRECT_CODEC` / `HOLDER_CODEC` / `CODEC` | • `DIRECT_CODEC`：按 `LibRegistries.FUNCTION_TYPE` 分发的内联对象 Codec；<br>• `HOLDER_CODEC`：`RegistryFileCodec.create(FUNCTION_KEY, DIRECT_CODEC)`，支持数据包注册名引用或内联对象；<br>• `CODEC`：编码时优先在 `RegistryOps` 中查找值相等的已注册 `Holder.Reference` 写出注册名，找不到时退化写出 `Holder.direct(input)` 内联定义。 |
| `IFunction.HOLDER_STREAM_CODEC` / `STREAM_CODEC` | 对应的 `RegistryFriendlyByteBuf` 网络流编解码器。 |
| `default double apply(List<IExpression> arguments, Arguments inputs)` | 默认调用 `IFunction.bind(arguments, inputs, this.parameters())` 完成实参求值与形参绑定，再委托 `apply(Call)`。 |
| `default double apply(Call call)` / `default double applyBound(List<Double> arguments, Arguments bound)` | 子类可重写 `apply(Call)`（可访问 `call.bound().list(name)` 变参列表与 `call.valueAt(i)`）或 `applyBound`。 |
| `default Parameters parameters()` | 返回形参声明列表（默认为 `Parameters.EMPTY`）。 |
| `default double guarded(String description, Supplier<Double> body)` | 在 `MAX_CALL_DEPTH = 64` 递归深度守卫下执行 `body.get()`。 |
| `static IFunction.Type<? extends IFunction> typeOf(ResourceKey<IFunction.Type<?>> key)` | 从 `LibRegistries.FUNCTION_TYPE` 获取已注册的 `Type` 实例（避免在无内置注册表环境下直接调 `DeferredHolder#get` 抛错）。 |
| `static Call bind(List<IExpression> arguments, Arguments inputs, Parameters parameters)` | 执行固定形参与任意位置变参的实参求值、展开与配位绑定，返回 `IFunction.Call(List<IExpression> references, List<Double> values, Arguments bound)`。 |

### 2. 5 种通用函数实现类（位于 `dev.anvilcraft.lib.v2.math.expression.function`）

| 类名 | 函数类型注册名 (`LibFunctionTypes`) | 工厂方法与核心说明 |
| :--- | :--- | :--- |
| `ConstantFunction(double value)` | `anvillib:constant` | • `ConstantFunction.of(double value)`：构造常量函数；<br>• `call()`：构造零参调用 `FunctionExpression`；<br>• `ConstantFunction.value(FunctionExpression)`：若该调用是零参常量调用，返回 `Optional<Double>`。 |
| `InputFunction(int index)` | `anvillib:input` | • `InputFunction.of(int index)` / `InputFunction.call(int index)`：按非负整数下标 `index` 读取 `Arguments#value(index)`（对应 Flat 语法中的 `x`, `y`, `z`, `xN`）。 |
| `NamedFunction(String name)` | `anvillib:named` | • `NamedFunction.of(String name)` / `NamedFunction.call(String name)`：按名字 `name` 读取 `Arguments#value(name)`。 |
| `CustomFunction(Parameters parameters, IExpression body)` | `anvillib:custom` | • `CustomFunction.of(List<String> declarations, IExpression body)`：支持 `"x..."` 变参声明；<br>• `CustomFunction.named(List<String> names, IExpression body)`：全部作为固定形参；<br>• 求值时在 `guarded` 深度守卫下计算 `body`。 |
| `LambdaFunction(Parameters parameters, IExpression body)` | `anvillib:lambda` | • `LambdaFunction.of(List<String> declarations, IExpression body)`；<br>• `LambdaFunction.named(List<String> names, IExpression body)`；<br>• `LambdaFunction.call(String parameter, IExpression body)`：构造单形参 Lambda 节点。支持词法闭包（沿用外层 `inputs` 具名绑定）。 |

---

## 五、 双注册表与缓存生命周期管理 (`dev.anvilcraft.lib.v2.math.init`)

| 类名 | 公开常量 / 方法签名 | 说明与重要注意事项 |
| :--- | :--- | :--- |
| `LibRegistries` | `FUNCTION_TYPE_KEY` (`anvillib:function_type`)<br>`FUNCTION_TYPE` (`Registry<IFunction.Type<?>>`)<br>`FUNCTION_KEY` (`anvillib:function`) | • `FUNCTION_TYPE` 是同步的代码注册表（最大 ID `512`），下游可通过 `DeferredRegister` 注册新的函数类型。<br>• `FUNCTION_KEY` 是**数据包注册表（DataPack Registry）**，只能在数据包 `data/<namespace>/anvillib/function/*.json` 中通过 JSON 注册，**不能使用 `DeferredRegister` 在代码中注册条目**（NeoForge 不会为数据包注册表触发 `RegisterEvent`）。代码中若需使用自定义函数，请直接用 `Holder.direct(function)` 或 `FunctionExpression.of(function, ...)` 内联构造。 |
| `LibFunctionTypes` | `INPUT`, `NAMED`, `CONSTANT`, `CUSTOM`, `LAMBDA`<br>`public static void register(IEventBus bus)` | 注册除 `builtin` 以外的 5 种基础 `IFunction.Type`。 |
| `LibCacheReloadHandler` | `onServerStarted(ServerStartedEvent)`<br>`onDatapackSync(OnDatapackSyncEvent)` | 在服务端启动与 `/reload`（`event.getPlayer() == null`）时自动调用 `FlatExpressionParser.clearCache()`，防止已解析表达式树中的 `Holder.Reference` 强引用旧注册表导致内存泄漏。 |
| `LibClientCacheHandler` | `onLoggingOut(ClientPlayerNetworkEvent.LoggingOut)` | 在物理客户端断开服务器连接时自动调用 `FlatExpressionParser.clearCache()`，释放上一次连接的数据包函数注册表缓存。 |
