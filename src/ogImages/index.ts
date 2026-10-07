import extractColorScheme from '@/ogImages/extractColorScheme'
import post from '@/ogImages/post'
import site from '@/ogImages/site'
import config from '@/theme.config'
import fs from 'fs'
import satori, { type SatoriOptions } from 'satori'

const loadFont = async (weight: string) =>
  fs.readFileSync(
    `node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-${weight}-normal.woff`
  )

const satoriOptions: SatoriOptions = {
  width: 1200,
  height: 630,
  embedFont: true,
  fonts: [
    {
      name: 'IBM Plex Sans',
      data: await loadFont('400'),
      weight: 400,
      style: 'normal'
    },
    {
      name: 'IBM Plex Sans',
      data: await loadFont('600'),
      weight: 600,
      style: 'normal'
    },
    {
      name: 'IBM Plex Sans',
      data: await loadFont('700'),
      weight: 700,
      style: 'normal'
    }
  ]
}

const { mode, colorScheme } = config

const { accent, bg } = extractColorScheme(colorScheme)[mode]

const siteTemplate = site(accent, bg)
const postTemplate = post(accent, bg)

// 模板返回 satori 支持的 { type, props } 纯对象树；satori 的类型签名只声明了 ReactNode
type SatoriElement = Parameters<typeof satori>[0]

export default {
  site: (...args: Parameters<typeof siteTemplate>) =>
    satori(siteTemplate(...args) as unknown as SatoriElement, satoriOptions),
  post: (...args: Parameters<typeof postTemplate>) =>
    satori(postTemplate(...args) as unknown as SatoriElement, satoriOptions)
}
