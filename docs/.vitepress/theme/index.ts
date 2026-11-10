import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import BranchContextCard from './components/BranchContextCard.vue'
import './style.scss'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('BranchContextCard', BranchContextCard)
  }
}

export default theme
