import { report } from './stats'

// 小鹰的本地状态：被咬次数、咬痕记录、今日投喂、是否关回笼子。
// 只存在访客自己的浏览器里；存储不可用（隐私模式等）时退化为内存，不影响页面。

export type BiteKind = 'peck' | 'ear' | 'grumpy'

export interface BiteRecord {
  at: number
  kind: BiteKind
  path: string
}

const KEYS = {
  bites: 'xiaoying:bites',
  log: 'xiaoying:bite-log',
  caged: 'xiaoying:caged',
  feeds: 'xiaoying:feeds',
  pets: 'xiaoying:pets'
} as const

/** 每位访客每天最多投喂几颗瓜子 */
export const FEED_LIMIT = 6

export const BITE_EVENT = 'xiaoying:bite'
export const CAGE_EVENT = 'xiaoying:cage'

const memory = new Map<string, string>()

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

const write = (key: string, value: string) => {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    // 存储被禁用时只保留在内存中
  }
}

export const getBites = () => Number(read(KEYS.bites)) || 0

export const getBiteLog = (): BiteRecord[] => {
  try {
    const parsed = JSON.parse(read(KEYS.log) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const recordBite = (kind: BiteKind) => {
  const count = getBites() + 1
  const record: BiteRecord = {
    at: Date.now(),
    kind,
    path: window.location.pathname
  }
  write(KEYS.bites, String(count))
  write(KEYS.log, JSON.stringify([record, ...getBiteLog()].slice(0, 12)))
  window.dispatchEvent(
    new CustomEvent(BITE_EVENT, { detail: { count, record } })
  )
  report('bites')
  return count
}

export const clearBites = () => {
  write(KEYS.bites, '0')
  write(KEYS.log, '[]')
  window.dispatchEvent(new CustomEvent(BITE_EVENT, { detail: { count: 0 } }))
}

export const isCaged = () => read(KEYS.caged) === '1'

export const setCaged = (caged: boolean) => {
  write(KEYS.caged, caged ? '1' : '0')
  window.dispatchEvent(new CustomEvent(CAGE_EVENT, { detail: { caged } }))
}

const localDay = () => new Date().toLocaleDateString('en-CA')

/** 今天已经投喂的次数（按访客本地日期，跨天自动清零） */
export const getFeedsToday = () => {
  const [day, count] = (read(KEYS.feeds) ?? '').split(':')
  return day === localDay() ? Number(count) || 0 : 0
}

export const recordFeed = () => {
  const count = getFeedsToday() + 1
  write(KEYS.feeds, `${localDay()}:${count}`)
  report('feeds')
  return count
}

export const getPets = () => Number(read(KEYS.pets)) || 0

export const recordPet = () => {
  const count = getPets() + 1
  write(KEYS.pets, String(count))
  report('pets')
  return count
}
