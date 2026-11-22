# 2D SDF Vector Graphics Rendering (`SdfGraphics` / `Sdf2d`)

When drawing high-precision rounded panels, progress arcs, annular sectors, or glowing badges in GUIs, traditional texture stretching aliases, distorts corners, and produces uneven borders on HiDPI or scaled displays. `dev.anvilcraft.lib.v2.rendering.sdf` provides a resolution-independent vector graphics pipeline based on fragment shaders and Signed Distance Field (SDF) math:

- **`SdfGraphics`**: Singleton fluent draw API that batches shape calls in `GuiGraphics` and flushes parameters and render states via `SdfGraphics.flush()` in `GuiRendererMixin` during UI mesh collection. Supports **10 core shapes**, smooth anti-aliasing (`smooth`), corner rounding (`round`), hollow strokes (`stroke`/`onion`), radial glow (`light`), center/top-left alignment (`center`), free rotation (`rotate`), and **shared parameter caching (`share`/`cache`)**.
- **`Sdf2d`**: Pure CPU float distance functions mathematically identical to the GPU shader, ideal for high-precision hover/click hit testing (`SdfGraphics#collide` delegates to `Sdf2d.sd(...)`).
- **`SdfParameters` / `SdfRenderType` / `SdfPassType`**: Uniform data object extending `BufferObject<SdfParameters>` and shape/pass enums.

---

## Workflow & Hard Limits

| Capacity Constant / Hook | Description |
| :--- | :--- |
| `SdfGraphics.MAX_SDF_AMOUNT = 256` | Max per-frame batched buffer capacity |
| `SdfGraphics.MAX_SHARED_SDF_AMOUNT = 64` | Max shared UBO slots persistently resident via `share()` for multi-use drawing |
| `SdfGraphics.init(ConfigureMainRenderTargetEvent)` | Prepares `SDFParameters` dynamic Uniform storage on client main render target init (fired on mod bus) |
| `SdfGraphics.flush()` | Automatically flushes the draw queue when `GuiRenderer` adds elements via `GuiRendererMixin`; rarely needs manual calls |

> [!WARNING]
> **Fluent State Reset**: After calling `draw(GuiGraphics)`, `collide(x, y, threshold)`, or `cache()`, `SdfGraphics.instance` does not reset everything automatically (only `parameters.duplicate()` is called when constructing params in `draw(GuiGraphics)`). Call `.reset()` before drawing the next shape if you need a clean default state (rotation `0`, centered `true`, white color, and reset `SdfParameters`).

---

## Full Example: Fluent Drawing & Shared Cache Reuse

The `Screen` code below demonstrates combining immediate drawing, `SdfParameters` shared caching, and mouse hover collision highlighting using the same SDF contour:

```java
package com.example.mymod.client;

import dev.anvilcraft.lib.v2.rendering.sdf.SdfGraphics;
import dev.anvilcraft.lib.v2.rendering.sdf.SdfParameters;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.jetbrains.annotations.Nullable;

public class SdfDemoScreen extends Screen {
    private @Nullable SdfParameters badgeRingCache;

    public SdfDemoScreen() {
        super(Component.literal("SDF Vector Demo"));
    }

    @Override
    protected void init() {
        // Pre-build and register an "annular sector badge" into a shared slot (up to 64 shared slots)
        if (this.badgeRingCache == null) {
            this.badgeRingCache = SdfGraphics.instance
                .reset()
                .sector(0, 0, 120.0f, 36.0f, 8.0f)
                .round(3.0f)
                .smooth(1.5f)
                .fill()
                .share();
        }
    }

    @Override
    public void removed() {
        // Always free shared slots when closing the screen to avoid exhausting MAX_SHARED_SDF_AMOUNT (64)
        if (this.badgeRingCache != null) {
            SdfGraphics.instance.unshare(this.badgeRingCache);
            this.badgeRingCache = null;
        }
        super.removed();
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(graphics, mouseX, mouseY, partialTick);

        float cx = this.width / 2.0f;
        float cy = this.height / 2.0f;

        // 1. Define and hit-test a rounded rectangle button (centered mode)
        SdfGraphics button = SdfGraphics.instance
            .reset()
            .box(cx, cy, 140.0f, 36.0f)
            .round(8.0f)
            .smooth(1.0f);

        boolean hovered = button.collide(mouseX, mouseY, 0.5f);

        // Switch between outer glow or solid fill based on hover state
        if (hovered) {
            button.color(0x8838BDF8).light(10.0f).draw(graphics);
        }
        SdfGraphics.instance
            .reset()
            .box(cx, cy, 140.0f, 36.0f)
            .round(8.0f)
            .smooth(1.0f)
            .stroke(hovered ? 2.5f : 1.5f)
            .color(hovered ? 0xFF7DD3FC : 0xFF94A3B8)
            .draw(graphics);

        // 2. Reuse the same SdfParameters cache to draw rotated at multiple screen positions
        if (this.badgeRingCache != null) {
            SdfGraphics.instance
                .reset()
                .color(0xFFEAB308)
                .rotate((System.currentTimeMillis() % 3600L) / 10.0f)
                .draw(graphics, this.badgeRingCache, cx - 100.0f, cy);
        }

        super.render(graphics, mouseX, mouseY, partialTick);
    }
}
```

---

## Detailed API Reference

### `SdfGraphics` Shape Construction & Style Methods

Global entry: `SdfGraphics.instance` (main render thread only). All builder methods return `this` for chaining.

#### 1. Geometry Shape Methods

| Method Signature | Geometric Meaning & Parameters |
| :--- | :--- |
| `box(float x, float y, float width, float height)` | Box at `(x, y)` (center or top-left depending on `center(true/false)`) |
| `circle(float x, float y, float radius)` | Circle with center (or radius-box top-left) and `radius` |
| `arc(float x, float y, float sweep, float radius, float width)` | Circular arc with `sweep` angle (degrees), centerline `radius`, and thickness `width` |
| `sector(float x, float y, float sweep, float radius, float width)` | Annular sector (flat-capped ends) with `sweep` angle (degrees), mean `radius`, and ring `width` |
| `pie(float x, float y, float sweep, float radius)` | Solid pie wedge with `sweep` angle (degrees) and `radius` |
| `capsule(float x, float y, float topRadius, float bottomRadius, float height)` | Uneven capsule with independent top and bottom radii; total height spans `height` plus both end radii |
| `egg(float x, float y, float topRadius, float bottomRadius, float height)` | Smooth egg contour defined by `topRadius`, `bottomRadius`, and center separation `height` |
| `segment(float x0, float y0, float x1, float y1)` | 2D line segment from `(x0, y0)` to `(x1, y1)`; pair with `round(...)` or `stroke(...)` for visible thickness |
| `triangleEquilateral(float x, float y, float radius)` | Equilateral triangle where `radius` controls center-to-vertex size (internally scaled by `1 / 1.2` for inscribed edge length) |
| `triangleIsosceles(float x, float y, float width, float height)` | Isosceles triangle with base `width` and `height` |

#### 2. Style & Transform Methods

| Method Signature | Default | Description |
| :--- | :--- | :--- |
| `color(int color)` | `-1` (opaque white) | Sets draw color using a 32-bit ARGB integer |
| `color(float red, float green, float blue, float alpha)` | — | Sets color using `0.0f..1.0f` float channels |
| `color(int red, int green, int blue, int alpha)` | — | Sets color using `0..255` integer channels |
| `smooth(float radius)` | `0.0f` | Anti-aliasing feather width (`1.0f–1.5f` recommended for GUIs) |
| `round(float radius)` | `0.0f` | Outward corner-rounding radius (works on boxes, segments, triangles, etc.) |
| `stroke(float width)` | `0.0f` | Sets stroke width and automatically toggles `onion(width > 0.0f)` for hollow outlines |
| `onion(boolean onion)` | `false` | Manually toggles onion/hollow mode |
| `fill()` | Default `FILL` | Switches back to `SdfPassType.FILL` solid/stroke mode |
| `light(float radius)` | `FILL` | Switches to `SdfPassType.LIGHT` glow mode with falloff radius `radius` |
| `rotate(float degrees)` | `0.0f` | Rotates the shape in degrees around its local pivot (affected by `center(true/false)`) |
| `center(boolean center)` | `true` | `true` treats `(x, y)` as shape center; `false` treats it as top-left of the bounding box |

#### 3. Draw, Hit-Test, Cache & Debug Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `draw(GuiGraphics graphics)` | `SdfGraphics` | Snapshots current parameters and submits to this frame's `GuiRenderState` queue |
| `draw(GuiGraphics graphics, SdfParameters cache, float x, float y)` | `SdfGraphics` | Reuses a `share()`d `cache` object at `(x, y)` with current `color`/`rotate`/`center`; **no-op if `cache.isShared()` is `false`** |
| `collide(float x, float y, float threshold)` | `boolean` | Checks whether screen point `(x, y)` hits the current `SdfGraphics` shape (`Sdf2d.sd(...) <= threshold`) |
| `collide(SdfParameters cache, float pointX, float pointY, float x, float y, float threshold)` | `boolean` | Hit-tests `(pointX, pointY)` against a cached `SdfParameters` placed at `(x, y)` with current `rotation`/`centred` |
| `cache()` | `@NonNull SdfParameters` | Returns an independent copy of current parameters (`isShared() == false`) for CPU hit testing without using a GPU shared slot |
| `share()` | `@NonNull SdfParameters` | Copies current parameters and allocates a persistent shared slot index for repeated `draw(graphics, cache, x, y)` calls |
| `share(@NotNull SdfParameters cache)` | `void` | Registers an unshared `cache` into a shared slot (up to `MAX_SHARED_SDF_AMOUNT = 64`; overwrites oldest/cyclic slot if full) |
| `unshare(@NotNull SdfParameters cache)` | `void` | Removes `SdfParameters` from the shared registry and frees its slot |
| `reset()` | `SdfGraphics` | Resets geometry and style state to defaults (white, `rotation=0`, `centred=true`, `SdfParameters.reset()`) |
| `static void debug(boolean enable)` | `void` | Toggles debug wireframe visualization of bounding rectangles |
| `static void flush()` | `void` | Writes pending dynamic parameter blocks to GPU UBO; called automatically by `GuiRendererMixin` before frame collection ends |
| `static void init(ConfigureMainRenderTargetEvent event)` | `void` | Initializes global dynamic Uniform buffer storage; handled automatically by the event bus |

---

### `Sdf2d` (CPU-Synced Distance Field Math Library)

`@UtilityClass` providing static math distance functions aligned with the fragment shader (distance `< 0` = inside, `= 0` = boundary, `> 0` = outside):

| Static Method Signature | Shape |
| :--- | :--- |
| `sd(SdfParameters params, float pX, float pY, float rX, float rY, float rotation, boolean centred)` | Full composite signed distance matching shader translation, rotation, and `round`/`stroke`/`onion` |
| `sdRect(float px, float py, float bX, float bY)` | Rectangle with half-extents `(bX, bY)` |
| `sdCircle(float px, float py, float r)` | Circle of radius `r` |
| `sdArc(float px, float py, float scx, float scy, float ra, float rb)` | Arc with cos/sin `(scx, scy)`, radius `ra`, and cap radius `rb` |
| `sdRing(float px, float py, float nx, float ny, float r, float th)` | Annular sector (`nx = cos(a/2), ny = sin(a/2)`, radius `r`, width `th`) |
| `sdPie(float px, float py, float cx, float cy, float r)` | Solid pie wedge |
| `sdUnevenCapsule(float px, float py, float r1, float r2, float h)` | Uneven capsule |
| `sdEgg(float px, float py, float r1, float r2, float h)` | Egg contour |
| `sdSegment(float px, float py, float ax, float ay, float bx, float by)` | Shortest distance from point `(px, py)` to segment |
| `sdEquilateralTriangle(float px, float py, float r)` | Equilateral triangle |
| `sdIsoscelesTriangle(float px, float py, float qx, float qy)` | Isosceles triangle |

---

### `SdfParameters` / `SdfRenderType` / `SdfPassType`

- **`SdfRenderType`** (enum): `BOX`, `CIRCLE`, `ARC`, `SECTOR`, `PIE`, `CAPSULE`, `EGG`, `SEGMENT`, `TRIANGLE_EQUILATERAL`, `TRIANGLE_ISOSCELES`; provides `static SdfRenderType fromOrdinal(int ordinal)`.
- **`SdfPassType`** (enum): `FILL`, `LIGHT`.
- **`SdfParameters`** (extends `BufferObject<SdfParameters>`):
  - `DEFINITION`: layout descriptor for Std140 Uniform buffer upload.
  - Methods: `box(float, float)`, `circle(float)`, `arc(float, float, float)`, `sector(float, float, float)`, `pie(float, float)`, `capsule(float, float, float)`, `egg(float, float, float)`, `segment(float, float, float, float)`, `triangleEquilateral(float)`, `triangleIsosceles(float, float)`, `smooth(float)`, `stroke(float)`, `round(float)`, `fill()`, `onion(boolean)`, `light(float)`, `duplicate()`, `reset()`, `getSmooth()`, `getStroke()`, `getRound()`, `getRenderType()`, `isOnion()`, `isShared()`.
