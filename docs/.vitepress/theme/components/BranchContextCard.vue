<script setup lang="ts">
import { computed } from 'vue'
import { BRANCHES, type BranchId } from '../../sidebar/branches'

const props = defineProps<{
  branch: BranchId
}>()

const meta = computed(() => BRANCHES.find((b) => b.id === props.branch))
</script>

<template>
  <div v-if="meta" class="anvillib-branch-card">
    <div class="anvillib-branch-card__header">
      <span class="anvillib-branch-card__badge">{{ meta.gitBranch }}</span>
      <span class="anvillib-branch-card__title">独立版本分支文档</span>
    </div>
    <div class="anvillib-branch-card__grid">
      <div class="anvillib-branch-card__item">
        <span class="label">Minecraft 版本</span>
        <span class="value">{{ meta.minecraft }}</span>
      </div>
      <div class="anvillib-branch-card__item">
        <span class="label">NeoForge 版本</span>
        <span class="value">{{ meta.neoforge }}</span>
      </div>
      <div class="anvillib-branch-card__item">
        <span class="label">Java 要求</span>
        <span class="value">Java {{ meta.javaVersion }}+</span>
      </div>
      <div class="anvillib-branch-card__item">
        <span class="label">Maven Artifact 后缀</span>
        <span class="value"><code>-neoforge-{{ meta.id }}</code></span>
      </div>
    </div>
  </div>
</template>
