---
title: Rendering UBO 框架
prev: false
next: false
---

# UBO 基础框架 <Badge type="tip" text=">=26.1" />

UBO 系统用于在代码中声明 GLSL Uniform Block 的内存布局，并自动计算 STD140 大小和填充数据。

## UboObject

所有自定义 UBO 的抽象基类。

```java
public abstract class UboObject<T extends UboObject<T>> {
    // 子类必须声明静态 DEFINITION 常量
    protected abstract UboLayoutDefinition<T> getDefinition();

    // 将当前对象数据通过布局写入显存 Buffer 切片
    public void upload(CommandEncoder encoder, GpuBufferSlice slice);
}
```

### 使用示例

```java
public class MyUniform extends UboObject<MyUniform> {
    public static final UboLayoutDefinition<MyUniform> DEFINITION =
        UboLayoutDefinition.create(
            UboLayoutEntry.ofFloat().forGetter(u -> u.intensity).build(),
            UboLayoutEntry.ofVec3f().forGetter(u -> u.color).build(),
            UboLayoutEntry.ofMat4f().forGetter(u -> u.modelMatrix).build()
        );

    public float intensity;
    public Vector3f color;
    public Matrix4f modelMatrix;

    // upload() 实现
    @Override
    public UboLayoutDefinition<MyUniform> getDefinition() {
        return DEFINITION;
    }
}
```

## UboLayoutDefinition

泛型 `T` 布局定义，保存一组 `UboLayoutEntry`。

```java
public class UboLayoutDefinition<T> {
    // 创建布局定义
    public static <T> UboLayoutDefinition<T> create(UboLayoutEntry... entries);

    // 按布局将对象字段写入 ByteBuffer
    public void write(ByteBuffer buffer, T object);

    // 返回整个 UBO 在 STD140 下的字节大小
    public int size();
}
```

## UboLayoutEntry

记录条目 `(UboLayoutEntryType, getter)`，连接字段类型与访问方法。

```java
public class UboLayoutEntry<T, I> {
    // 静态工厂方法
    public static Builder<Float, I> ofFloat();
    public static Builder<Integer, I> ofInt();
    public static Builder<Vector2f, I> ofVec2f();
    public static Builder<Vector3f, I> ofVec3f();
    public static Builder<Vector4f, I> ofVec4f();
    public static Builder<Matrix4f, I> ofMat4f();
}

// Builder 链式调用
entry = UboLayoutEntry.ofFloat()
    .forGetter(u -> u.intensity)  // 绑定 getter
    .build();
```

## UboLayoutEntryType

定义具体的 STD140 数据类型：

| 类型      | 说明                      |
|---------|-------------------------|
| `FLOAT` | 单精度浮点（4 字节）             |
| `INT`   | 32 位整数（4 字节）            |
| `VEC2`  | 2 分量向量（8 字节）            |
| `VEC3`  | 3 分量向量（16 字节，STD140 对齐） |
| `VEC4`  | 4 分量向量（16 字节）           |
| `MAT4`  | 4×4 矩阵（64 字节）           |

内部实现 `acceptSizeCalculator` 和 `acceptWriter`，分别用于大小计算和写入。

## STD140 对齐规则

- `FLOAT` / `INT`: 4 字节对齐
- `VEC2`: 8 字节对齐
- `VEC3` / `VEC4`: 16 字节对齐
- `MAT4`: 16 字节对齐（4 个 VEC4）
- 结构体末尾填充到最大对齐单元的倍数

## GLSL 对应

```glsl
// GLSL
layout(std140) uniform MyUniformBlock {
    float intensity;
    vec3 color;
    mat4 modelMatrix;
};

// Java
UboLayoutEntry.ofFloat().forGetter(u -> u.intensity).build()
UboLayoutEntry.ofVec3f().forGetter(u -> u.color).build()
UboLayoutEntry.ofMat4f().forGetter(u -> u.modelMatrix).build()
```
