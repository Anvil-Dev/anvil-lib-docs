---
title: Network
prev: false
next: false
---

# Network Packet Module <Badge type="tip" text=">=1.21.1" />

::: warning Availability
`NetworkUtil` (batch-sending utilities) was not synchronized in versions 1.21.2-1.21.11; it is only available in 1.21.1 and 26.1. All other APIs are consistent across all versions.
:::

The package `dev.anvilcraft.lib.v2.network` provides a high-level abstraction over the NeoForge networking system to simplify packet definition, direction management, and automatic registration.

## Documentation Index

| Document                     | Content                                                                |
|------------------------------|------------------------------------------------------------------------|
| [Packet Interfaces](./packets) | `IPacket`, `IClientboundPacket`, `IServerboundPacket`, bidirectional packets |
| [Registration System](./registration) | `@Network` annotation, `NetworkRegistrar`, `PacketProtocol`           |
| [Sending Utilities](./utilities)    | `NetworkUtil` batch-sending methods                                   |

## Core Workflow

1. Define a packet class, implement the corresponding interface (e.g., `IClientboundPacket`), and declare `static final Type<?>` and `StreamCodec`
2. Add the `@Network` annotation to `package-info.java`, specifying the protocol phase
3. Call `NetworkRegistrar.register(registrar, modId)` inside `RegisterPayloadHandlersEvent`

## Notes

- Packet classes must have a no-arg constructor (typically using records)
- `NetworkRegistrar` looks up `Type` and `StreamCodec` static fields via reflection
- If registration throws an exception, check whether the packet class is missing static fields or fails to implement the expected interface
