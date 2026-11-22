# 2D SDF Vector Graphics Rendering (`SdfGraphics` / `Sdf2d` / `SdfParameters`)

<BranchContextCard branch="26.2" />

When drawing rounded rectangles, rings, sectors, capsules, or arbitrarily rotated shapes in custom GUIs, HUD indicators, or radial menus, traditional texture scaling blurs or aliases, while manual triangulation makes smooth anti-aliasing, onion strokes, and outer glow hard to achieve.

`dev.anvilcraft.lib.v2.rendering.sdf` provides a **2D vector graphics rendering and geometric collision library based on Signed Distance Fields (SDF)**:
- **Analytic GPU per-pixel rendering (`SdfGraphics`)**: Built on `ALRPipelines.SDF_GRAPHICS`, supporting **10 core 2D primitives**, all with native per-pixel **corner rounding (`round`)**, **smooth anti-aliasing (`smooth`)**, **hollow stroke (`stroke` / `onion`)**, **exponential outer glow (`light`)**, and **rotation (`rotate`)**;
- **100%-consistent CPU math distance fields & hit testing (`Sdf2d` / `SdfGraphics#collide`)**: Provides Java distance functions mathematically identical to the fragment shader—ideal for testing whether the cursor hovers inside rotated sectors, arcs, triangles, or rounded boxes!

---

## 1. Supported 10 2D SDF Primitives (`SdfRenderType`)

| Primitive (`SdfRenderType`) | `SdfGraphics` Method Signature | `Sdf2d` Math Primitive | Parameter Meaning |
| :--- | :--- | :--- | :--- |
| **`BOX`** | `box(float x, float y, float width, float height)` | `sdRect(px, py, bx, by)` | Rectangle (pair with `.round(r)` for rounded rectangles). |
| **`CIRCLE`** | `circle(float x, float y, float radius)` | `sdCircle(px, py, r)` | Circle with radius `radius`. |
| **`ARC`** | `arc(float x, float y, float sweep, float radius, float width)` | `sdArc(px, py, scx, scy, ra, rb)` | Round-capped arc: `sweep` is half-angle (degrees), `radius` is outer radius, `width` is stroke thickness. |
| **`SECTOR`** | `sector(float x, float y, float sweep, float radius, float width)` | `sdRing(px, py, nx, ny, r, th)` | Flat-capped annular sector: `sweep` is angle (degrees), `radius` is outer radius, `width` is ring thickness (ideal for radial menu wedges!). |
| **`PIE`** | `pie(float x, float y, float sweep, float radius)` | `sdPie(px, py, cx, cy, r)` | Solid pie wedge: `sweep` is half-angle (degrees), `radius` is radius. |
| **`CAPSULE`** | `capsule(float x, float y, float topRadius, float bottomRadius, float height)` | `sdUnevenCapsule(px, py, r1, r2, h)` | Uneven capsule with independent top and bottom radii (droplet/tapered pill). |
| **`EGG`** | `egg(float x, float y, float topRadius, float bottomRadius, float height)` | `sdEgg(px, py, he, ra, rb)` | Egg contour. |
| **`SEGMENT`** | `segment(float x0, float y0, float x1, float y1)` | `sdSegment(px, py, ax, ay, bx, by)` | Line segment from `(x0, y0)` to `(x1, y1)` (control thickness with `.round(r)` or `.stroke(w)`). |
| **`TRIANGLE_EQUILATERAL`** | `triangleEquilateral(float x, float y, float radius)` | `sdEquilateralTriangle(px, py, r)` | Equilateral triangle. |
| **`TRIANGLE_ISOSCELES`** | `triangleIsosceles(float x, float y, float width, float height)` | `sdIsoscelesTriangle(px, py, qx, qy)` | Isosceles triangle. |

---

## 2. Full Code Example: Drawing Rounded Glowing Cards, Rotated Sectors & Mouse Hit Testing

```java
package com.example.mymod.client.gui;

import dev.anvilcraft.lib.v2.rendering.sdf.SdfGraphics;
import dev.anvilcraft.lib.v2.rendering.sdf.SdfParameters;
import net.minecraft.client.gui.GuiGraphicsExtractor;

public final class SdfHudExample {
    // Persistently share static shape parameters (uses tail shared UBO slots; avoids re-uploading UBO every frame)
    private static SdfParameters sharedRingSector;

    private SdfHudExample() {
    }

    public static void initSharedShapes() {
        SdfGraphics sdf = SdfGraphics.getInstance();
        sharedRingSector = sdf.reset()
            .sector(0, 0, 45.0f, 60.0f, 16.0f)
            .round(3.0f)
            .smooth(1.0f)
            .fill()
            .share(); // Allocate shared UBO slot and cache
    }

    public static void renderAndTestHover(GuiGraphicsExtractor graphics, int mouseX, int mouseY) {
        SdfGraphics sdf = SdfGraphics.getInstance();

        // 1. Draw rounded rectangle background with outer glow (light)
        sdf.reset()
            .box(20, 20, 140, 60)
            .round(8.0f)
            .light(12.0f)
            .color(0x8000E5FF)
            .draw(graphics);

        // 2. Draw solid rounded rectangle body (fill)
        sdf.reset()
            .box(20, 20, 140, 60)
            .round(8.0f)
            .smooth(1.0f)
            .fill()
            .color(0xE01E222A)
            .draw(graphics);

        // 3. Draw 2px hollow stroke around rounded rectangle (stroke)
        sdf.reset()
            .box(20, 20, 140, 60)
            .round(8.0f)
            .smooth(1.0f)
            .stroke(2.0f)
            .fill()
            .color(0xFF00E5FF)
            .draw(graphics);

        // 4. Draw using shared parameters at (200, 120) rotated 30° around center and test mouse hover
        if (sharedRingSector != null) {
            sdf.reset()
                .center(true)
                .rotate(30.0f);

            boolean hovered = sdf.collide(sharedRingSector, mouseX, mouseY, 200.0f, 120.0f, 0.0f);
            sdf.color(hovered ? 0xFFFFCC00 : 0xCCFFFFFF)
                .draw(graphics, sharedRingSector, 200.0f, 120.0f);
        }
    }
}
```

---

## 3. `SdfGraphics`, `SdfParameters` & `Sdf2d` API Reference

### 1. `SdfGraphics` (Fluent Renderer & Shared UBO Manager)

Obtain the global singleton via `SdfGraphics.getInstance()` (or static field `SdfGraphics.instance`).

> **UBO Capacity & `share()` Mechanism**:
> `SdfGraphics` maintains a UBO array of `MAX_SDF_AMOUNT = 256` slots:
> - **Immediate per-frame draws (`draw(graphics)`)**: Allocated incrementally from slot `0`, and reset to `0` at end of frame by `SdfGraphics.flush()` in `GuiRendererMixin` (up to `256 - sharedCount` immediate primitives per frame);
> - **Cross-frame shared parameters (`share()` / `unshare(cache)`)**: Allocated from the tail of the UBO (slot `255` downward, up to `MAX_SHARED_SDF_AMOUNT = 64`), uploaded once on first draw or modification, and referenced by index every subsequent frame with zero UBO bandwidth overhead!

| Category | Method Signatures | Description |
| :--- | :--- | :--- |
| **Primitive Setup** | `box(x, y, w, h)`, `circle(x, y, r)`, `arc(x, y, sweep, r, w)`, `sector(x, y, sweep, r, w)`, `pie(x, y, sweep, r)`, `capsule(x, y, topR, bottomR, h)`, `egg(x, y, topR, bottomR, h)`, `segment(x0, y0, x1, y1)`, `triangleEquilateral(x, y, r)`, `triangleIsosceles(x, y, w, h)` | Sets the active primitive type, base coordinates `(x, y)`, bounding quad, and shape parameters. |
| **Style Modifiers** | • `color(int argb)` / `color(float r, float g, float b, float a)` / `color(int r, int g, int b, int a)`<br>• `round(float radius)`: corner radius<br>• `smooth(float radius)`: edge anti-aliasing width<br>• `stroke(float width)`: stroke width (automatically sets `onion` to `width > 0`)<br>• `onion(boolean onion)`: toggles hollow ring mode (`d = abs(d) - stroke * 0.5`)<br>• `rotate(float degrees)`: rotation angle in degrees<br>• `center(boolean center)`: `true` treats `(x, y)` as center, else top-left<br>• `fill()`: solid fill pass (`SdfPassType.FILL`)<br>• `light(float radius)`: exponential glow pass (`SdfPassType.LIGHT`) | Fluently configures SDF rendering parameters. |
| **Submit & Reset** | • `draw(GuiGraphicsExtractor graphics)`<br>• `draw(GuiGraphicsExtractor graphics, SdfParameters sharedParams, float x, float y)`<br>• `reset()`<br>• `static void flush()`<br>• `static void debug(boolean enable)` | Submits GUI element render state to `GuiGraphicsExtractor` (`debug(true)` also draws a blue bounding box `0xFF0000FF`). |
| **Hit Testing** | • `boolean collide(float pointX, float pointY, float threshold)`<br>• `boolean collide(SdfParameters params, float pointX, float pointY, float x, float y, float threshold)` | Checks whether the signed distance from `(pointX, pointY)` to the current (or given `params`) primitive boundary is `< threshold` (pass `0.0f` to test if the point is inside). |
| **Cache & Share** | • `SdfParameters cache()`<br>• `SdfParameters share()` / `void share(SdfParameters cache)`<br>• `void unshare(SdfParameters cache)` | Clones the current `SdfParameters` (`cache()`), or registers it into a shared tail UBO slot (`share()`). Call `unshare` to free the slot when no longer needed. |

### 2. `Sdf2d` (Pure CPU 2D Signed Distance Field Math Utilities)

Located in `dev.anvilcraft.lib.v2.rendering.sdf.Sdf2d`. Return value `< 0` means inside, `= 0` on boundary, `> 0` outside:

| Static Method Signature | Description |
| :--- | :--- |
| `float sd(SdfParameters params, float pX, float pY, float rX, float rY, float rotation, boolean centred)` | Full shader-matching distance calculation (including center offset, inverse rotation, corner rounding, and onion stroke). |
| `sdRect(px, py, bx, by)` / `sdCircle(px, py, r)` / `sdArc(px, py, scx, scy, ra, rb)` / `sdRing(px, py, nx, ny, r, th)` / `sdPie(px, py, cx, cy, r)` / `sdUnevenCapsule(px, py, r1, r2, h)` / `sdEgg(px, py, he, ra, rb)` / `sdSegment(px, py, ax, ay, bx, by)` / `sdEquilateralTriangle(px, py, r)` / `sdIsoscelesTriangle(px, py, qx, qy)` | Standard signed distance functions for each primitive centered at local origin `(0, 0)`. |
