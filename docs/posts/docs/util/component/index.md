# 多行组件工具

此包提供结构化生成多行 `Component` 文本的能力，常用于调试信息、配方展示等。

## IComponentInfo

`dev.anvilcraft.lib.v2.util.component.IComponentInfo` – 组件信息接口，唯一方法：
`addInto(MultilineComponentHelper helper)`。

实现类：

- `LiteralInfo(String value)` – 直接显示文本
- `DirectInfo(Component value)` – 显示组件
- `TranslatableInfo(String key, Object... args)` – 翻译键，args 可包含 `SequencedCollection`（自动调 `helper.list`）或
  `ItemEnchantments`（自动调 `helper.enchantments`）

## MultilineComponentHelper

`dev.anvilcraft.lib.v2.util.component.MultilineComponentHelper` – 多行文本构建器。

- **构造**：`MultilineComponentHelper.create()` 使用默认符号（LF、制表符、逗号、方括号、花括号）
- **基本追加**：`addln(Component)`（带换行与缩进）、`append(Component)`
- **缩进控制**：`in()` / `out()` 进入/退出缩进层级
- **集合显示**：`list(Component head, SequencedCollection<T>, Function<T,IComponentInfo[]>)` – 自动格式化列表，单个元素不带换行，多个元素格式化展示
- **附魔显示**：`enchantments(Component head, ItemEnchantments)` – 展示附魔列表
- **构建**：`build()` 返回结果 `Component`

使用示例：

```java
MultilineComponentHelper helper = MultilineComponentHelper.create();
helper.addln(Component.literal("Hello"));
helper.in();
helper.addln(Component.literal("World"));
helper.out();
Component result = helper.build(); // "Hello\n    World"
```