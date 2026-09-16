---
title: Math flat 语法
prev: false
next: false
---

# flat 表达式语法

`FlatExpressionParser` 把 `x*2`、`2x`、`2$(cost)+1` 这样的文本解析为表达式树，`FlatExpressionWriter`（包私有）负责反方向回写。解析与回写共用同一套「什么样的名字写得出来」的规则，避免两侧各自漂移。

## 字面量与引用

| 语法         | 含义                        |
|------------|---------------------------|
| `2`、`2.5`、`.5`、`1.` | 数字常量（前导点与尾随点都接受）          |
| `1e3`、`-5.0E-4` | 指数记法，指数位数必须是 1–8 位         |
| `x`、`y`、`z` | 第 0、1、2 个传入值              |
| `x0`、`x1`、`x12` | 按下标引用传入值                  |
| `$(name)`  | 按名字引用传入值                  |
| `$(name...)` | 引用整份变参列表，只能作为变参函数的实参     |
| `sqrt(x)`  | 函数调用                      |
| `anvillib:sqrt(x)` | 带命名空间的函数调用           |

- `$(name)` 取一个数字；`name` 绑定到变参上时得到列表里的**最大值**
- `$(name...)` 取的是**整份列表**本身，它不是数字，用在需要单个数字的位置会在求值期报错
- 整份列表传给变参位置时会被**摊开**：`min($(x...), 4)` 在 `x = [9, 2, 7]` 时就是 `min(9, 2, 7, 4)`
- `$(...)` 的载荷一直扫到**第一个** `)`，不处理嵌套与转义，两侧空白会被去掉，因此 `$( cost )` 等价于 `$(cost)`
- `x` 是 `<input 0>` 的别名，`y` 是 `<input 1>`，`z` 是 `<input 2>`，其余下标写 `x<数字>`；下标超出 `int` 范围时解析期就报 `input index is too large: '<数字>'`
- `x` 与 `$(x)` **不是一回事**：前者按下标取值，后者按名字绑定取值，只有恰好同名同位置时才得到相同结果
- 标识符字符集是 `[A-Za-z_]` 开头、`[A-Za-z0-9_:.]` 后续，因此 `a.b`、`ns:name` 都是**一个**记号，`x.y` 会被当成未知函数而不是 `x` 乘 `y`

## 运算符

| 运算符            | 写法                       | 优先级 | 结合性 |
|----------------|--------------------------|-----|-----|
| lambda 箭头      | `->`                     | 最低  | 右结合 |
| 加、减            | `+` `-`                  | 1   | 左结合 |
| 乘、除            | `*` `×` `·` / `/` `÷`    | 2   | 左结合 |
| 隐式乘法           | 并置                       | 2   | 左结合 |
| 一元正负号          | `+` `-`                  | 3   | 右结合 |
| 乘方             | `^`                      | 4   | 右结合 |

- **隐式乘法**：并置即可相乘，但只在右侧以 `(`、`$` 或标识符开头时成立——`2x`、`2(x+1)`、`2$(cost)`、`x y` 都是乘法，而 `2 3` 不是（报 `unexpected character` 或 `expected ',' or ')'`）
- **点乘**：乘号可以写成 `·`（U+00B7）或 `×`（U+00D7），除号可以写成 `÷`（U+00F7）；回写时一律写成 `*` 与 `/`
- **一元正负号**在 `^` 之下、`*` 之上：`-x^2` 是 `-(x^2)`，`-x*y` 是 `-(x*y)`；`-2^2` 也是 `-(2^2)`（`-4`），要负底数得写 `(-2)^2`
- 符号紧跟数字时会被吸收进字面量（`-2`、`+1.5`、`-5.0E-4`），因此 `2^-2` 合法
- 空格可自由插入，会被跳过；连 `->` 的 `-` 与 `>` 之间都可以有空白（`a - > b` 是 lambda）

运算符与内置函数是硬绑定的：`+`→`add`、`-`→`subtract`、`*`→`multiply`、`/`→`divide`、`^`→`pow`，解析运算符时**不查注册表**。

## lambda

lambda 写成 `参数 -> 函数体`（`-` 后面紧跟 `>`），作为值传给别的函数：

| 写法                    | 含义            |
|-----------------------|---------------|
| `x -> $(x)*2`         | 单形参 lambda    |
| `(a, b) -> $(a)+$(b)` | 多形参 lambda    |
| `x... -> min($(x...))` | 变参形参 lambda  |

- 单形参时括号可以省；回写成**规范形式**时一律省掉括号，因此 `(a) -> $(a)` 会写成 `a -> $(a)`
- 只有参数列表本身合法时才按 lambda 解析，因此减法不会被误当成箭头：`x-1` 仍然解析为减法，回写也是 `x-1`
- 形参名以 `...` 结尾是变参，规则与自定义函数一致（最多一个变参、可以不在末位、下限为 0），见[自定义函数](./custom-function#变参形参)
- 形参名必须是标识符，`()` 这样的空参数串会被当作「缺参数名」报错，所以零形参 lambda 只能写成对象形式
- lambda 是**闭包**：函数体既能读自己的形参，也能读调用点绑定的名字
- lambda 绑定得最松，函数体不用补括号；函数体本身是 lambda 时按右结合解析，`x -> y -> $(x)+$(y)` 回写成同样的文本
- lambda 是值：可以作为实参传给别的函数，对象形式里序列化为函数类型 `anvillib:lambda`；它落在运算符的操作数位置时会补上括号，因为 `->` 绑得比所有运算符都松，省掉括号会读成另一棵树（`2(x -> $(x))` 回写成 `2*(x -> $(x))`）

## 函数名与命名空间

函数名一律先按注册名处理：

1. 不带命名空间的名字补成 `anvillib`，然后：
    - 命中内置函数名时走内置函数，并在**解析期**校验参数个数，例如 `sqrt(x)`
    - 否则查 `anvillib:function` 数据包注册表，所以数据包函数 `triple` 在文本里写 `triple(x)` 即可
2. 带命名空间的名字先查 `anvillib:function` 数据包注册表，注册表里有就用注册表里的函数（其它命名空间的函数可以覆盖同名内置函数）
3. 注册表里没有时，再按路径回退到同名内置函数，因此 `mymod:sqrt(x)` 与 `sqrt(x)` 等价
4. 都找不到时抛出 `unknown function '<名字>'`

注意第 1 步与第 2 步的**顺序不同**：`anvillib` 命名空间下内置函数优先，因此数据包里注册一个 `anvillib:sqrt` 也不会被文本用上（这正是回写侧拒绝把这种函数写成裸名的原因）。名字解析前会转成小写，所以 `SQRT(x)`、`X5` 都能读，而注册表里路径含大写字母的条目无法从文本引用。

变量优先于函数：`x`、`y`、`z`、`x0`… 先被认成传入值引用，因此注册一个叫 `x` 的函数也**无法**从文本里调用它。

回写时反之：能写成裸名的函数一律省略 `anvillib` 命名空间，其它命名空间原样保留。「能写成裸名」的判定与解析器的规则严格对齐（`FlatExpressionParser.isWritableFunctionName`，回写侧与解析侧共用），下面几种名字写不出裸名、只能退回对象形式：

- 与内置函数同名（`anvillib:sqrt`）：解析器优先按内置函数处理
- 与传入值名相同（`x`、`y`、`z`、`x0`、`x12`）：解析器**先认变量、后认函数**，`x0(5)` 会读成 `<input 0> * 5`，函数根本不会被调用
- 路径含标识符字符集（`[A-Za-z_][A-Za-z0-9_:.]*`）之外的字符：`collision-free`（`-`）、`utils/triple`（`/`）都读到一半就停了
- 名字以 `.` 结尾（如 `x.`）或为空

```java
// 解析
"sqrt(x)"           // -> anvillib:sqrt（内置函数）
"mymod:triple(x)"   // -> mymod:triple（查数据包注册表）

// 回写
anvillib:sqrt       // -> "sqrt"
mymod:triple        // -> "mymod:triple"
```

## 参数个数校验

内置函数与数据包函数的参数个数都在**解析期**就校验，错误信息带位置：

```java
FlatExpressionParser.parseValue("sqrt(x,1)", functions);
// IllegalArgumentException: function 'anvillib:sqrt' Expected 1 arguments but got 2 at position 9 of expression "sqrt(x,1)"

FlatExpressionParser.parseValue("mymod:triple(1)", functions);
// IllegalArgumentException: function 'mymod:triple' Expected 2 arguments but got 1 at position 15 of expression "mymod:triple(1)"
```

数据包函数不能等求值期再报错：那样一份个数不符的表达式能正常解析并落进存档，直到 BE tick 或数据包加载深处才抛异常。判定依据就是函数自己声明的 `parameters()`，与求值期 `IFunction.bind` 用的是同一份声明，所以提前报错不会改变任何本来能跑通的写法。规则本身在 `Parameters.checkArity(List<IExpression>)` 里，解析期、`LibBuiltInFunctions.call` 与 `callChecked` 共用同一份实现。

变参形参按 Java 的变参语义处理：**下限是 0**，可以一个实参都不给，取不到值时由函数自己兜底。所以 `min()` / `max()` 是合法调用，返回 0；`"x...": []` 也是一次正常的空调用。

```java
FlatExpressionParser.parseValue("min()", functions).evaluate(Arguments.of());       // 0.0
FlatExpressionParser.parseValue("max()", functions).evaluate(Arguments.of());       // 0.0
```

固定形参不受影响，一个都不能少；固定形参与变参混在一起时下限就是固定形参个数：

```java
// 声明是 (x..., last)：last 必须给值，x 可以一个都不给
CustomFunction.of(List.of("x...", "last"), NamedFunction.call("last")).parameters().minimumArity();   // 1
CustomFunction.of(List.of("x..."), NamedFunction.call("x")).parameters().minimumArity();              // 0
```

`$(x...)` 是**整份列表**，只能落在变参形参位上，所以它按下面这条规则参与校验：

- 函数**有**变参形参：列表接得住，长度要等求值才知道，解析期放行，长度是否落在区间里由 `IFunction.bind` 按真实长度判定
- 函数**没有**变参形参：固定形参位一个都接不住列表，这次调用无论列表多长都不合法，直接按“非铺开实参个数”报出来

配位是按**实参个数**算的：变参形参先把它后面几个固定形参的位置留出来，剩下的才归它，`$(name...)` 从变参位开始摊开占用若干位。所以空列表（`$(name...)` 摊出 0 个）不占实参位，后面的固定形参照样能拿到自己的那个值；反过来，摊出来的个数超过变参位能吃的数就报 `provides N arguments but this position takes M`。

```java
// 形参 (x..., last)，x = [] 时：空列表不占位，last 拿到 1，x 是空列表
FlatExpressionParser.parseValue("f($(x...), 1)", functions);
// 形参 (x..., last)，x = [5, 6] 时：变参只剩一位可吃，装不下两个
// IllegalStateException: Spread[name=x] provides 2 arguments but this position takes 1
FlatExpressionParser.parseValue("f($(x...), 1)", functions);
```

```java
FlatExpressionParser.parseValue("min($(x...))", functions);        // OK，min 是变参函数
FlatExpressionParser.parseValue("sqrt($(x...))", functions);
// IllegalArgumentException: function 'anvillib:sqrt' Expected 1 arguments but got 0 at position 13 of expression "sqrt($(x...))"
FlatExpressionParser.parseValue("mymod:triple($(x...))", functions);   // triple 是 (a, b)
// IllegalArgumentException: function 'mymod:triple' Expected 2 arguments but got 0 at position 21 of expression "mymod:triple($(x...))"
```

手动构造调用时同样是这条规则，不会先构造出一个到求值期才炸的调用：

```java
LibBuiltInFunctions.MIN.call(IExpression.ref("x..."));                       // OK
LibBuiltInFunctions.SQRT.call(IExpression.ref("x..."));                      // 抛 IllegalArgumentException
LibBuiltInFunctions.ADD.call(IExpression.ref("x..."), ConstantFunction.of(1).call());   // add 是 (a, b)：抛
```

名字**没绑定成列表**时，求值期会点名报错，而不是给出看不懂的“个数不符”：

```java
FlatExpressionParser.parseValue("min($(unbound...))", functions).evaluate(Arguments.of());
// IllegalArgumentException: $(unbound...) is not bound to a list
```

名字绑成**空列表**则是合法的空调用，跟“写错名字”分得开：

```java
IExpression call = FlatExpressionParser.parseValue("min($(empty...))", functions);
call.evaluate(Arguments.of(List.of(), List.of("empty"), List.of(new Arguments.Value.Many(List.of()))));
// 0.0
```

## 规范回写形式

回写结果是**规范形式**，不保留原文，但任何回写结果重新解析都得到同一棵表达式树，而且**再写一遍还是同一段文本**。写出器在返回前会实测这条：把文本读回来再写一次，两次不一致就退回对象形式。

| 原文                | 回写结果             |
|-------------------|------------------|
| `2*x`、`2·x`、`x*2` | `2x`、`2x`、`x*2` |
| `2*3`、`2*0.5`     | `2*3`、`2*0.5`（常量之间不并置） |
| `2^(3^4)`         | `2^3^4`          |
| `(2^3)^4`         | `(2^3)^4`        |
| `x0+x1+x2`        | `x+y+z`          |
| `add(x,1)`        | `x+1`            |
| `pow(x,2)`        | `x^2`            |
| `2*mymod:triple(x,1)` | `2mymod:triple(x,1)` |
| `2*e1(1)`         | `2*e1(1)`        |
| `2*$(a)`          | `2*$(a)`         |
| `-x`              | `-x`             |
| `0-(x*y)`         | `-(x*y)`         |
| `x*(2+1)`         | `x*(2+1)`        |
| `-0`、`-0.0`       | `-0.0`           |
| `0.0001`          | `0.0001`         |
| `10000000`        | `10000000`       |
| `-1.0E7`          | `-10000000`      |
| `-5.0E-4`         | `-0.0005`        |
| `(a) -> $(a)`     | `a -> $(a)`      |
| `2(x -> $(x))`    | `2*(x -> $(x))`  |
| `(x -> $(x))*2`   | `(x -> $(x))*2`  |
| `(x -> $(x))^2`   | `(x -> $(x))^2`  |
| `min($(x...))`    | `min($(x...))`   |
| `mymod:max(x,1)`（`mymod:max` 未注册） | `max(x,1)`（退回内置函数） |

括号按“同优先级下会不会结合成另一棵树”的规则补最少的一层。取负一个算式时一律补括号，写成 `-(x^y)` 而不是 `-x^y`，否则 `-` 会落到整个乘方上。

并置乘法（省掉 `*`）只在右侧能直接相接时使用，右侧得是标识符、括号或 `$(name)` 开头，且左侧是不带符号的数字常量。判断不止看首字符，还要**实测**：数字后面的 `e`/`E` 会被当成指数，`2*e1(1)` 写成 `2e1(1)` 会读成 `multiply(20, 1)`，值静默改变还不报错，所以这种名字会被退回显式乘号。

数字的写法按「读得回来」优先：整数（绝对值小于 `9.223372036854776E18`）写成整数字面量，`1e-4 ≤ |x| < 1e7` 写十进制并去掉末尾多余的 0，其余交给 `Double.toString`（因此 `1e-5` 会写成 `1.0E-5`）。负零写成 `-0.0` 而不是 `-0`：`-0` 会被读成 `0-0`，值变成正零。

## 无法回写的情况

回写失败时 `FlatExpressionWriter.write` 返回空 `Optional`，`IExpression.CODEC` 随之退回对象形式（而不是写出一段读不回来的文本），出现以下情况时：

- 树里有内联的函数定义，取不到注册名（内置函数、内联 `CustomFunction`、直接构造的调用节点都是这一类）
- 树里有非有限常量（`NaN`、无穷）——解析期也会拒绝溢出成无穷的字面量（`1e99999`），免得读得进来却写不回去
- 数据包里在 `anvillib` 命名空间注册了与内建同名的函数（如 `anvillib:sqrt`）：解析器认为这个名字就是内建函数，写短名会被静默换成内建，因此只能退回对象形式
- 零参 lambda：文本里空参数串会被读成“缺参数名”，而对象形式的 `parameters: []` 是合法的
- 名字取值的载荷写不成 `$(name)`：名字里有 `)`、空格这类标识符字符集之外的字符，以 `.` 结尾（如 `x.`），或者为空。名字本身以 `...` 结尾的**具名**引用（`Reference.Named("x...")`、`NamedFunction("x...")`）同样写不出来——写出的 `$(x...)` 会被读成 Spread，语义从“取一个数”变成“取一份列表”
- 下标引用落在负数或极大下标上（如 `InputFunction(-1)`）：写出的 `x-1` 读不回来

取负负常量（`0-(-0.5)`）**可以**回写成 `-(-0.5)`：括号保证了不会写出不合法的 `--0.5`，读回来仍是同一棵树。回写时的自检会把「写出来但读不回同一棵树」的情况一并降级成对象形式，因此不必担心某个名字悄悄换了含义。

> 回写不是纯粹的输出：为了自检，它会把写出的文本重新解析一遍（并因此写入解析缓存），代价约为树规模的两倍。

## 解析错误信息一览

直接调用 `FlatExpressionParser.parseValue` 时抛的是 `IllegalArgumentException`，消息统一带 `at position <位置> of expression "<原文>"` 后缀：

| 情况                        | 消息                                                              |
|---------------------------|-----------------------------------------------------------------|
| 文本里有读不下去的字符               | `unexpected character '<字符>'`                                   |
| 文本提前结束                    | `unexpected end of expression`                                  |
| `$` 后面不是 `(`               | `expected '(' after '$'`                                        |
| `$(...)` 里没有名字             | `expected a name between '$(' and ')'`                          |
| `$(` 没有闭合                 | `expected ')'`                                                  |
| 括号没有闭合                    | `expected ')'`                                                  |
| 函数名后没有 `(`（含未知裸标识符）       | `expected '(' after function '<名字>'`                            |
| 实参之间缺逗号                   | `expected ',' or ')'`                                           |
| 函数名找不到                    | `unknown function '<名字>'`                                       |
| 字面量溢出成无穷                  | `number out of range '<原文>'`（位置指向字面量末尾）                            |
| 数字写法不合法                   | `invalid number '<原文>'`                                         |
| `x` 后面的下标超出 `int`         | `input index is too large: '<数字>'`                              |
| lambda 形参名不合法              | `invalid lambda parameter name '<名字>'` / `expected a lambda parameter name` |
| 参数个数不符                    | `function '<名字>' Expected <区间> arguments but got <个数>`          |
| 嵌套太深                      | `expression nests too deeply, the limit 512`                    |

经 `IExpression.CODEC` 走时这些错误会被包一层，变成 `DataResult` 错误：`Invalid expression: <上面的消息>`；输入不是字符串时是 `Not a flat expression: <输入>`；`DynamicOps` 不是 `RegistryOps` 时是 `Cannot access registry ResourceKey[minecraft:root / anvillib:function], use RegistryOps`。

## 缓存

解析结果按函数注册表实例分组缓存，同一个注册表上重复解析同一段文本不会重复解析，并直接返回**同一个实例**。每组最多 512 条，超出后按最近最少使用淘汰，没有过期时间；弱键指望不上的部分与清理时机见[缓存与生命周期](./cache)。

## 嵌套深度上限

括号、乘方、函数实参与 lambda 函数体共用同一个嵌套计数，超过 512 层会报 `expression nests too deeply, the limit 512`。不设这个上限时，上万层括号或 `2^2^2^…` 会让递归下降抛 `StackOverflowError`——那是 `Error`，`parseResult` 的 `catch (RuntimeException)` 拦不住，会从 codec 直接穿到数据包加载流程。

这个 512 是**计数**上限而不是可嵌套层数：一层括号或一层实参嵌套会依次过 `parseLambda`、`parseUnary`、`parsePower` 三处守卫、各计一次，所以 `sqrt(sqrt(…))` 实际只能嵌 **169** 层（第 170 层报错）；只有一元符号链是每层一次，能写 512 个符号。挪动任意一处守卫都会静默改变可用深度，`FlatExpressionTest` 把这两个边界都钉住了。

## API

```java
public final class FlatExpressionParser {
    // 解析，整段文本也可以只是一个数字或一次按名字取值
    public static IExpression parseValue(String source, HolderGetter<IFunction> functions);

    // flat 文本的编解码，只接受 RegistryOps
    public static Codec<IExpression> codec();

    // 清空解析缓存
    public static void clearCache();

    // 从动态操作里取出函数注册表，取不到时返回 null
    public static @Nullable HolderGetter<IFunction> functionGetter(DynamicOps<?> ops);
}
```

`FlatExpressionWriter` 是包私有类，只通过 `FlatExpressionParser.codec()` 的编码路径间接使用；它对外可见的两个成员是 `write(IExpression, HolderGetter<IFunction>)`（返回 `Optional<String>`，空表示写不出文本）与 `input(int)`（下标 → `x`/`y`/`z`/`xN`）。
