# Network 网络通信框架：数据包接口体系 (`module.network`)

<BranchContextCard branch="1.21.1" />

`module.network`（构件名 `anvillib-network-neoforge-1.21.1`，包名 `dev.anvilcraft.lib.v2.network`）提供了一套对 NeoForge `CustomPacketPayload` 的**高层方向接口封装与基于包扫描的 `@Network` 一键自动注册框架**。

在原生 NeoForge `21.1.x` 中，每新增一个网络包，不仅要实现 `CustomPacketPayload`，还要到 `RegisterPayloadHandlersEvent` 里根据协议阶段（`play` / `configuration` / `common`）和方向（`ToClient` / `ToServer` / `Bidirectional`）手写一长串 `registrar.playToServer(MyPacket.TYPE, MyPacket.STREAM_CODEC, MyPacket::handle)`，并且在 Handler 里每次都要手写 `ctx.enqueueWork(() -> ...)` 切换到主线程。

使用 `module.network`：
1. 让你的网络包 `record` 实现 **`IClientboundPacket`**、**`IServerboundPacket`**、**`IInsensitiveBiPacket`** 或 **`ISensitiveBiPacket`**，框架已默认通过 `context.enqueueWork(...)` 将处理方法调度到主线程并直接把 `Player` 作为参数传给你；
2. 在该包所在的 `package-info.java`（或包内任意一个类）上标注 **`@Network`**，在 `RegisterPayloadHandlersEvent` 中只需调用一行 `NetworkRegistrar.register(registrar, MOD_ID)` 即可自动发现并注册包下所有数据包！

本模块拆分为 2 篇子文档：
- **本篇（数据包方向接口体系）**：详解 `IPacket`、`IClientboundPacket`、`IServerboundPacket`、`IInsensitiveBiPacket` 与 `ISensitiveBiPacket`。
- **[自动扫描注册器与紧凑编码工具](./registrar-and-util)**：详解 `@Network`、`NetworkRegistrar`、`PacketData`、`PacketDirection`、`PacketProtocol`、`NetworkUtil` 与 `BoolAndInt`。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-1.21.1`，则已自动包含本模块；若仅需单独引入 `network` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-network-neoforge-1.21.1:2.0.0")
}
```

---

## 二、 密封接口继承体系与约定字段

`IPacket` 是一个继承自 `CustomPacketPayload` 的**密封接口（`sealed interface`）**，其子接口关系如下：

- `IPacket`（根接口）
  - **`IClientboundPacket`**：仅服务端发往客户端（`S -> C`）
  - **`IServerboundPacket`**：仅客户端发往服务端（`C -> S`）
  - **同时实现 `IClientboundPacket` 与 `IServerboundPacket` 的双向包**：
    - **`IInsensitiveBiPacket`**：对方向不敏感的双向包（双端共用同一个 `handleOnBothSide(Player player)` 方法）
    - **`ISensitiveBiPacket`**：对方向敏感的双向包（在客户端收到时执行 `handleOnClient(Player)`，在服务端收到时执行 `handleOnServer(Player)`）

### 自动扫描反射约定（重要）

为了让 `PacketData.find(packetClass)` 能自动提取你的网络包元数据，每个实现了 `IPacket` 子接口的网络包类**必须声明以下两个静态字段（名称与修饰符任意，仅按字段类型匹配）**：
1. 一个类型为 **`CustomPacketPayload.Type<Self>`** 的 `static` 字段（可通过 `IPacket.type(ResourceLocation)` 创建）；
2. 一个类型为 **`StreamCodec<? super B, Self>`** 的 `static` 字段（对于 `PLAY` 阶段，`B` 最高可为 `RegistryFriendlyByteBuf`；对于 `CONFIGURATION` 和 `COMMON` 阶段，`B` 最高为 `FriendlyByteBuf` 或 `ByteBuf`）。

---

## 三、 完整代码示例：编写单向包与双向包

```java
package com.example.mymod.network;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.network.packet.IClientboundPacket;
import dev.anvilcraft.lib.v2.network.packet.IPacket;
import dev.anvilcraft.lib.v2.network.packet.ISensitiveBiPacket;
import dev.anvilcraft.lib.v2.network.packet.IServerboundPacket;
import dev.anvilcraft.lib.v2.network.register.Network;
import dev.anvilcraft.lib.v2.network.register.PacketProtocol;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

// 在包内任意类（或 package-info.java）上标注 @Network，即可扫描本 package 下所有 IPacket 实现类！
@Network(protocol = PacketProtocol.PLAY)
public final class ModPackets {
    private ModPackets() {
    }

    // 1. 客户端 -> 服务端单向包 (IServerboundPacket)
    public record ToggleMachinePacket(BlockPos pos, boolean enabled) implements IServerboundPacket {
        public static final Type<ToggleMachinePacket> TYPE =
            IPacket.type(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "toggle_machine"));

        public static final StreamCodec<ByteBuf, ToggleMachinePacket> STREAM_CODEC = StreamCodec.composite(
            BlockPos.STREAM_CODEC, ToggleMachinePacket::pos,
            ByteBufCodecs.BOOL, ToggleMachinePacket::enabled,
            ToggleMachinePacket::new
        );

        @Override
        public Type<ToggleMachinePacket> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            // 已由框架自动通过 context.enqueueWork 调度到服务端主线程！
            if (player instanceof ServerPlayer serverPlayer && serverPlayer.level().isLoaded(this.pos)) {
                MyMod.LOGGER.info("玩家 {} 切换了 {} 处的机器开关为 {}", serverPlayer.getName().getString(), this.pos, this.enabled);
            }
        }
    }

    // 2. 服务端 -> 客户端单向包 (IClientboundPacket)
    public record SyncEnergyEffectPacket(BlockPos pos, int energy) implements IClientboundPacket {
        public static final Type<SyncEnergyEffectPacket> TYPE =
            IPacket.type(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "sync_energy_effect"));

        public static final StreamCodec<RegistryFriendlyByteBuf, SyncEnergyEffectPacket> STREAM_CODEC = StreamCodec.composite(
            BlockPos.STREAM_CODEC, SyncEnergyEffectPacket::pos,
            ByteBufCodecs.VAR_INT, SyncEnergyEffectPacket::energy,
            SyncEnergyEffectPacket::new
        );

        @Override
        public Type<SyncEnergyEffectPacket> type() {
            return TYPE;
        }

        @Override
        public void handleOnClient(Player player) {
            // 已自动在客户端主线程执行
            MyMod.LOGGER.debug("客户端收到 {} 能量更新: {}", this.pos, this.energy);
        }
    }

    // 3. 方向敏感的双向包 (ISensitiveBiPacket)
    public record PingPongHandshakePacket(long timestamp) implements ISensitiveBiPacket {
        public static final Type<PingPongHandshakePacket> TYPE =
            IPacket.type(ResourceLocation.fromNamespaceAndPath(MyMod.MOD_ID, "ping_pong"));

        public static final StreamCodec<ByteBuf, PingPongHandshakePacket> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_LONG, PingPongHandshakePacket::timestamp,
            PingPongHandshakePacket::new
        );

        @Override
        public Type<PingPongHandshakePacket> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            MyMod.LOGGER.info("服务端收到来自客户端的 Ping: {}", this.timestamp);
        }

        @Override
        public void handleOnClient(Player player) {
            MyMod.LOGGER.info("客户端收到来自服务端的 Pong: {}", this.timestamp);
        }
    }
}
```

---

## 四、 数据包接口 API 详解 (`dev.anvilcraft.lib.v2.network.packet`)

| 接口名 | 继承关系 | 必须实现的方法 | 默认实现的底层 Handler 方法 |
| :--- | :--- | :--- | :--- |
| **`IPacket`** | `extends CustomPacketPayload` | `Type<? extends CustomPacketPayload> type()` | 提供静态工厂 `static <T extends IPacket> Type<T> type(ResourceLocation id)`。 |
| **`IClientboundPacket`** | `extends IPacket` | `void handleOnClient(Player player)` | `default void clientboundHandler(IPayloadContext context)`：默认调用 `context.enqueueWork(() -> this.handleOnClient(context.player()))`（如需在网络线程直接处理或访问 `context.reply`，可重写 `clientboundHandler`）。 |
| **`IServerboundPacket`** | `extends IPacket` | `void handleOnServer(Player player)` | `default void serverboundHandler(IPayloadContext context)`：默认调用 `context.enqueueWork(() -> this.handleOnServer(context.player()))`。 |
| **`IInsensitiveBiPacket`** | `extends IClientboundPacket, IServerboundPacket` | `void handleOnBothSide(Player player)` | 默认将 `handleOnClient`、`handleOnServer` 均转发给 `handleOnBothSide`，并提供 `default void bidirectionalHandler(IPayloadContext context)`。 |
| **`ISensitiveBiPacket`** | `extends IClientboundPacket, IServerboundPacket` | • `void handleOnClient(Player player)`<br>• `void handleOnServer(Player player)` | `default void bidirectionalHandler(IPayloadContext context)`：判断 `context.flow().isClientbound()`，为 `true` 时调用 `clientboundHandler(context)`，否则调用 `serverboundHandler(context)`。 |
