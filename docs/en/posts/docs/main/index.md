---
title: Main Aggregate Module
prev: false
next: false
---

# AnvilLib Aggregate Module <Badge type="tip" text=">=1.21.1" />

This module is the aggregate module of AnvilLib, representing the foundation of the entire library. It does not contain functional code itself but serves as the aggregate entry point for all submodules, providing unified version management, build publishing, and dependency coordination.

## Project Structure

AnvilLib uses a multi-module Gradle project organization. The root project `anvillib` uniformly configures build information for all submodules via `build.gradle`.

Currently available submodules:

| Module Name                                     | Function                                             |
|-------------------------------------------------|------------------------------------------------------|
| `anvillib-config-neoforge-26.1`                 | Config system (annotations, reflection, language generation) |
| `anvillib-codec-neoforge-26.1`                  | Codec/StreamCodec utilities                          |
| `anvillib-integration-neoforge-26.1`            | Inter-mod integration system                        |
| `anvillib-moveable-entity-block-neoforge-26.1`  | Preserve block entity data during piston movement    |
| `anvillib-network-neoforge-26.1`                | Network packet abstraction and auto-registration     |
| `anvillib-recipe-neoforge-26.1`                 | Recipe utilities (predicates, chance items, etc.)    |
| `anvillib-registrum-neoforge-26.1`              | Registration system                                  |
| `anvillib-wheel-neoforge-26.1`                  | Radial menu UI system                                |
| `anvillib-rendering-neoforge-26.1`              | Lightweight rendering library                        |
| `anvillib-multiblock-neoforge-26.1`             | Dynamic multiblock system                            |
| `anvillib-util-neoforge-26.1`                   | Shareable utility methods                            |

All submodules are included via `jarJar`, meaning they are embedded into the final published Jar, and use `api` for dependency transitivity, so mods do not need to depend on them individually.
