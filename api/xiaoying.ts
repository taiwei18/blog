// 小鹰的全站共享计数：被咬、投喂、挠头的累计与当天次数。
// 部署在 Vercel Functions（Node.js），存储使用 Marketplace 的 Upstash Redis，
// 通过 REST pipeline 直接调用，不引入额外依赖。未配置数据库时返回 503，前端会自动隐藏计数。
import { createHash } from 'node:crypto'

const KINDS = ['bites', 'feeds', 'pets'] as const
type Kind = (typeof KINDS)[number]
type Counts = Record<Kind, number>

// 单次上报的增量上限，以及每个访客每分钟的总增量上限
const MAX_DELTA = 20
const RATE_LIMIT_PER_MINUTE = 60
const DAY_TTL_SECONDS = 60 * 60 * 24 * 3

const redisUrl =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const redisToken =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

type Command = Array<string | number>

async function pipeline(commands: Command[]): Promise<unknown[]> {
  const response = await fetch(`${redisUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  })
  if (!response.ok) throw new Error(`Redis responded ${response.status}`)
  const replies = (await response.json()) as Array<{
    result?: unknown
    error?: string
  }>
  return replies.map((reply) => {
    if (reply.error) throw new Error(reply.error)
    return reply.result
  })
}

// 「今天」按北京时间计算
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
    new Date()
  )

const totalKey = (kind: Kind) => `xiaoying:total:${kind}`
const dayKey = (date: string, kind: Kind) => `xiaoying:day:${date}:${kind}`

const toCounts = (values: number[]) =>
  Object.fromEntries(KINDS.map((kind, i) => [kind, values[i] ?? 0])) as Counts

async function readStats() {
  const date = today()
  const [values] = await pipeline([
    ['MGET', ...KINDS.map(totalKey), ...KINDS.map((kind) => dayKey(date, kind))]
  ])
  const numbers = (values as Array<string | null>).map(
    (value) => Number(value) || 0
  )
  return {
    date,
    total: toCounts(numbers.slice(0, KINDS.length)),
    today: toCounts(numbers.slice(KINDS.length))
  }
}

const unavailable = () =>
  Response.json({ error: 'stats storage is not configured' }, { status: 503 })

const failed = (error: unknown) => {
  console.error('[xiaoying]', error)
  return Response.json({ error: 'stats storage failed' }, { status: 502 })
}

const visitorId = (request: Request) => {
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  // 只用于限流键，不存原始 IP
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

const toDelta = (value: unknown) =>
  Number.isInteger(value)
    ? Math.min(MAX_DELTA, Math.max(0, value as number))
    : 0

export async function GET() {
  if (!redisUrl || !redisToken) return unavailable()
  try {
    return Response.json(await readStats(), {
      headers: {
        'Cache-Control':
          'public, max-age=0, s-maxage=5, stale-while-revalidate=30'
      }
    })
  } catch (error) {
    return failed(error)
  }
}

export async function POST(request: Request) {
  if (!redisUrl || !redisToken) return unavailable()

  let body: Partial<Record<Kind, unknown>>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const deltas = KINDS.map((kind) => toDelta(body?.[kind]))
  const sum = deltas.reduce((acc, value) => acc + value, 0)

  try {
    if (sum > 0) {
      const bucket = `xiaoying:rl:${visitorId(request)}:${Math.floor(Date.now() / 60_000)}`
      const [used] = await pipeline([
        ['INCRBY', bucket, sum],
        ['EXPIRE', bucket, 90]
      ])
      if (Number(used) > RATE_LIMIT_PER_MINUTE) {
        return Response.json(await readStats(), {
          status: 429,
          headers: { 'Cache-Control': 'no-store' }
        })
      }

      const date = today()
      const commands: Command[] = []
      KINDS.forEach((kind, i) => {
        const delta = deltas[i]
        if (!delta) return
        commands.push(
          ['INCRBY', totalKey(kind), delta],
          ['INCRBY', dayKey(date, kind), delta],
          ['EXPIRE', dayKey(date, kind), DAY_TTL_SECONDS]
        )
      })
      await pipeline(commands)
    }

    return Response.json(await readStats(), {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    return failed(error)
  }
}
