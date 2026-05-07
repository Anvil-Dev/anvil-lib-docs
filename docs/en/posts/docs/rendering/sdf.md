---
title: Rendering SDF Graphics System
prev: false
next: false
---

# SDF 2D Graphics System <Badge type="tip" text=">=26.1" />

The package `dev.anvilcraft.lib.v2.rendering.sdf` provides a 2D graphics rendering system based on **Signed Distance
Fields (SDF)**. Parameters are transmitted via GPU UBO, supporting 7 shape types and two rendering passes (fill/light).

## SdfGraphics

Core entry point providing a fluent Builder API. Access the global singleton via `SdfGraphics.instance`.

### Shape Drawing Methods

All methods return `this` for chaining. Each call sets the current parameter state; `draw(graphics)` submits the render.

| Method                                 | Parameters                                   | Description    |
|----------------------------------------|----------------------------------------------|----------------|
| `box(x, y, width, height)`             | Position + size                              | Rectangle      |
| `circle(x, y, radius)`                 | Center + radius                              | Circle         |
| `arc(x, y, sweep, radius, width)`      | Center + sweep angle + radius + width        | Arc            |
| `sector(x, y, sweep, radius, width)`   | Center + sweep angle + radius + width        | Annular sector |
| `pie(x, y, sweep, radius)`             | Center + sweep angle + radius                | Pie            |
| `capsule(x, y, topR, bottomR, height)` | Center + top radius + bottom radius + height | Capsule        |
| `egg(x, y, topR, bottomR, height)`     | Center + top radius + bottom radius + height | Egg            |

### Style Methods

| Method                                      | Description                                         |
|---------------------------------------------|-----------------------------------------------------|
| `color(int rgba)`                           | Set color (ARGB)                                    |
| `color(float r, float g, float b, float a)` | Set color (float components)                        |
| `color(int r, int g, int b, int a)`         | Set color (integer components)                      |
| `smooth(float radius)`                      | Set smooth/blur radius (>=0)                        |
| `round(float radius)`                       | Set corner radius (>=0)                             |
| `stroke(float width)`                       | Set stroke width (>0 auto-enables onion mode)       |
| `rotate(float degrees)`                     | Set rotation angle (degrees, auto-wrapped to 0-360) |
| `center(boolean center)`                    | Whether to use center as anchor                     |
| `onion(boolean onion)`                      | Enable hollow stroke mode                           |
| `fill()`                                    | Set fill pass (default)                             |
| `light(float radius)`                       | Set light pass, radius = glow attenuation distance  |

### Collision Detection

```java
// Check if point (x, y) is within SDF distance threshold
boolean hit = SdfGraphics.instance.collide(x, y, threshold);
```

### Copy and Reset

```java
// Copy current parameter state (creates new SdfGraphics instance)
SdfGraphics copy = SdfGraphics.instance.cache();

// Reset parameters to defaults
SdfGraphics.instance.reset();

// Flush global state (reset params + zero UBO index)
SdfGraphics.flush();
```

### Usage Example

```java
SdfGraphics sdf = SdfGraphics.instance;

// Filled rounded rectangle
sdf.box(100, 50, 200, 80)
   .color(0xFFFF4080)
   .round(10)
   .smooth(2)
   .draw(graphics);

// Stroked circle
sdf.circle(200, 150, 60)
   .color(1.0f, 0.5f, 0.2f, 1.0f)
   .stroke(4)
   .draw(graphics);

// Glowing rectangle
sdf.box(300, 100, 150, 60)
   .color(255, 200, 50, 255)
   .light(8)
   .draw(graphics);

// Flush at end of frame
SdfGraphics.flush();
```

## SdfRenderType

```java
public enum SdfRenderType {
    BOX, CIRCLE, ARC, SECTOR, PIE, CAPSULE, EGG
}
```

## SdfPassType

```java
public enum SdfPassType {
    FILL,   // Fill rendering
    LIGHT   // Glow rendering
}
```

## SdfParameters

UBO parameter class extending `UboObject<SdfParameters>`. Set via `SdfGraphics` builder methods; internally transmitted
to shaders via GPU UBO.

### Layout Definition (STD140)

| Field          | Type    | Components                   | Description               |
|----------------|---------|------------------------------|---------------------------|
| `sharedParams` | `vec4`  | smooth, stroke, round, light | Shared style parameters   |
| `shapeParams`  | `vec4`  | x, y, z, w                   | Shape-specific parameters |
| `rect`         | `vec4`  | x, y, width, height          | Bounding rectangle        |
| `typeParams`   | `ivec4` | pass, renderType, onion, _   | Type control parameters   |

### reset()

Resets all parameters to defaults (zero vectors, white color, zero rotation, non-centered).

## Sdf2d

Utility class (`@UtilityClass`) containing 9 core SDF mathematical functions: `sd()`, `sdRect()`, `sdCircle()`,
`sdArc()`, `sdRing()`, `sdPie()`, `sdUnevenCapsule()`, `sdEgg()`.

## Internal Rendering Pipeline

```
SdfGraphics.box().color().round().smooth().draw(graphics)
  → SdfParameters sets corresponding Vector4f/Vector4i components
  → _draw() function:
    1. Compute expanded size (round + smooth + stroke) * 2
    2. Build Matrix3x2f transform (translate + rotate + scale)
    3. Write SdfParameters via UBO offset
    4. Create RenderState (implements LibGuiElementRenderState)
    5. Submit via graphics.submitGuiElementRenderState()
    6. Shader renders through ALRPipelines.SDF_GRAPHICS pipeline
```

## Capacity Limits

- Global UBO buffer size: `SDF_PARAMETER_SIZE * 256 = 16384 bytes`
- Maximum 256 SDF draw calls per frame
- Call `SdfGraphics.flush()` at end of each frame to reset the index counter

## Notes

- SDF rendering depends on `ConfigureMainRenderTargetEvent` for GPU resource init (UBO, CommandEncoder)
- Renders through `ALRPipelines.SDF_GRAPHICS` pipeline, no texture binding needed (`TextureSetup.noTexture()`)
- `stroke()` simultaneously sets stroke width and enables `onion` mode
- Colors use ARGB format; `color(int)` accepts `0xAARRGGBB`
