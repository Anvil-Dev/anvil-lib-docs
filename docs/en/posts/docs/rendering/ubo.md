---
title: Rendering UBO Framework
prev: false
next: false
---

# UBO Foundation Framework <Badge type="tip" text=">=26.1" />

The UBO system is used to declare GLSL Uniform Block memory layouts in code and automatically calculate STD140 sizes and padding data.

## UboObject

Abstract base class for all custom UBOs.

```java
public abstract class UboObject<T extends UboObject<T>> {
    // Subclasses must declare a static DEFINITION constant
    protected abstract UboLayoutDefinition<T> getDefinition();

    // Upload the current object data to a GPU buffer slice using the layout
    public void upload(CommandEncoder encoder, GpuBufferSlice slice);
}
```

### Usage Example

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

    // upload() implementation
    @Override
    public UboLayoutDefinition<MyUniform> getDefinition() {
        return DEFINITION;
    }
}
```

## UboLayoutDefinition

Generic `T` layout definition, holding a set of `UboLayoutEntry`.

```java
public class UboLayoutDefinition<T> {
    // Create a layout definition
    public static <T> UboLayoutDefinition<T> create(UboLayoutEntry... entries);

    // Write object fields to a ByteBuffer according to the layout
    public void write(ByteBuffer buffer, T object);

    // Return the total byte size of the UBO under STD140
    public int size();
}
```

## UboLayoutEntry

An entry record `(UboLayoutEntryType, getter)`, linking field type to access method.

```java
public class UboLayoutEntry<T, I> {
    // Static factory methods
    public static Builder<Float, I> ofFloat();
    public static Builder<Integer, I> ofInt();
    public static Builder<Vector2f, I> ofVec2f();
    public static Builder<Vector3f, I> ofVec3f();
    public static Builder<Vector4f, I> ofVec4f();
    public static Builder<Matrix4f, I> ofMat4f();
}

// Builder chaining
entry = UboLayoutEntry.ofFloat()
    .forGetter(u -> u.intensity)  // Bind getter
    .build();
```

## UboLayoutEntryType

Defines specific STD140 data types:

| Type     | Description                                             |
|----------|---------------------------------------------------------|
| `FLOAT`  | Single-precision float (4 bytes)                        |
| `INT`    | 32-bit integer (4 bytes)                                |
| `VEC2`   | 2-component vector (8 bytes)                            |
| `VEC3`   | 3-component vector (16 bytes, STD140 alignment)         |
| `VEC4`   | 4-component vector (16 bytes)                           |
| `MAT4`   | 4×4 matrix (64 bytes)                                   |

Internally implements `acceptSizeCalculator` and `acceptWriter` for size calculation and writing respectively.

## STD140 Alignment Rules

- `FLOAT` / `INT`: 4-byte alignment
- `VEC2`: 8-byte alignment
- `VEC3` / `VEC4`: 16-byte alignment
- `MAT4`: 16-byte alignment (4 VEC4s)
- Struct tail padding to multiples of the largest alignment unit

## GLSL Correspondence

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
