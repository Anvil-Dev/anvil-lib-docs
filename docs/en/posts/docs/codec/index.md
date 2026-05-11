---
title: Codec
prev: false
next: false
---

# Codec Utilities Module <Badge type="tip" text=">=1.21.1" />

The package `dev.anvilcraft.lib.v2.codec` contains frequently used serialization utilities for Minecraft/NeoForge
development, divided into two categories:

- **Config/Save Codecs (`Codec`)** — for JSON, NBT, and configuration file serialization
- **Network Stream Codecs (`StreamCodec`)** — for compact binary serialization of network packets

## Documentation Index

| Document                                     | Content                                                                             |
|----------------------------------------------|-------------------------------------------------------------------------------------|
| [Codec Utilities](./codec-util)              | `CodecUtil` — built-in Codec constants and helper methods                           |
| [StreamCodec Utilities](./stream-codec-util) | `StreamCodecUtil` — built-in StreamCodec constants, composite methods, and bridging |

## Notes

- All predefined Codec/StreamCodec instances are immutable constants and can be safely shared
- Most codecs depend on the currently running registries (`BuiltInRegistries`); serialized data is bound to registry IDs
- Be mindful of registry ID compatibility across different versions
