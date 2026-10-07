<h1 align="center">
  <a href="https://www.taiwei.site">TaiWei</a>
</h1>

<p align="center">
  TaiWei 的前端与产品工程笔记
</p>

<p align="center">
  <a href="https://www.taiwei.site">在线访问</a> |
  <a href="#技术栈">技术栈</a> |
  <a href="#本地开发">本地开发</a> |
  <a href="#写作">写作</a> |
  <a href="#部署">部署</a> |
  <a href="#致谢">致谢</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/taiwei18/blog?label=License"/>
  &ensp;
  <img src="https://img.shields.io/github/package-json/dependency-version/taiwei18/blog/astro?label=Astro"/>
</p>

## 技术栈

- **Astro 5** + MDX：静态生成，`ClientRouter` 提供页面间的视图过渡
- **Tailwind CSS 4**：配色方案集中在 `src/style/color-schemes.css`
- **GSAP**：页面入场、悬浮导航、抽屉菜单等动效，统一在 `src/components/Motion.astro` 中管理，并遵循系统的「减少动态效果」设置
- **Pagefind**：构建后生成的全站静态搜索
- **Expressive Code**：代码块高亮、折叠与行号
- **Satori**：自动生成 Open Graph 分享图

## 本地开发

需要 Node.js 20+ 和 [pnpm](https://pnpm.io/installation)。

```bash
pnpm install
pnpm dev        # 开发服务器 http://localhost:4321
pnpm build      # 构建到 dist/，并生成 Pagefind 索引
pnpm preview    # 构建并预览生产版本
pnpm check      # ESLint + Stylelint + astro check
pnpm test       # Vitest 单元测试
```

> 开发模式下样式由 JS 注入，首屏可能出现短暂闪烁；动效与性能请以 `pnpm preview` 的生产构建为准。

## 写作

- 站点标题、作者、导航、配色等在 `src/theme.config.ts` 中配置。
- 文章放在 `content/posts/` 下，使用 Markdown 或 MDX，frontmatter 由 `src/content.config.ts` 中的 Zod 模式校验，可参考已有文章。
- 关于页、时间线等独立页面位于 `src/pages/`。

## 项目结构

```
├── content/              # 内容集合（Markdown/MDX）
│   └── posts/            # 博客文章
├── public/               # 静态资源（原样复制）
├── src/
│   ├── components/       # 可复用的 Astro 组件
│   │   ├── layout/       # 页眉、页脚、导航
│   │   ├── mode/         # 明暗模式切换
│   │   └── posts/        # 文章列表/网格组件
│   ├── layouts/          # 页面布局模板
│   ├── ogImages/         # OG 图片生成逻辑
│   ├── pages/            # 基于文件的路由
│   ├── plugins/          # 阅读进度、回到顶部、锚点等插件
│   ├── style/            # 全局 CSS 和配色方案
│   ├── util/             # 辅助函数
│   ├── content.config.ts # 集合模式定义（Zod）
│   ├── theme.config.ts   # 站点配置
│   └── types.ts          # TypeScript 类型定义
└── astro.config.ts
```

约定：组件使用带类型化 `Props` 的 `.astro` 文件；导入使用 `@/` 别名指向 `src/`；图标遵循 `tabler--{图标名称}` 命名。

## 部署

站点通过 [Vercel](https://vercel.com) 部署：推送到 `main` 分支自动发布生产环境，其他分支生成预览部署。日常开发在 `dev` 分支进行，验证后合并到 `main`。

## 致谢

本站基于 [FjellOverflow](https://github.com/FjellOverflow) 的 [Nordlys](https://github.com/FjellOverflow/nordlys) 主题开发，并在此基础上对视觉设计、导航与动效做了大量改动。感谢原作者的开源工作。

## 许可证

与上游主题一致，以 [GPL-3.0](./LICENSE.md) 许可证发布。
