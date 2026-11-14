# Math 可序列化数学表达式系统 (`module.math`)

<BranchContextCard branch="1.21.11" />

`module.math`（构件名 `anvillib-math-neoforge-1.21.11`，包名 `dev.anvilcraft.lib.v2.math`）提供了一套**支持数据包 JSON 定义、网络流同步、人类可读 Flat 公式字符串双向解析与回写、以及自定义多参函数的数学表达式求值引擎**。

在编写复杂的机器能耗公式、动态属性倍率或数据驱动技能数值时，`module.math` 将所有公式统一抽象为不可变的 **`IExpression`（底层实现为 `FunctionExpression`）**，既可以直接在 JSON 里写单行公式字符串 `"sin(x)^2 + cos(x)^2"`，也可以写结构化 JSON 对象，并在求值前自动执行参数个数校验与纯常量折叠优化（`tryCollapse`）。

本模块按功能拆分为 2 篇子文档：
- **本篇（表达式语法、解析回写与求值）**：详解 `AnvilLibMath`、`IExpression`、`FunctionExpression`、`Arguments`、`FlatExpressionParser` 与 `FlatExpressionWriter`。
- **[函数体系、内置函数与双注册表](./functions-and-registries)**：详解 `IFunction` 及其 5 种实现类、`Parameter`/`Parameters`、`LibBuiltInFunctions`、`LibFunctionTypes` 与 `LibRegistries`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.11`，则已自动包含本模块；若仅需单独引入 `math` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-math-neoforge-1.21.11:2.0.0")
}
```

---

## 二、 Flat 表达式语法速览 (`FlatExpressionParser`)

`IExpression.CODEC` 默认优先尝试将字符串按 Flat 表达式语法解析（并支持通过 `FlatExpressionWriter` 还原为带最简括号的字符串）：

| 语法元素 | 写法示例 | 优先级（从低到高）与结合性 | 对应内置函数 ID (`anvillib:<name>`) |
| :--- | :--- | :--- | :--- |
| **加 / 减** | `a + b`、`a - b` | 优先级 `1`，左结合 | `anvillib:add`、`anvillib:subtract` |
| **乘 / 除 / 取模** | `a * b`、`a / b`、`a % b` | 优先级 `2`，左结合 | `anvillib:multiply`、`anvillib:divide`、`anvillib:modulo` |
| **一元正 / 负号** | `+x`、`-x` | 优先级 `3`（高于乘除，低于乘方，故 `-x^2` 解析为 `-(x^2)`） | `+x` 直接展开为 `x`；`-x` 对应 `anvillib:negate` |
| **乘方（幂）** | `x ^ y` | 优先级 `4`，**右结合**（`a ^ b ^ c` 解析为 `a ^ (b ^ c)`） | `anvillib:power` |
| **括号** | `(a + b) * c` | 最高优先级 | — |
| **数字字面量** | `3.14`、`.5`、`1e-3` | 叶节点 | 构造内联 `ConstantFunction` |
| **函数调用** | `sin(x)`、`max(a, b, 10)`、`my_mod:custom(x)` | 叶节点（未写命名空间时默认补全为 `anvillib:<name>`） | 从 `LibRegistries.FUNCTION_KEY` 数据包注册表查找 |
| **具名变量引用** | `x`、`temperature`、`my_mod:env_temp` | 叶节点（不带括号的标识符，等价于无参函数调用） | 从 `LibRegistries.FUNCTION_KEY` 查找对应的 `InputFunction` 或无参常量函数（如 `pi`、`e`） |

---

## 三、 完整代码示例：在代码中构造、解析与求值数学表达式

```java
package com.example.mymod.math;

import com.mojang.serialization.DynamicOps;
import dev.anvilcraft.lib.v2.math.expression.Arguments;
import dev.anvilcraft.lib.v2.math.expression.FunctionExpression;
import dev.anvilcraft.lib.v2.math.expression.IExpression;
import dev.anvilcraft.lib.v2.math.expression.function.ConstantFunction;
import dev.anvilcraft.lib.v2.math.expression.function.IFunction;
import dev.anvilcraft.lib.v2.math.expression.function.InputFunction;
import dev.anvilcraft.lib.v2.math.init.LibBuiltInFunctions;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.RegistryOps;

import java.util.List;

public final class MathExpressionExample {
    private MathExpressionExample() {
    }

    /**
     * 方式 1：通过 RegistryOps 直接从 Flat 公式字符串解码出 IExpression 并求值
     * 注意：x、y、z、w、pi、e 已由 LibBuiltInFunctions 在数据包中预置！
     */
    public static double parseAndEvalFromFormula(HolderLookup.Provider registries, double xVal, double yVal) {
        DynamicOps<Tag> ops = RegistryOps.create(NbtOps.INSTANCE, registries);

        // 解码字符串 "clamp(x ^ 2 + 2 * y, 0, 100) + sin(pi / 2)"
        // 解码后会自动调用 tryCollapse() 将纯常量分支 sin(pi / 2) 预先折叠为常数 1.0！
        IExpression expr = IExpression.CODEC.parse(
            ops,
            StringTag.valueOf("clamp(x ^ 2 + 2 * y, 0, 100) + sin(pi / 2)")
        ).getOrThrow();

        // 构造输入变量表并求值
        Arguments args = Arguments.builder()
            .with("x", xVal)
            .with("y", yVal)
            .build();

        return expr.eval(args);
    }

    /**
     * 方式 2：在纯 Java 代码中不依赖数据包注册表，直接用 Holder.direct 组装表达式
     */
    public static double buildProgrammaticExpression(double inputTemp) {
        Holder<IFunction> tempVar = Holder.direct(new InputFunction("temp"));
        Holder<IFunction> factorConst = Holder.direct(new ConstantFunction(2.5));

        // 构造 temp * 2.5
        IExpression expr = FunctionExpression.of(
            LibBuiltInFunctions.MULTIPLY,
            List.of(
                FunctionExpression.leaf(tempVar),
                FunctionExpression.leaf(factorConst)
            )
        );

        return expr.eval(Arguments.builder().with("temp", inputTemp).build());
    }
}
```

---

## 四、 核心接口与类 API 详解 (`dev.anvilcraft.lib.v2.math.expression`)

### 1. `IExpression` 与 `FunctionExpression`

| 接口 / 类 | 常量 / 方法签名 | 说明 |
| :--- | :--- | :--- |
| **`IExpression`** | • `Codec<IExpression> CODEC`<br>• `StreamCodec<RegistryFriendlyByteBuf, IExpression> STREAM_CODEC`<br>• `double eval(Arguments args)`<br>• `Holder<IFunction> function()`<br>• `List<IExpression> subExpressions()`<br>• `IExpression tryCollapse()` | 数学表达式顶层接口。`CODEC` 支持读取 Flat 公式字符串或 `FunctionExpression` 对象结构；写出时若 `FlatExpressionWriter` 能无损回写并经重解析等价校验通过，则优先输出简洁的 Flat 字符串，否则自动回退为对象结构。 |
| **`FunctionExpression`** | • `MapCodec<FunctionExpression> CODEC`<br>• `StreamCodec<RegistryFriendlyByteBuf, FunctionExpression> STREAM_CODEC`<br>• `public static FunctionExpression of(Holder<IFunction> function, List<IExpression> subExpressions)`<br>• `public static FunctionExpression leaf(Holder<IFunction> function)`<br>• `public static FunctionExpression constant(double value)` | `IExpression` 的唯一标准实现记录。`of(...)` 在构造时会调用 `function.value().expectedParams().validateCount(subExpressions.size())` 严格校验实参个数，不匹配时立即抛出 `IllegalArgumentException`。<br>`tryCollapse()` 会自底向上递归折叠：若某节点自身及所有子表达式均不依赖外部输入（`!function.requireInput()` 且所有子节点均为内联 `ConstantFunction`），则直接求值替换为 `FunctionExpression.constant(val)`。 |

---

### 2. `Arguments`（命名输入变量表）

用于向表达式中的 `InputFunction`（如 `x`、`y`、`z`、`w` 或自定义变量名）传递运行时数值。

| 方法签名 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `public static final Arguments EMPTY` | `Arguments` | 空参数表常量（当表达式不含任何 `InputFunction` 时可直接传 `Arguments.EMPTY`）。 |
| `public static Arguments.Builder builder()` | `Builder` | 创建参数表构建器（在构建器内部通过 `with(String name, double value)` 填入变量并调用 `build()`）。 |
| `public double get(String name)` | `double` | 读取名为 `name` 的变量值；若未提供该变量，抛出 `IllegalArgumentException("Missing input argument: " + name)`。 |

---

### 3. `FlatExpressionParser` 与 `FlatExpressionWriter`

| 类名 | 公开方法签名 | 说明 |
| :--- | :--- | :--- |
| **`FlatExpressionParser`** | `public static DataResult<IExpression> parse(String input, HolderGetter<IFunction> functions)` | 将中缀数学公式字符串解析为 `IExpression`。若存在词法/语法错误、括号不匹配、未知函数名或函数参数个数不符，均通过 `DataResult.error` 返回具体错误位置原因（不会向调用方泄漏未捕获异常）。 |
| **`FlatExpressionWriter`** | `public static DataResult<String> write(IExpression expression, HolderGetter<IFunction> functions)` | 将 `IExpression` 树逆向格式化为最简括号的中缀字符串，并在内部自动重跑一遍 `FlatExpressionParser.parse` 进行结构等价性自检（防止例如被覆盖了名字的同名函数产生歧义）。 |
