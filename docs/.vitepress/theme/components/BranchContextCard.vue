<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import { BRANCHES, type BranchId } from '../../sidebar/branches'

const props = defineProps<{
  branch: BranchId
}>()

const { lang, page } = useData()
const isEn = computed(() => lang.value.startsWith('en') || page.value.relativePath.startsWith('en/'))
const meta = computed(() => BRANCHES.find((b) => b.id === props.branch))
</script>

<template>
  <div v-if="meta" class="anvillib-branch-card">
    <div class="anvillib-branch-card__header">
      <span class="anvillib-branch-card__badge">{{ meta.gitBranch }}</span>
      <span class="anvillib-branch-card__title">{{ isEn ? 'Independent Branch Documentation' : '独立版本分支文档' }}</span>
    </div>
    <div class="anvillib-branch-card__grid">
      <div class="anvillib-branch-card__item">
        <span class="label">{{ isEn ? 'Minecraft Version' : 'Minecraft 版本' }}</span>
        <span class="value">{{ meta.minecraft }}</span>
      </div>
      <div class="anvillib-branch-card__item">
        <span class="label">{{ isEn ? 'NeoForge Version' : 'NeoForge 版本' }}</span>
        <span class="value">{{ meta.neoforge }}</span>
      </div>
      <div class="anvillib-branch-card__item">
        <span class="label">{{ isEn ? 'Java Requirement' : 'Java 要求' }}</span>
        <span class="value">Java {{ meta.javaVersion }}+</span>
      </div>
      <div class="anvillib-branch-card__item">
        <span class="label">{{ isEn ? 'Maven Artifact Suffix' : 'Maven Artifact 后缀' }}</span>
        <span class="value"><code>-neoforge-{{ meta.id }}</code></span>
      </div>
    </div>
  </div>
</template>
