---
title: Rendering 渲染集成
prev: false
next: false
---

# 渲染集成 <Badge type="tip" text=">=26.1" />

## ALRendering

模组入口主类，通过 `@Mod` 和 `@EventBusSubscriber` 注册。

### 初始化与事件

| 事件                                 | 处理                                                                  |
|------------------------------------|---------------------------------------------------------------------|
| `RenderFrameEvent.Pre`             | `bloomPostEffect.beginFrame()`                                      |
| `RenderLevelStageEvent.AfterLevel` | `bloomPostEffect.process(modelViewMatrix, featureRenderDispatcher)` |
| `RegisterPipelineModifiersEvent`   | 注册 `REDIRECT_TO_BLOOM` 修饰符                                          |

```java
// 获取泛光实例
BloomPostEffect bloom = ALRendering.getBloomPostEffect();
```

### 管线创建

在 `MinecraftMixin` 构造结束回调中调用 `ALRendering.createPipelines()` 初始化泛光实例。

## 着色器与管线

### 着色器文件

| 文件                | 类型 | 作用                             |
|-------------------|----|--------------------------------|
| `blit.vsh`        | 顶点 | 全屏四边形变换，输出 UV                  |
| `blur.fsh`        | 片段 | 7 权重高斯模糊（方向 + 步长）              |
| `apply_bloom.fsh` | 片段 | 按强度混合泛光到游戏画面                   |
| `down_sample.fsh` | 片段 | 4 像素取平均下采样                     |
| `up_sample.fsh`   | 片段 | 5×5 高斯核上采样，与前一帧混合              |
| `util.glsl`       | 工具 | `saturate()`, `toneMap()` 辅助函数 |

### 管线注册 (ALRPipelines)

4 个基于 `POST_PASS` 片段的管线：

| 管线            | 作用      |
|---------------|---------|
| `BLUR`        | 高斯模糊    |
| `APPLY_BLOOM` | 泛光混合到画面 |
| `DOWNSAMPLE`  | 下采样     |
| `UPSAMPLE`    | 上采样     |

基础片段 `POST_PASS` 使用 `blit.vsh`，绑定 `Transforms` UBO 和 `DiffuseSampler`，禁用面剔除。

## Mixin

### MinecraftMixin

- 构造结束时调用 `ALRendering.createPipelines()` 初始化泛光实例
- 窗口大小改变时恢复泛光纹理大小

### GuiRendererMixin

- 追踪每个 GUI 绘制元素对应的 `GuiElementRenderState`
- 当元素实现 `LibGuiElementRenderState` 时，在绘制前将其 `bufferSlices()` 返回的 UBO 切片绑定到 RenderPass

## 状态接口

### LibGuiElementRenderState

扩展 `GuiElementRenderState`，允许 GUI 元素注入自定义 Uniform。

```java
public interface LibGuiElementRenderState extends GuiElementRenderState {
    // 返回需要绑定的 UBO buffer 切片
    Map<String, GpuBufferSlice> bufferSlices();
}
```

### LibQuadGuiElementRenderState

为四边形元素提供便捷的视口计算和顶点构建：

```java
public interface LibQuadGuiElementRenderState extends LibGuiElementRenderState {
    AABB getBounds();           // 视口包围盒
    void buildVertices(...);    // 顶点构建
}
```

## 测试与调试

`ALRTest` 提供了示例（如渲染带泛光的物品）：

```java
// 开启调试模式：添加 JVM 属性
// -Danvillib.rendering.debugMode=true
```

```java
ALRTest.renderCarrotBloomed(); // 渲染发光的胡萝卜
```

## 自定义 GUI 元素注入 UBO

```java
public class MyGuiElement implements LibQuadGuiElementRenderState {
    @Override
    public Map<String, GpuBufferSlice> bufferSlices() {
        Map<String, GpuBufferSlice> slices = new HashMap<>();
        slices.put("MyUniform", myUniformBuffer);
        return slices;
    }
}
```
