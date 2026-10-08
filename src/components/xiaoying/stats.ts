// 全站共享计数的客户端：合并上报、乐观更新、页面隐藏时用 sendBeacon 补发。
// 接口不可用（本地 astro dev、未配置数据库）时静默停用，页面上的计数区域保持隐藏。

export type StatKind = 'bites' | 'feeds' | 'pets'
type Counts = Record<StatKind, number>

export interface Stats {
  date: string
  total: Counts
  today: Counts
}

export const STATS_EVENT = 'xiaoying:stats'

const ENDPOINT = '/api/xiaoying'
const FLUSH_DELAY = 2500
const KINDS: StatKind[] = ['bites', 'feeds', 'pets']

let stats: Stats | null = null
let disabled = false
let loading: Promise<Stats | null> | null = null
let flushTimer = 0
const pending: Counts = { bites: 0, feeds: 0, pets: 0 }

const isCounts = (value: unknown): value is Counts =>
  !!value &&
  typeof value === 'object' &&
  KINDS.every(
    (kind) => typeof (value as Record<string, unknown>)[kind] === 'number'
  )

const isStats = (value: unknown): value is Stats =>
  !!value &&
  typeof value === 'object' &&
  isCounts((value as Stats).total) &&
  isCounts((value as Stats).today)

const publish = () =>
  window.dispatchEvent(new CustomEvent(STATS_EVENT, { detail: stats }))

/** 接受服务端数据，并把尚未上报的本地增量叠加回去 */
const accept = (data: unknown) => {
  if (!isStats(data)) return
  for (const kind of KINDS) {
    data.total[kind] += pending[kind]
    data.today[kind] += pending[kind]
  }
  stats = data
  publish()
}

const handle = async (response: Response) => {
  if (response.status === 404 || response.status === 503) {
    disabled = true
    return
  }
  if (response.ok || response.status === 429) accept(await response.json())
}

export const getStats = () => stats

export const loadStats = async (force = false): Promise<Stats | null> => {
  if (disabled) return null
  if (stats && !force) return stats
  loading ??= fetch(ENDPOINT, { headers: { accept: 'application/json' } })
    .then(handle)
    .catch(() => undefined)
    .then(() => stats)
    .finally(() => {
      loading = null
    })
  return loading
}

const flush = (useBeacon = false) => {
  window.clearTimeout(flushTimer)
  if (disabled || KINDS.every((kind) => pending[kind] === 0)) return
  const body = JSON.stringify(pending)
  for (const kind of KINDS) pending[kind] = 0

  if (useBeacon && 'sendBeacon' in navigator) {
    navigator.sendBeacon(
      ENDPOINT,
      new Blob([body], { type: 'application/json' })
    )
    return
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  })
    .then(handle)
    .catch(() => undefined)
}

export const report = (kind: StatKind) => {
  if (disabled) return
  pending[kind]++
  if (stats) {
    stats.total[kind]++
    stats.today[kind]++
    publish()
  } else {
    void loadStats()
  }
  window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(flush, FLUSH_DELAY)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
}
