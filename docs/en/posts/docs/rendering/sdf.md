---
title: Rendering SDF Graphics System
prev: false
next: false
---

# SDF 2D Graphics System <Badge type="tip" text=">=26.1" />

The package `dev.anvilcraft.lib.v2.rendering.sdf` provides a 2D graphics rendering system based on **Signed Distance
Fields (SDF)**. Parameters are transmitted via GPU UBO, supporting 7 shape types and two rendering passes (fill/light).

## SdfGraphics

Core entry point providing a fluent Builder API. Access the global singleton via `SdfGraphics.getInstance()`.

### Shape Drawing Methods

All methods return `this` for chaining. Each call sets the current parameter state; `draw(graphics)` submits the render.

| Method                                        | Parameters                                   | Description    |
|-----------------------------------------------|----------------------------------------------|----------------|
| `box(x, y, w, h)`                             | Position + size                              | Rectangle      |
| `circle(x, y, radius)`                        | Center + radius                              | Circle         |
| `arc(x, y, radius, startAngle, arcLength)`    | Center + radius + start angle + arc length   | Arc            |
| `sector(x, y, radius, startAngle, arcLength)` | Center + radius + start angle + arc length   | Annular sector |
| `pie(x, y, radius, startAngle)`               | Center + radius + start angle                | Pie            |
| `capsule(x, y, w, h, radius)`                 | Center + width + height + corner radius      | Capsule        |
| `egg(x, y, radiusTop, radiusBottom, height)`  | Center + top radius + bottom radius + height | Egg            |

### Style Methods

| Method                  | Description                                         |
|-------------------------|-----------------------------------------------------|
| `color(int argbHex)`    | Set color (ARGB)                                    |
| `rotate(float degrees)` | Set rotation angle (degrees, auto-wrapped to 0-360) |
| `center(boolean)`       | Whether to use center as anchor                     |
| `stroke(int width)`     | Set stroke width (0=filled, >0=outline)             |
| `round(float radius)`   | Set corner radius (>=0)                             |
| `fill()`                | Set fill pass (default)                             |
| `light(int)`            | Set light pass                                      |
| `reset()`               | Reset parameters to defaults                        |
| `onion(boolean)`        | Enable hollow stroke mode                           |

### Collision Detection

```java
// Check if point (mouseX, mouseY) is within SDF distance threshold
boolean hit = SdfGraphics.getInstance().collide(mouseX, mouseY, threshold);
```

### Copy and Reset

```java
// Copy current parameter state (creates new SdfGraphics instance)
SdfGraphics copy = SdfGraphics.getInstance().cache();

// Reset parameters to defaults
SdfGraphics.getInstance().reset();

// Flush global state (reset params + zero UBO index)
SdfGraphics.flush();
```

### Usage Example

```java
SdfGraphics sdf = SdfGraphics.getInstance();

// Filled rounded rectangle
sdf.box(100, 50, 200, 80)
   .color(0xFFFF4080)
   .round(10)
   .draw(graphics);

// Stroked circle
sdf.circle(200, 150, 60)
   .color(0xFF4080FF)
   .stroke(4)
   .draw(graphics);

// Glowing rectangle
sdf.box(300, 100, 150, 60)
   .color(0xFFFFC832)
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
SdfGraphics.box().color().round().draw(graphics)
  → SdfParameters sets corresponding Vector4f/Vector4i components
  → _draw() function:
    1. Compute expanded size (round + stroke) * 2
    2. Build Matrix3x2f transform (translate + rotate + scale)
    3. Write SdfParameters via UBO offset
    4. Create RenderState (implements LibGuiElementRenderState)
    5. Submit via graphics.submitGuiElementRenderState()
    6. Shader renders through ALRPipelines.SDF_GRAPHICS pipeline
```

## Capacity Limits

- Global UBO buffer size: `SDF_PARAMETER_SIZE * 256 = 16 * 16 * 256 = 65536 bytes`
- Maximum 256 SDF draw calls per frame
- Call `SdfGraphics.flush()` at end of each frame to reset the index counter

## Notes

- SDF rendering depends on `ConfigureMainRenderTargetEvent` for GPU resource init (UBO, CommandEncoder)
- Renders through `ALRPipelines.SDF_GRAPHICS` pipeline, no texture binding needed (`TextureSetup.noTexture()`)
- `stroke(0)` for filled mode, `stroke(>0)` for outline mode
- Colors use ARGB format; `color(int)` accepts `0xAARRGGBB`
