---
title: Rendering 泛光后处理
prev: false
next: false
---

# 泛光后处理 <Badge type="tip" text=">=26.1" />

## BloomPostEffect

核心类，管理泛光输入、下采样、上采样、模糊及混合全过程。

### 初始化

```java
// 通过 ALRendering 获取
BloomPostEffect bloom = ALRendering.getBloomPostEffect();

// 或直接构造（可自定义参数）
BloomPostEffect bloom = new BloomPostEffect(bloomIntensity, threshold, sensitivity);
```

构造函数创建 `BloomParametersUbo`、`BlurParametersUbo`、`BloomPipelineParametersUbo` 及对应 GPU Buffer，初始化
`downsampleTargets[]` 和 `upsampleTargets[]` 目标纹理。

### 主要方法

| 方法                                                  | 说明                  |
|-----------------------------------------------------|---------------------|
| `beginFrame()`                                      | 每帧开始时清理临时纹理和脏标记     |
| `drawBloomed(BloomRenderCallback)`                  | 注册需要在泛光输入纹理上额外绘制的物体 |
| `process(modelViewMatrix, featureRenderDispatcher)` | 执行完整的泛光处理流程         |
| `resize(width, height)`                             | 窗口大小变化时重新调整所有目标纹理   |
| `markDirty()`                                       | 手动标记需要重新处理          |

### process 流程

```
1. runBloomDraws ← 执行所有 BloomRenderCallback，渲染到 bloomInputTarget
2. doDownSample  ← 逐步缩小泛光纹理（每次半尺寸）
3. doUpSample    ← 逐步放大，使用 5×5 高斯核，结合当前层+前一层
4. applyBloom    ← 将泛光结果混合回主渲染目标
```

### 回调接口

```java
@FunctionalInterface
public interface BloomRenderCallback {
    void render(SubmitNodeCollector nodeCollector, PoseStack poseStack);
}
```

```java
bloom.drawBloomed((nodeCollector, poseStack) -> {
    // 渲染需要泛光的物体到 bloomInputTarget
    // 例如：渲染发光的物品、方块等
});
```

### 内部 Pass

| Pass       | 管线            | Shader                       | 说明              |
|------------|---------------|------------------------------|-----------------|
| DownSample | `DOWNSAMPLE`  | `down_sample.fsh`            | 4 像素取平均，尺寸减半    |
| UpSample   | `UPSAMPLE`    | `up_sample.fsh` + `blur.fsh` | 5×5 高斯模糊，与上一层混合 |
| ApplyBloom | `APPLY_BLOOM` | `apply_bloom.fsh`            | 泛光纹理与主画面混合      |

### 混合公式

```
color + bloom * pow(threshold, luminance * sensitivity)
```

## 泛光 UBO

### BloomParametersUbo

```java
public class BloomParametersUbo extends UboObject<BloomParametersUbo> {
    float bloomIntensity;       // 泛光强度
    float bloomBlendThreshold;   // 混合阈值
    float luminanceSensitivity;  // 亮度灵敏度
}
```

### BlurParametersUbo

```java
public class BlurParametersUbo extends UboObject<BlurParametersUbo> {
    Vec2f direction;        // 模糊方向
    float sampleStepLength; // 采样步长
    float colorMultiplier;  // 颜色乘数
}
```

### BloomPipelineParametersUbo

```java
public class BloomPipelineParametersUbo extends UboObject<BloomPipelineParametersUbo> {
    Vec2f resolution; // 渲染分辨率
    int frameIndex;   // 帧索引
}
```

### TransformsUbo

```java
public class TransformsUbo extends UboObject<TransformsUbo> {
    Matrix4f projMat; // 正交投影矩阵
}
```

## 使用示例

```java
// 获取泛光实例
BloomPostEffect bloom = ALRendering.getBloomPostEffect();

// 注册泛光绘制
bloom.drawBloomed((nodeCollector, poseStack) -> {
    // 渲染发光物体
    ItemRenderer.renderItem(itemStack, poseStack, ...);
});

// 手动标记脏状态
bloom.markDirty();
```
