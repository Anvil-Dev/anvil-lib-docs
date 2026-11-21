import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import AnvilCraftNavLink from './components/AnvilCraftNavLink.vue'
import BranchContextCard from './components/BranchContextCard.vue'
import './style.scss'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('AnvilCraftNavLink', AnvilCraftNavLink)
    app.component('BranchContextCard', BranchContextCard)
  }
}

export default theme
