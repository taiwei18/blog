import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 用内存模拟 Upstash REST pipeline，只实现接口用到的 MGET / INCRBY / EXPIRE
const redis = new Map<string, number>()

const fakeUpstash = vi.fn(async (_url: string, init: RequestInit) => {
  const commands = JSON.parse(String(init.body)) as Array<
    Array<string | number>
  >
  const results = commands.map(([command, ...args]) => {
    if (command === 'MGET')
      return args.map((key) =>
        redis.has(String(key)) ? String(redis.get(String(key))) : null
      )
    if (command === 'INCRBY') {
      const key = String(args[0])
      const next = (redis.get(key) ?? 0) + Number(args[1])
      redis.set(key, next)
      return next
    }
    if (command === 'EXPIRE') return 1
    throw new Error(`unexpected command ${command}`)
  })
  return Response.json(results.map((result) => ({ result })))
})

const load = async () => {
  vi.resetModules()
  return import('../../../api/xiaoying')
}

const post = (body: unknown, ip = '1.2.3.4') =>
  new Request('https://example.com/api/xiaoying', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(body)
  })

describe('api/xiaoying', () => {
  beforeEach(() => {
    redis.clear()
    fakeUpstash.mockClear()
    vi.stubGlobal('fetch', fakeUpstash)
    vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com')
    vi.stubEnv('KV_REST_API_TOKEN', 'token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('未配置数据库时返回 503', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    const { GET } = await load()
    expect((await GET()).status).toBe(503)
  })

  it('累加计数并同时返回当天与累计', async () => {
    const { GET, POST } = await load()
    await POST(post({ bites: 3, feeds: 1 }))
    const response = await POST(post({ bites: 2, pets: 4 }))
    const stats = await response.json()

    expect(stats.total).toEqual({ bites: 5, feeds: 1, pets: 4 })
    expect(stats.today).toEqual({ bites: 5, feeds: 1, pets: 4 })
    expect((await (await GET()).json()).total.bites).toBe(5)
  })

  it('单次增量被截断，非法值忽略', async () => {
    const { POST } = await load()
    const stats = await (
      await POST(post({ bites: 999, feeds: -3, pets: 1.5 }))
    ).json()
    expect(stats.total).toEqual({ bites: 20, feeds: 0, pets: 0 })
  })

  it('同一访客每分钟超过上限后不再计数', async () => {
    const { POST } = await load()
    for (let i = 0; i < 3; i++) await POST(post({ bites: 20 }))
    const blocked = await POST(post({ bites: 20 }))

    expect(blocked.status).toBe(429)
    expect((await blocked.json()).total.bites).toBe(60)
    // 换一个访客不受影响
    const other = await (await POST(post({ bites: 1 }, '5.6.7.8'))).json()
    expect(other.total.bites).toBe(61)
  })

  it('请求体不是 JSON 时返回 400', async () => {
    const { POST } = await load()
    const response = await POST(
      new Request('https://example.com/api/xiaoying', {
        method: 'POST',
        body: 'nope'
      })
    )
    expect(response.status).toBe(400)
  })
})
