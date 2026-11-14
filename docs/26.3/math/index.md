# Math 数学表达式模型、Flat 语法与 Codec (`module.math`)

<BranchContextCard branch="26.3" />

`module.math`（构件名 `anvillib-math-neoforge-26.3`，包名 `dev.anvilcraft.lib.v2.math`）提供了一套**支持数据包 JSON 序列化、网络同步、人类可读 Flat 文本解析与自校验反向回写**的数学表达式树系统。

当模组允许数据包作者在 JSON 中配置动态公式（例如：随机器等级、多方块尺寸或距离变化的能耗、伤害、冷却时间公式）时，硬编码固定系数缺乏自由度，而直接暴露脚本引擎又存在安全风险与网络同步难题。`module.math` 将所有公式统一表示为不可变的 `IExpression` 函数调用树，并提供三种自动互转的序列化形式：**纯数字**、**Flat 表达式文本**（如 `"2x + sqrt($(tier)) * 1.5"`）与**结构化 JSON 对象**。

本模块按功能拆分为 2 篇子文档：
- **本篇（表达式模型、Flat 语法与 Codec）**：详解 `AnvilLibMath`、`IExpression`、`FunctionExpression`、`Arguments`、`FlatExpressionParser` 与 `FlatExpressionWriter`。
- **[函数体系、变参、内建函数与注册表](./functions-and-registries)**：详解 `IFunction`、`ConstantFunction`、`InputFunction`、`NamedFunction`、`LambdaFunction`、`CustomFunction`、`Parameter` / `Parameters`、`LibBuiltInFunctions`、`LibFunctionTypes`、`LibRegistries` 及缓存清理处理器。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.3`，则已自动包含本模块；若仅需单独引入 `math` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-math-neoforge-26.3:2.0.0")
}
```

---

## 二、 Flat 表达式语法全解

`FlatExpressionParser` 将紧凑的数学公式文本直接解析为 `IExpression` 树，语法规则如下：

| 语法特性 | 写法示例 | 解析后的语义说明 |
| :--- | :--- | :--- |
| **数字字面量** | `42`、`-3.5`、`1.5E-4` | 解析为 `ConstantFunction.of(value).call()`。非有限值（溢出为 `Infinity`）在解析期直接报错。 |
| **按下标位置变量** | `x`、`y`、`z`、`x0`、`x1`、`x12` | 不区分大小写：`x` ≡ `x0`（第 0 个下标参数）、`y` ≡ `x1`（第 1 个）、`z` ≡ `x2`（第 2 个）、`xN`（第 N 个），全部解析为 `InputFunction.call(index)`。若 `x` 后的数字超出 `int` 范围则在解析期报错。 |
| **按名字具名变量** | `$(cost)`、`$(tier)` | 解析为 `IExpression.Reference.Named("cost")`。求值时从 `Arguments` 的具名绑定表中取值；若绑定的是变参列表，则取列表中的最大值。 |
| **变参列表展开引用** | `$(items...)` | 解析为 `IExpression.Reference.Spread("items")`。代表将变参绑定的整份 `List<Double>` 原样传递给另一个变参形参位（如 `min($(items...))` 或 `foreach($(items...), v -> $(v)*2)`）。**不能直接作为普通单值表达式求值**。 |
| **加减乘除与乘方** | `a + b`、`a - b`、`a * b`、`a × b`、`a · b`、`a / b`、`a ÷ b`、`a ^ b` | 乘号支持 `*`、`×`、`·`；除号支持 `/`、`÷`；乘方 `^` 为**右结合**（`2^3^4` ≡ `2^(3^4)`）。一元负号优先级低于乘方（`-2^2` 解析为 `-(2^2) = -4`，写 `(-2)^2` 才是负底数 `4`）。 |
| **隐式并置乘法** | `2x`、`2(x + 1)`、`3sqrt(x)`、`2$(cost)` | 当左操作数后紧跟括号 `(`、`$` 或标识符起始字符时，自动插入 `multiply` 乘法调用。 |
| **函数调用** | `sqrt(x)`、`max(1, x, y)`、`mymod:triple(x)` | 不带命名空间的函数名默认补齐为 `anvillib:<name>`。在 `anvillib` 命名空间下优先匹配 `LibBuiltInFunctions` 内建函数，未命中再查数据包注册表 `anvillib:function`；其他命名空间先查数据包注册表，未命中再回退同名内建函数。**实参个数在解析期即完成校验**。 |
| **匿名函数 (Lambda)** | `x -> $(x) * 2`<br>`(a, b) -> $(a) + $(b)`<br>`x... -> max($(x...))` | 单参数可省略括号，多参数用 `(a, b) -> ...`，变参形参以 `...` 结尾。解析为 `FunctionExpression.of(LambdaFunction.of(params, body))`（如传给 `foreach` 的最后一个参数）。 |

---

## 三、 三种内联编码形式与自校验回写

在数据包 JSON 中使用 `IExpression.CODEC` 序列化时，解码支持三种写法，而编码会按优先级自动选择最简形式：

1. **纯数字（最高优先级）**：若根节点是零参 `ConstantFunction` 调用（如 `IExpression.of(5.0)`），直接编码为 JSON 数字 `5.0`。
2. **Flat 文本（次高优先级）**：`FlatExpressionWriter` 尝试将表达式树回写为规范化 Flat 字符串（例如隐式乘法统一写为 `2x`，省略 `anvillib:` 命名空间）。
   - **往返自校验（Round-Trip Verification）**：在返回文本前，`FlatExpressionWriter.write` 会将写出的文本重新交给 `FlatExpressionParser.parseValue` 解析一遍，再写一遍，并调用 `sameMeaning(original, reparsed)` 比对两棵树语义是否完全一致且两次写出的文本完全相同。
   - 一旦树中包含未注册的内联 `CustomFunction`、零参 Lambda、名称与内建函数冲突的 `anvillib` 函数、含特殊字符的变量名或无法通过往返校验的并置形式（如 `2 * e1(x)` 并置成 `2e1(x)` 会被误读为科学计数法 `20 * x`，此时预检会自动退回显式乘号 `"2*e1(x)"`），回写器绝不写出损坏文本，而是安全回退到第 3 种对象形式。
3. **函数调用对象（兜底形式）**：写为 `{"function": ..., "arguments": [...]}` 结构。

---

## 四、 完整代码示例

下面演示如何解析 Flat 表达式、使用位置参数与具名/变参 `Arguments` 求值，以及通过 `RegistryOps` 与 JSON 互转：

```java
package com.example.mymod.math;

import com.google.gson.JsonElement;
import com.mojang.serialization.JsonOps;
import dev.anvilcraft.lib.v2.math.expression.Arguments;
import dev.anvilcraft.lib.v2.math.expression.IExpression;
import dev.anvilcraft.lib.v2.math.expression.function.IFunction;
import dev.anvilcraft.lib.v2.math.init.LibBuiltInFunctions;
import dev.anvilcraft.lib.v2.math.init.LibRegistries;
import net.minecraft.core.HolderGetter;
import net.minecraft.core.HolderLookup;
import net.minecraft.resources.RegistryOps;

import java.util.List;

public final class MachineFormulaExample {
    private MachineFormulaExample() {
    }

    public static void evaluateExamples(HolderLookup.Provider registries) {
        HolderGetter<IFunction> functions = registries.lookupOrThrow(LibRegistries.FUNCTION_KEY);

        // 1. 解析含隐式乘法、乘方、内建函数与下标变量 x, y 的 flat 表达式
        IExpression energyExpr = IExpression.of(functions, "2x^2 + 10y + sqrt(x)");
        // x = 4.0, y = 3.0 -> 2*(16) + 30 + 2 = 64.0
        double energy = energyExpr.evaluate(4.0, 3.0);
        int roundedEnergy = energyExpr.evaluateInt(4.0, 3.0);

        // 2. 解析含具名变量 $(base) 与变参列表 $(bonuses...) + Lambda 的表达式
        IExpression totalScoreExpr = IExpression.of(
            functions,
            "$(base) + foreach($(bonuses...), v -> $(v) * 1.5)"
        );
        Arguments args = Arguments.of(
            List.of(), // 无位置参数
            List.of("base", "bonuses"),
            List.of(
                new Arguments.Value.Single(100.0),
                new Arguments.Value.Many(List.of(10.0, 20.0, 30.0))
            )
        );
        // 100 + (15 + 30 + 45) = 190.0
        double score = totalScoreExpr.evaluate(args);

        // 3. 代码直接构造表达式树并使用 IExpression.CODEC 序列化为 JSON
        IExpression codeBuilt = LibBuiltInFunctions.ADD.call(
            LibBuiltInFunctions.MULTIPLY.call(IExpression.of(2.0), IExpression.of(functions, "x")),
            IExpression.of(1.0)
        );
        RegistryOps<JsonElement> registryJsonOps = RegistryOps.create(JsonOps.INSTANCE, registries);
        // 自动回写为 JSON 字符串: "2x+1"
        JsonElement json = IExpression.CODEC.encodeStart(registryJsonOps, codeBuilt).getOrThrow();
    }
}
```

---

## 五、 公开类与接口 API 详解

### 1. `IExpression`（表达式节点根接口）

位于 `dev.anvilcraft.lib.v2.math.expression.IExpression`。

| 常量 / 方法 / 内部接口签名 | 返回值 | 说明与边界行为 |
| :--- | :--- | :--- |
| `IExpression.CODEC` | `Codec<IExpression>` | 完整三合一 Codec（数字 / Flat 文本 / 函数调用对象）。**注意**：由于 Flat 文本分支需要查询 `LibRegistries.FUNCTION_KEY`，编码和解码时传入的 `DynamicOps` 必须是 `RegistryOps`。 |
| `IExpression.FLAT_OR_OBJECT_CODEC` | `Codec<IExpression>` | Flat 文本与 `FunctionExpression` 对象二选一 Codec（编码时优先尝试 Flat 文本，无法回写时自动退回对象形式）。 |
| `IExpression.LIST_CODEC` | `Codec<List<IExpression>>` | `IExpression.CODEC.listOf()`。 |
| `IExpression.STREAM_CODEC` | `StreamCodec<RegistryFriendlyByteBuf, IExpression>` | 延迟初始化的带注册表上下文网络流编解码器。 |
| `double evaluate(Arguments inputs)` | `double` | 在给定 `Arguments` 上下文中求值。除零（返回 `NaN` 或 `±Infinity`）、负数开方（返回 `NaN`）、下标越界（返回 `0`）、具名变量未绑定（返回 `0`）均不会抛出异常。 |
| `default double evaluate(double... inputs)` | `double` | 仅传入位置下标参数求值的便捷重载（等价于 `evaluate(Arguments.of(inputs))`）。 |
| `default int evaluateInt(Arguments inputs)` / `evaluateInt(double... inputs)` | `int` | 调用 `(int) Math.round(this.evaluate(...))`。<br>**边界注意**：`Math.round(NaN)` 返回 `0`；超出 `long` 范围夹到 `Long.MIN_VALUE / MAX_VALUE` 后强转 `(int)` 会发生 32 位补码回绕（例如 `3e9` 强转后为负数）。若需处理无穷或超大数请先调 `evaluate` 检查。 |
| `static Reference ref(String name)` | `IExpression.Reference` | 创建具名引用节点：若 `name` 以 `"..."` 结尾则返回 `Reference.Spread(baseName)`，否则返回 `Reference.Named(name)`。 |
| `static FunctionExpression of(double value)` | `FunctionExpression` | 创建数字常量表达式节点（`ConstantFunction.of(value).call()`）。 |
| `static IExpression of(HolderGetter<IFunction> functions, String source)` | `IExpression` | 解析一段 Flat 表达式文本；语法不合法时抛出 `IllegalArgumentException`。 |
| `static FunctionExpression of(IFunction function, IExpression... arguments)` | `FunctionExpression` | 创建内联函数调用节点。 |
| `sealed interface Reference extends IExpression` | `Named` / `Spread` | • `Reference.Named(String name)`：求值时调用 `inputs.value(name)`；<br>• `Reference.Spread(String name)`：表示 `$(name...)` 整份变参列表，只能传给变参形参位；若直接对其调用 `evaluate(inputs)` 会抛出 `IllegalStateException`。 |

### 2. `FunctionExpression`（函数调用节点记录）

```java
public record FunctionExpression(Holder<IFunction> function, List<IExpression> arguments) implements IExpression
```

| 常量 / 方法签名 | 说明 |
| :--- | :--- |
| `FunctionExpression.MAP_CODEC` / `CODEC` / `STREAM_CODEC` | 结构化对象形式 `{"function": ..., "arguments": [...]}` 的编解码器与流编解码器（`"arguments"` 可选，默认为空列表）。 |
| `public static FunctionExpression of(IFunction function, IExpression... arguments)` | 使用 `Holder.direct(function)` 包装内联函数并构造调用节点。 |
| `public static FunctionExpression of(Holder<IFunction> function, IExpression... arguments)` | 使用注册表引用 `Holder<IFunction>` 构造调用节点。 |
| `public double evaluate(Arguments inputs)` | 委托 `this.function.value().apply(this.arguments, inputs)` 执行求值。 |

### 3. `Arguments`（求值实参上下文记录）

```java
public record Arguments(List<Double> values, Map<String, Value> named)
```

| 内部类型 / 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `Arguments.Value` (`sealed interface`) | `Single` / `Many` | • `record Single(double value)`：单个数字绑定；<br>• `record Many(List<Double> values)`：变参绑定的一串数字列表（不可变副本，可能为空）。 |
| `public static Arguments of(double... values)` | `Arguments` | 构造仅包含位置下标参数、无具名绑定的 `Arguments`。 |
| `public static Arguments of(List<Double> values, List<String> names, List<Value> bound)` | `Arguments` | 同时绑定位置参数 `values` 与一批具名参数（`names` 与 `bound` 按下标一一对应）。 |
| `public Arguments withAll(List<String> names, List<Value> bound)` | `Arguments` | 在保留现有 `values` 和 `named` 的基础上叠加一批新具名绑定（同名时新值覆盖旧值），返回新 `Arguments`。 |
| `public double value(int index)` | `double` | 按下标读取位置参数；若 `index < 0` 或 `index >= values.size()`，安全返回 `0.0`。 |
| `public double value(String name)` | `double` | 按名字读取单个数字：未绑定时返回 `0.0`；绑定为 `Single` 时返回该值；绑定为 `Many`（变参列表）时返回**列表中的最大值**（空列表返回 `0.0`）。 |
| `public List<Double> list(String name)` | `List<Double>` | 读取绑定到 `name` 的变参列表（`Value.Many`）；若未绑定或绑定为 `Single`，返回空列表 `List.of()`。 |
| `public boolean isList(String name)` | `boolean` | 判断 `name` 是否显式绑定为 `Value.Many`（用于区分“合法的空变参列表 `Many([])`”与“拼错变量名导致的未绑定”）。 |

### 4. `FlatExpressionParser` 与 `AnvilLibMath`

| 类 / 方法签名 | 说明 |
| :--- | :--- |
| `AnvilLibMath.MAIN_ID` / `MOD_ID` / `of(String path)` | `MAIN_ID = "anvillib"`，`MOD_ID = "anvillib_math"`，`of(path)` 返回 `anvillib:<path>`。 |
| `public static Codec<IExpression> FlatExpressionParser.codec()` | 纯 Flat 文本字符串的 `Codec<IExpression>`（仅接受 `RegistryOps`）。 |
| `public static IExpression FlatExpressionParser.parseValue(String source, HolderGetter<IFunction> functions)` | 解析 Flat 文本并缓存结果（每个 `HolderGetter` 缓存最多 `512` 条 LRU 记录）。嵌套计数守卫上限为 `MAX_NESTING_DEPTH = 512`（像 `sqrt(sqrt(...))` 每层经过 `parseLambda`、`parseUnary`、`parsePower` 3 处守卫，最多可嵌套 `169` 层；一元正负号链最多 `512` 层），超出时抛出可读的 `IllegalArgumentException` 防止栈溢出。 |
| `public static void FlatExpressionParser.clearCache()` | 清空全局解析缓存（服务端启动、`/reload` 数据包同步与客户端退出服务器时由内置事件处理器自动调用；若在单元测试中自建注册表可手动调用）。 |
| `public static @Nullable HolderGetter<IFunction> FlatExpressionParser.functionGetter(DynamicOps<?> ops)` | 从 `RegistryOps` 中提取 `LibRegistries.FUNCTION_KEY` 的 `HolderGetter`。 |
