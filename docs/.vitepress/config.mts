import { defineConfig, type DefaultTheme } from 'vitepress'
import { BRANCHES, createBranchSidebar, createEnBranchSidebar } from './sidebar/branches'

const zhSidebar: DefaultTheme.Sidebar = {}
const enSidebar: DefaultTheme.Sidebar = {}
for (const branch of BRANCHES) {
  zhSidebar[`/${branch.id}/`] = createBranchSidebar(branch)
  enSidebar[`/en/${branch.id}/`] = createEnBranchSidebar(branch)
}

export default defineConfig({
  cleanUrls: false,
  lastUpdated: false,
  ignoreDeadLinks: true,
  transformHead({ siteData }) {
    return [['link', { rel: 'icon', href: `${siteData.base}favicon.ico` }]]
  },
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
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'AnvilLib 开发者文档',
      description: 'AnvilLib 全分支、全模块 NeoForge 模组开发技术文档',
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
          { text: '活动', link: '/posts/event/' },
          { component: 'AnvilCraftNavLink' }
        ],
        sidebar: zhSidebar,
        outline: {
          level: [2, 3],
          label: '本页目录'
        },
        docFooter: {
          prev: '上一篇',
          next: '下一篇'
        }
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'AnvilLib Developer Docs',
      description: 'AnvilLib NeoForge Modding Technical Documentation for All Branches & Modules',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          {
            text: 'Branches',
            items: BRANCHES.map((b) => ({
              text: `${b.gitBranch} (MC ${b.minecraft})`,
              link: `/en/${b.id}/`
            }))
          },
          { text: 'Events', link: '/en/posts/event/' },
          { component: 'AnvilCraftNavLink' }
        ],
        sidebar: enSidebar,
        outline: {
          level: [2, 3],
          label: 'On this page'
        },
        docFooter: {
          prev: 'Previous',
          next: 'Next'
        }
      }
    }
  },
  themeConfig: {
    search: {
      provider: 'local',
      options: {
        _render(source, env, md) {
          const html = md.render(source, env)
          if (env.frontmatter?.search === false) return ''

          const rel = env.relativePath?.replace(/^en\//, '') ?? ''
          const branch = BRANCHES.find(({ id }) => rel.startsWith(`${id}/`))
          if (!branch) return html

          return html.replace(/<h1\b[^>]*>/, (heading) => `${heading}[MC ${branch.minecraft}] `)
        }
      }
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Anvil-Dev/AnvilLib' }
    ]
  }
})
