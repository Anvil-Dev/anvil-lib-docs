<script setup lang="ts">
import { VPLink } from 'vitepress/theme'
import { onMounted, ref } from 'vue'

defineProps<{ screenMenu?: boolean }>()

const href = ref('https://anvil-dev.github.io/')

onMounted(() => {
  if (window.location.hostname === 'lib.anvilcraft.dev') {
    href.value = 'https://www.anvilcraft.dev/'
  }
})
</script>

<template>
  <VPLink class="anvilcraft-nav-link" :class="{ 'screen-menu': screenMenu }" :href="href" target="_self">
    铁砧工艺
  </VPLink>
</template>

<style scoped>
.anvilcraft-nav-link {
  display: flex;
  align-items: center;
  padding: 0 12px;
  line-height: var(--vp-nav-height);
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  transition: color 0.25s;
}

.anvilcraft-nav-link:hover {
  color: var(--vp-c-brand-1);
}

.screen-menu {
  display: block;
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 12px 0 11px;
  line-height: 24px;
}
</style>
