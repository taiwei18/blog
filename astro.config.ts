import { defineConfig } from 'astro/config'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'
import tailwindcss from '@tailwindcss/vite'
import expressiveCode from 'astro-expressive-code'
import sectionizePlugin from 'remark-sectionize'
import readingTimePlugin from './src/plugins/readingTimePlugin'
import config from './src/theme.config'

import react from '@astrojs/react'

const postsDirectory = fileURLToPath(
  new URL('./content/posts', import.meta.url)
)

const collectPostLastModifiedDates = (
  directory = postsDirectory
): Map<string, Date> => {
  const dates = new Map<string, Date>()

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      for (const [slug, date] of collectPostLastModifiedDates(entryPath)) {
        dates.set(slug, date)
      }
      continue
    }

    if (!['.md', '.mdx'].includes(extname(entry.name))) continue

    const source = readFileSync(entryPath, 'utf8')
    const frontmatter = source.match(/^---\s*([\s\S]*?)\s*---/)?.[1] ?? ''
    const updatedDate = frontmatter.match(/^updatedDate:\s*(.+)$/m)?.[1]
    const publishedDate = frontmatter.match(/^publishedDate:\s*(.+)$/m)?.[1]
    const rawDate = (updatedDate || publishedDate)
      ?.replace('!!timestamp', '')
      .trim()

    if (!rawDate) continue

    const slug = relative(postsDirectory, entryPath)
      .replace(/\\/g, '/')
      .replace(/\.(md|mdx)$/i, '')
    dates.set(`/posts/${slug}/`, new Date(rawDate))
  }

  return dates
}

const postLastModifiedDates = collectPostLastModifiedDates()

export default defineConfig({
  site: config.site,
  integrations: [
    expressiveCode({
      themes: config.expressiveCodeThemes,
      themeCssSelector: (theme) => `[data-mode='${theme.type}']`,
      defaultProps: {
        wrap: true,
        collapseStyle: 'collapsible-end',
        showLineNumbers: false
      },
      plugins: [pluginCollapsibleSections(), pluginLineNumbers()]
    }),
    mdx(),
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname
        return pathname !== '/search/' && pathname !== '/404.html'
      },
      serialize: (item) => {
        const pathname = decodeURIComponent(new URL(item.url).pathname)
        const lastmod = postLastModifiedDates.get(pathname)
        return lastmod ? { ...item, lastmod: lastmod.toISOString() } : item
      }
    }),
    react()
  ],

  markdown: {
    remarkPlugins: [readingTimePlugin, sectionizePlugin]
  },

  vite: {
    plugins: [tailwindcss()]
  }
})
