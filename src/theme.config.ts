import { defineThemeConfig } from './types'

export default defineThemeConfig({
  site: 'https://www.taiwei.site',
  title: 'TaiWei',
  description: 'TaiWei 的前端与产品工程笔记',
  author: 'TaiWei',
  navbarItems: [
    { label: '首页', href: '/' },
    { label: '博客', href: '/posts/' },
    { label: '标签', href: '/tags/' },
    { label: '时间轴', href: '/timeline/' },
    { label: '小鹰', href: '/nest/' },
    { label: '关于', href: '/about/' },
    {
      label: '其它页面',
      children: [{ label: '404 页面', href: '/404' }]
    }
  ],
  footerItems: [
    // {
    //   icon: "tabler--brand-github",
    //   href: "https://github.com/FjellOverflow/nordlys",
    //   label: "Github",
    // },
    {
      icon: 'tabler--rss',
      href: '/feed.xml',
      label: 'RSS feed'
    }
  ],

  // optional settings
  locale: 'zh-CN',
  mode: 'light',
  modeToggle: true,
  colorScheme: 'scheme-nord',
  openGraphImage: undefined,
  postsPerPage: 5,
  postsView: 'list',
  scrollProgress: false,
  scrollToTop: true,
  defaultTagIcon: 'tabler--hash',
  tagIcons: {
    tailwindcss: 'tabler--brand-tailwind',
    astro: 'tabler--brand-astro',
    pagefind: 'tabler--file-search',
    webshare: 'tabler--world-share',
    小程序开发: 'tabler--brand-miniprogram',
    documentation: 'tabler--book',
    vue3: 'tabler--brand-vue',
    'ai agent': 'tabler--robot',
    'claude code': 'tabler--sparkles',
    codex: 'tabler--code',
    开发工具: 'tabler--tools',
    工程化: 'tabler--cpu'
  },
  expressiveCodeThemes: ['vitesse-light', 'vitesse-black']
})
