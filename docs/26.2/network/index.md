# Network 数据包接口与方向模型 (`module.network`)

<BranchContextCard branch="26.2" />

`module.network`（构件名 `anvillib-network-neoforge-26.2`，包名 `dev.anvilcraft.lib.v2.network`）是对 NeoForge `CustomPacketPayload` 网络通信系统的轻量级封装，消除了逐个手动注册数据包处理器和手动切换主线程（`ctx.enqueueWork(...)`）的样板代码。

本模块按功能拆分为 2 篇子文档：
- **本篇（数据包接口与方向模型）**：详解 `IPacket`、`IClientboundPacket`、`IServerboundPacket`、`IInsensitiveBiPacket` 与 `ISensitiveBiPacket` 五大接口及其线程调度机制。
- **[@Network 注解、自动注册与工具方法](./registrar-and-util)**：详解 `@Network` 包级注解、`PacketProtocol`、`NetworkRegistrar`、`PacketData`、`NetworkUtil` 与 `BoolAndInt` 紧凑位打包记录。

---

## 一、 接入配置

若已引入聚合包 `anvillib-neoforge-26.2`，则已自动包含本模块；若仅需单独引入 `network` 模块：

```kotlin
dependencies {
    implementation("dev.anvilcraft.lib:anvillib-network-neoforge-26.2:2.0.0")
}
```

---

## 二、 五大数据包接口层次与选择指南

`module.network` 以密封接口 `IPacket`（继承自原版 `CustomPacketPayload`）为根，按通信方向划分为 4 个子接口：

```text
IPacket (sealed, extends CustomPacketPayload)
 ├── IClientboundPacket (non-sealed, 服务端 -> 客户端)
 │    ├── IInsensitiveBiPacket (双向发送，两端共用同一套 handleOnBothSide 逻辑)
 │    └── ISensitiveBiPacket   (双向发送，客户端走 handleOnClient，服务端走 handleOnServer)
 └── IServerboundPacket (non-sealed, 客户端 -> 服务端)
      ├── IInsensitiveBiPacket
      └── ISensitiveBiPacket
```

| 接口名称 | 发送方向 | 开发者需要实现的业务方法 | 线程安全保障 |
| :--- | :--- | :--- | :--- |
| **`IClientboundPacket`** | 服务端 → 客户端 | `void handleOnClient(Player player)` | `clientHandler` 默认通过 `ctx.enqueueWork(...)` 将 `handleOnClient` 调度到**客户端主线程**执行，`player` 恒为 `LocalPlayer`。 |
| **`IServerboundPacket`** | 客户端 → 服务端 | `void handleOnServer(Player player)` | `serverHandler` 默认通过 `ctx.enqueueWork(...)` 将 `handleOnServer` 调度到**服务端主线程**执行，`player` 恒为 `ServerPlayer`。 |
| **`IInsensitiveBiPacket`** | 客户端 ↔ 服务端（双向） | `void handleOnBothSide(Player player)` | 适用于两端处理逻辑完全对称的网络包。默认在对应端的主线程调用 `handleOnBothSide(player)`。 |
| **`ISensitiveBiPacket`** | 客户端 ↔ 服务端（双向） | 同时实现 `handleOnClient(Player)` 与 `handleOnServer(Player)` | 适用于同一个包数据结构既能从客户端发往服务端、又能从服务端发往客户端，但两端处理逻辑不同的场景。`bidirectionalHandler` 会根据 `ctx.flow().isClientbound()` / `isServerbound()` 自动分流。 |

---

## 三、 编写数据包的硬性契约（供自动注册器识别）

为了让 `NetworkRegistrar.register(registrar, MOD_ID)` 自动扫描并注册你的数据包类，每个实现上述接口的数据包类（通常定义为 `record`）**必须声明以下两个 `static final` 字段**（字段名不限，扫描器按泛型类型签名精确匹配）：

1. **`CustomPacketPayload.Type<Self>` 静态常量**：
   可通过 `IPacket.type(Identifier)` 快捷创建，泛型实参第 0 位必须是当前包类自身。
2. **`StreamCodec<B, Self>` 静态常量**：
   - 若所属包协议为 `PacketProtocol.PLAY`（默认），缓冲区类型 `B` 可以是 `RegistryFriendlyByteBuf`、`FriendlyByteBuf` 或 `ByteBuf`；
   - 若所属包协议为 `PacketProtocol.CONFIGURATION` 或 `PacketProtocol.COMMON`，缓冲区类型 `B` 只能是 `FriendlyByteBuf` 或 `ByteBuf`（配置阶段尚未建立注册表同步上下文）。
   - 泛型实参第 1 位必须是当前包类自身。

---

## 四、 完整代码示例

下面演示如何编写服务端下发包（`IClientboundPacket`）、客户端上行包（`IServerboundPacket`）以及方向敏感的双向包（`ISensitiveBiPacket`）：

```java
package com.example.mymod.network.packet;

import com.example.mymod.MyMod;
import dev.anvilcraft.lib.v2.codec.StreamCodecUtil;
import dev.anvilcraft.lib.v2.network.packet.IClientboundPacket;
import dev.anvilcraft.lib.v2.network.packet.IPacket;
import dev.anvilcraft.lib.v2.network.packet.ISensitiveBiPacket;
import dev.anvilcraft.lib.v2.network.packet.IServerboundPacket;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

public final class ModPackets {
    private ModPackets() {
    }

    // 1. 服务端 -> 客户端单向包：通知客户端播放机器特效
    public record MachineEffectPacket(BlockPos pos, int powerLevel) implements IClientboundPacket {
        public static final Type<MachineEffectPacket> TYPE = IPacket.type(
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "machine_effect")
        );

        public static final StreamCodec<RegistryFriendlyByteBuf, MachineEffectPacket> STREAM_CODEC =
            StreamCodec.composite(
                StreamCodecUtil.VAR_INT_BLOCK_POS,
                MachineEffectPacket::pos,
                ByteBufCodecs.VAR_INT,
                MachineEffectPacket::powerLevel,
                MachineEffectPacket::new
            );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }

        @Override
        public void handleOnClient(Player player) {
            // 已自动通过 ctx.enqueueWork 切换到客户端主线程，可安全访问 player.level()
            player.level().levelEvent(2004, this.pos, this.powerLevel);
        }
    }

    // 2. 客户端 -> 服务端单向包：玩家点击 GUI 按钮请求切换机器模式
    public record ToggleMachineModePacket(BlockPos pos, boolean overdrive) implements IServerboundPacket {
        public static final Type<ToggleMachineModePacket> TYPE = IPacket.type(
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "toggle_machine_mode")
        );

        public static final StreamCodec<ByteBuf, ToggleMachineModePacket> STREAM_CODEC =
            StreamCodec.composite(
                BlockPos.STREAM_CODEC,
                ToggleMachineModePacket::pos,
                ByteBufCodecs.BOOL,
                ToggleMachineModePacket::overdrive,
                ToggleMachineModePacket::new
            );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            // 已在服务端主线程，player 恒为 ServerPlayer
            if (!(player instanceof ServerPlayer serverPlayer)) return;
            if (serverPlayer.distanceToSqr(this.pos.getCenter()) > 64.0) return;
            // 安全修改服务端方块实体状态...
        }
    }

    // 3. 方向敏感双向包：客户端请求查询数值，服务端用同一个包结构回复最新数值
    public record ValveSyncPacket(BlockPos pos, int flowRate) implements ISensitiveBiPacket {
        public static final Type<ValveSyncPacket> TYPE = IPacket.type(
            Identifier.fromNamespaceAndPath(MyMod.MOD_ID, "valve_sync")
        );

        public static final StreamCodec<ByteBuf, ValveSyncPacket> STREAM_CODEC =
            StreamCodec.composite(
                BlockPos.STREAM_CODEC,
                ValveSyncPacket::pos,
                ByteBufCodecs.VAR_INT,
                ValveSyncPacket::flowRate,
                ValveSyncPacket::new
            );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }

        @Override
        public void handleOnServer(Player player) {
            // 客户端发来修改请求后，服务端校验并广播回客户端
        }

        @Override
        public void handleOnClient(Player player) {
            // 客户端收到服务端下发的最新 flowRate 后更新本地状态
        }
    }
}
```

---

## 五、 接口 API 签名汇总表

| 接口名 | 方法签名 | 默认行为与说明 |
| :--- | :--- | :--- |
| `IPacket` | `static <T extends IPacket> Type<T> type(Identifier id)` | 返回 `new CustomPacketPayload.Type<>(id)`。 |
| `IClientboundPacket` | `default void clientHandler(IPayloadContext ctx)`<br>`void handleOnClient(Player player)` | `clientHandler` 调用 `ctx.enqueueWork(() -> this.handleOnClient(ctx.player()))`。若需在网络 Netty 线程直接处理，可重写 `clientHandler`。 |
| `IServerboundPacket` | `default void serverHandler(IPayloadContext ctx)`<br>`void handleOnServer(Player player)` | `serverHandler` 调用 `ctx.enqueueWork(() -> this.handleOnServer(ctx.player()))`。 |
| `IInsensitiveBiPacket` | `default void bidirectionalHandler(IPayloadContext ctx)`<br>`void handleOnBothSide(Player player)` | 将 `clientHandler`、`serverHandler`、`handleOnClient`、`handleOnServer` 全部统一路由至 `handleOnBothSide(player)`。 |
| `ISensitiveBiPacket` | `default void bidirectionalHandler(IPayloadContext ctx)` | 根据 `ctx.flow().isClientbound()` 与 `ctx.flow().isServerbound()` 分别转发给 `this.clientHandler(ctx)` 或 `this.serverHandler(ctx)`。 |
