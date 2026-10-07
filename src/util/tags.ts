import config from '@/theme.config'
import type { ResolvedTag } from '@/types'
import { getPosts } from '@/util/posts'

export const sortTags = (t1: ResolvedTag, t2: ResolvedTag) =>
  t1.tag.localeCompare(t2.tag)

export const resolveTags = (rawTags: string[]): ResolvedTag[] => {
  const defaultIcon = config.defaultTagIcon || 'tabler--hash'
  const resolvedTags = [...new Set(rawTags)].map((t) => {
    const tag = t.toLowerCase()

    return {
      tag,
      icon: config.tagIcons[tag] || defaultIcon
    }
  })

  resolvedTags.sort(sortTags)

  return resolvedTags
}

export const generateTags = async (): Promise<ResolvedTag[]> => {
  const allTags = (await getPosts()).flatMap((post) => post.data.tags)

  return resolveTags(allTags)
}

export const getTagUsage = async (tag: string): Promise<number> =>
  (await getPosts(tag)).length
