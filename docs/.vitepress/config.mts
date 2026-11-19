import { defineConfig, type DefaultTheme } from 'vitepress'
import { BRANCHES, createBranchSidebar } from './sidebar/branches'

const sidebar: DefaultTheme.Sidebar = {}
for (const branch of BRANCHES) {
  sidebar[`/${branch.id}/`] = createBranchSidebar(branch)
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'AnvilLib 开发者文档',
  description: 'AnvilLib 全分支、全模块 NeoForge 模组开发技术文档',
  cleanUrls: true,
  lastUpdated: false,
  ignoreDeadLinks: true,
  markdown: {
    math: true
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler'
        }
      }
    }
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      {
        text: '分支版本',
        items: BRANCHES.map((b) => ({
          text: `${b.gitBranch} (MC ${b.minecraft})`,
          link: `/${b.id}/`
        }))
      },
      { text: '全分支 Checklist', link: '/checklist' }
    ],
    sidebar,
    outline: {
      level: [2, 3],
      label: '本页目录'
    },
    search: {
      provider: 'local',
      options: {
        _render(source, env, md) {
          const html = md.render(source, env)
          if (env.frontmatter?.search === false) return ''

          const branch = BRANCHES.find(({ id }) => env.relativePath?.startsWith(`${id}/`))
          if (!branch) return html

          return html.replace(/<h1\b[^>]*>/, (heading) => `${heading}[MC ${branch.minecraft}] `)
        }
      }
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Anvil-Dev/AnvilLib' }
    ]
  }
})
