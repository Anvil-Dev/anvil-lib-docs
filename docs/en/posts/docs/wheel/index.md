---
title: Wheel Menu
prev: false
next: false
---

# Wheel Menu Module <Badge type="tip" text=">=1.21.1" /> <Badge type="info" text="enhanced: 1.21.5 / 1.21.6 / 26.1" />

The package `dev.anvilcraft.lib.v2.wheel` provides a highly customizable **Radial Menu**
system, supporting two open modes (Tap and Hold), custom sector/dot selection effects, submenus, and custom renderers.

## Document Index

| Document                     | Content                                                                  |
|------------------------------|--------------------------------------------------------------------------|
| [API Model Layer](./api)     | `WheelMenuModel`, `WheelEntry`, `WheelMenuBuilder`, pages and pagination |
| [Client Rendering](./client) | `WheelWidget`, `WheelScreen`, input control, shader pipelines            |

## Architecture Overview

| Package                   | Responsibility                                                                     |
|---------------------------|------------------------------------------------------------------------------------|
| `api`                     | Data models (entries, pages, pagination, open modes), no client class dependencies |
| `client.gui.component`    | `WheelWidget` control, handles mouse interaction, animation, and rendering         |
| `client.gui.screen`       | `WheelScreen` screen host, manages page stack and mode triggers                    |
| `client.gui.render.state` | GUI render states (ring, selection effect custom shaders)                          |
| `client.init`             | Shader pipelines, dynamic uniform buffers                                          |
| `client.input`            | `WheelScreenController` input handling                                             |

## Notes

- Classes under the `client` package may only be used on the physical client
- Dynamic uniforms use per-frame caching to avoid frequent `WheelWidget` rebuilds
- `GlobalRendererMixin` (from the rendering module) must be present for custom pipeline display
- Submenus only support one level of nesting (`WheelSubmenuBuilder`)
