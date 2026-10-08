import { gsap } from 'gsap'
import { getStats } from './stats'
import {
  CAGE_EVENT,
  FEED_LIMIT,
  getFeedsToday,
  isCaged,
  recordBite,
  recordFeed,
  recordPet,
  type BiteKind
} from './store'

// SVG 坐标系（viewBox 0 0 80 80）中的关键锚点
const VIEW = 80
const FEET = '40 67'
const NECK = '36 36'
const EYE = { x: 29.5, y: 24.5 }
const TAIL = { x: 57, y: 59 }
const HEAD = { x: 34, y: 25 }
const BEAK = { x: 18, y: 30 }

const SLEEP_AFTER = 45_000
const SLEEP_AFTER_DARK = 12_000
const HOVER_BITE_DELAY = 900
// 挠头判定：在头上以低于 PET_MAX_SPEED（px/ms）慢慢划过 PET_STROKE（px）开始享受；
// 超过 ROUGH_SPEED 算乱摸，介于两者之间的移动不计
const PET_STROKE = 80
const PET_MAX_SPEED = 0.9
const ROUGH_SPEED = 1.6
const LONG_PRESS = 450

const SEED_SVG = `<svg viewBox="0 0 14 9" width="14" height="9"><path d="M1 5 C2 1.5 8 0.5 13 4.5 C8 8.4 2 8.2 1 5 Z" fill="#3f3b38" stroke="#2a2725" stroke-width=".5"/><path d="M3 4.6 C6 3.6 9 3.8 11.5 4.6 M3.4 6 C6 5.6 8.6 5.8 10.6 5.6" stroke="#e9e4da" stroke-width=".55" fill="none"/></svg>`
const HUSK_SVG = `<svg viewBox="0 0 8 6" width="8" height="6"><path d="M1 3.4 C2 1 5 0.6 7 2.6 C5 4.6 2.2 5 1 3.4 Z" fill="#4a4542" stroke="#e9e4da" stroke-width=".4"/></svg>`

const LINES = {
  peck: [
    '咬！',
    '啊呜——',
    '嘎！',
    '就咬一口',
    '手拿开',
    '嘎嘎嘎',
    '再摸咬你耳朵'
  ],
  grumpy: ['别吵！', '嘎？！谁', '起床气，咬', '刚睡着……'],
  ear: ['咬耳朵！', '耳朵是我的', '啊呜，耳朵'],
  chirp: ['叽！', '啾？', '嘎', '叽叽喳喳', '在写什么'],
  pet: ['再挠挠', '左边一点', '舒服——', '咕噜咕噜', '别停'],
  stillHand: ['怎么不挠了', '手停了？咬'],
  rough: ['别乱摸！', '手很重欸', '嘎！轻点'],
  feed: ['瓜子！', '嗑嗑嗑', '好吃', '还要还要'],
  full: ['吃饱了，不吃', '今天够了', '撑……'],
  route: {
    '/nest/': '欢迎来我的窝',
    '/about/': '他？天天被我咬',
    '/search/': '找啥？我帮你啄',
    '/posts/': '又在写字'
  } as Record<string, string>
}

const pick = <T>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)]
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

type Mood = 'idle' | 'sleep'
type Point = { x: number; y: number }

let mounted = false

export function mountXiaoying(root: HTMLElement) {
  if (mounted) return
  mounted = true

  const $ = <T extends Element>(selector: string) =>
    root.querySelector(selector) as T
  const svg = $<SVGSVGElement>('.xy-svg')
  const bird = $<SVGGElement>('.xy-bird')
  const head = $<SVGGElement>('.xy-head')
  const eye = $<SVGGElement>('.xy-eye')
  const pupil = $<SVGGElement>('.xy-pupil')
  const lid = $<SVGPathElement>('.xy-lid')
  const wing = $<SVGGElement>('.xy-wing')
  const tail = $<SVGGElement>('.xy-tail')
  const body = $<SVGGElement>('.xy-body')
  const beakLower = $<SVGPathElement>('.xy-beak-lower')
  const paper = $<SVGGElement>('.xy-paper')
  const hit = $<HTMLButtonElement>('.xy-hit')
  const bubble = $<HTMLElement>('.xy-bubble')

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  const moving = () => !reduced.matches
  const isDark = () => document.documentElement.dataset.mode === 'dark'

  let mood: Mood = 'idle'
  let busy = false
  let facing = 1 // 1 朝左（默认看向正文），-1 朝右
  let fluffed = false
  let pointer: Point | null = null
  let lastActivity = performance.now()
  let clicks = 0
  let trackFrame = 0
  let bubbleTimer = 0
  let hoverTimer = 0
  let zTimer = 0
  let breathing: gsap.core.Tween | null = null
  let petting = false
  let petStroke = 0
  let petEndTimer = 0
  let petNotesTimer = 0
  let petBubbleAt = 0
  let petLoop: gsap.core.Tween | null = null
  let rough = 0
  let roughTimer = 0
  let lastMove: (Point & { t: number }) | null = null
  let idleAction: gsap.core.Animation | null = null

  /** 访客一有动作就打断正在播放的闲置小动作，直接跳到结束姿态 */
  const interruptIdle = () => {
    const action = idleAction
    if (!action) return
    idleAction = null
    action.progress(1)
    busy = false
  }

  // ---------- 基础工具 ----------

  const frame = () => {
    const rect = svg.getBoundingClientRect()
    return { rect, scale: rect.width / VIEW }
  }

  /** SVG 内的点换算到视口坐标（考虑朝向翻转） */
  const toClient = (point: Point): Point => {
    const { rect, scale } = frame()
    const x = facing === 1 ? point.x : VIEW - point.x
    return { x: rect.left + x * scale, y: rect.top + point.y * scale }
  }

  const spawn = (className: string, html = '') => {
    const element = document.createElement('div')
    element.className = `xy-fx ${className}`
    element.setAttribute('aria-hidden', 'true')
    element.innerHTML = html
    document.body.append(element)
    return element
  }

  const say = (text: string, duration = 1800) => {
    window.clearTimeout(bubbleTimer)
    bubble.textContent = text
    gsap.killTweensOf(bubble)
    gsap.fromTo(
      bubble,
      { autoAlpha: 0, scale: moving() ? 0.9 : 1 },
      {
        autoAlpha: 1,
        scale: 1,
        transformOrigin: '80% 100%',
        duration: 0.22,
        ease: 'back.out(2.5)'
      }
    )
    bubbleTimer = window.setTimeout(() => {
      gsap.to(bubble, { autoAlpha: 0, duration: 0.25 })
    }, duration)
  }

  const turn = (next: number) => {
    if (next === facing) return
    facing = next
    gsap.to(bird, {
      scaleX: facing,
      svgOrigin: FEET,
      duration: moving() ? 0.32 : 0,
      ease: 'back.out(2.2)'
    })
  }

  const openBeak = (open: boolean, duration = 0.06) =>
    gsap.to(beakLower, {
      rotation: open ? -24 : 0,
      svgOrigin: '25.4 30.6',
      duration
    })

  // ---------- 粒子：咬痕、羽毛、zzz ----------

  const biteMark = (at: Point) => {
    const mark = spawn(
      'xy-bite',
      `<svg width="26" height="18" viewBox="0 0 26 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <path d="M3 4 C6 9 9 10 12 9"/><path d="M14 9 C17 10 20 9 23 4"/>
        <path d="M6 14 C9 12 17 12 20 14" stroke-width="1.2" opacity=".55"/></svg>`
    )
    mark.style.color = 'var(--text-title)'
    gsap.set(mark, { x: at.x - 13, y: at.y - 9 })
    gsap
      .timeline({ onComplete: () => mark.remove() })
      .fromTo(
        mark,
        { scale: 0.4, autoAlpha: 0, rotation: rand(-12, 12) },
        { scale: 1, autoAlpha: 1, duration: 0.18, ease: 'back.out(3)' }
      )
      .to(mark, { x: '+=2', duration: 0.04, repeat: 3, yoyo: true }, '<0.05')
      .to(mark, { autoAlpha: 0, y: '+=6', duration: 0.5 }, '+=0.6')
  }

  const feather = (from: Point) => {
    if (!moving()) return
    const fx = spawn(
      'xy-feather',
      `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 12 C3 6 7 2 12 2 C11 7 7 11 2 12 Z" fill="#fcfbf7" stroke="#9a9aa0" stroke-width=".7"/><path d="M2 12 L9 5" stroke="#c9c9cd" stroke-width=".6"/></svg>`
    )
    const drift = rand(-40, 40)
    gsap.set(fx, { x: from.x, y: from.y, rotation: rand(0, 360) })
    gsap
      .timeline({ onComplete: () => fx.remove() })
      .to(fx, { y: from.y + rand(60, 110), duration: 1.6, ease: 'sine.in' }, 0)
      .to(
        fx,
        {
          x: from.x + drift,
          duration: 0.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: 3
        },
        0
      )
      .to(fx, { rotation: `+=${rand(120, 260)}`, duration: 1.6 }, 0)
      .to(fx, { autoAlpha: 0, duration: 0.4 }, 1.2)
  }

  const snore = () => {
    if (document.hidden) return
    const start = toClient({ x: 30, y: 12 })
    const z = spawn('xy-z')
    z.textContent = pick(['z', 'Z', 'z'])
    gsap.set(z, { x: start.x, y: start.y })
    gsap
      .timeline({ onComplete: () => z.remove() })
      .fromTo(
        z,
        { autoAlpha: 0, scale: 0.6 },
        {
          autoAlpha: 1,
          scale: 1.1,
          x: start.x - rand(10, 22),
          y: start.y - rand(18, 30),
          duration: 1.4,
          ease: 'sine.out'
        }
      )
      .to(z, { autoAlpha: 0, duration: 0.5 }, '-=0.5')
  }

  // ---------- 睡觉 / 醒来 ----------

  const sleep = () => {
    if (mood === 'sleep' || busy) return
    mood = 'sleep'
    root.dataset.mood = 'sleep'
    const duration = moving() ? 0.8 : 0
    gsap.to(pupil, { x: 0, y: 0, duration: 0.2 })
    gsap.to(eye, { autoAlpha: 0, duration: 0.25 })
    gsap.to(lid, { opacity: 1, duration: 0.25 })
    gsap.to(head, {
      rotation: -10,
      y: 1.6,
      svgOrigin: NECK,
      duration,
      ease: 'sine.inOut'
    })
    if (moving()) {
      breathing = gsap.to([body, wing], {
        scale: 1.035,
        svgOrigin: '42 58',
        duration: 1.7,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1
      })
      zTimer = window.setInterval(snore, 2200)
    }
  }

  const wake = (line?: string) => {
    lastActivity = performance.now()
    if (mood !== 'sleep') return
    mood = 'idle'
    root.dataset.mood = 'idle'
    window.clearInterval(zTimer)
    breathing?.kill()
    breathing = null
    gsap.to([body, wing], { scale: 1, svgOrigin: '42 58', duration: 0.3 })
    gsap.to(eye, { autoAlpha: 1, duration: 0.15 })
    gsap.to(lid, { opacity: 0, duration: 0.15 })
    gsap.to(head, {
      rotation: 0,
      y: 0,
      svgOrigin: NECK,
      duration: 0.35,
      ease: 'back.out(2)'
    })
    if (line) say(line)
  }

  // ---------- 咬 ----------

  const peck = (target: Point) => {
    const lean = facing
    return gsap
      .timeline()
      .to(bird, {
        rotation: 7 * lean,
        svgOrigin: FEET,
        duration: 0.14,
        ease: 'power2.out'
      })
      .add(openBeak(true, 0.1), '<')
      .to(bird, {
        rotation: -16 * lean,
        svgOrigin: FEET,
        duration: 0.09,
        ease: 'power4.in'
      })
      .add(() => {
        openBeak(false, 0.05)
        biteMark(target)
        feather(toClient({ x: 40, y: 40 }))
      })
      .to(bird, {
        rotation: 0,
        svgOrigin: FEET,
        duration: 0.6,
        ease: 'elastic.out(1.1, 0.45)'
      })
  }

  /** 飞到目标点（喙对准目标），执行 onArrive 加入的动作，再飞回栖木 */
  const flight = (
    target: Point,
    onArrive: (timeline: gsap.core.Timeline) => void
  ) => {
    const { rect, scale } = frame()
    turn(target.x > rect.left + rect.width / 2 ? -1 : 1)
    const beakAt = toClient(BEAK)
    const dx = clamp(target.x - beakAt.x, -window.innerWidth, window.innerWidth)
    const dy = clamp(target.y - beakAt.y, -window.innerHeight, 40)
    const flap = gsap.to(wing, {
      rotation: -38,
      svgOrigin: '43 34',
      duration: 0.07,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut'
    })

    const timeline = gsap
      .timeline({ onComplete: () => void flap.kill() })
      .to(bird, { x: dx / scale, duration: 0.6, ease: 'power2.inOut' }, 0)
      // 气泡跟着一起飞
      .to(bubble, { x: dx, y: dy, duration: 0.6, ease: 'power2.inOut' }, 0)
      .to(bird, { y: dy / scale - 14, duration: 0.32, ease: 'power2.out' }, 0)
      .to(bird, { y: dy / scale, duration: 0.28, ease: 'power2.in' }, 0.32)
      .add(() => {
        flap.pause()
        gsap.to(wing, { rotation: 0, svgOrigin: '43 34', duration: 0.1 })
      })

    onArrive(timeline)

    return timeline
      .add(() => void flap.resume())
      .to(bird, { x: 0, duration: 0.7, ease: 'power2.inOut' }, '+=0.15')
      .to(bubble, { x: 0, y: 0, duration: 0.7, ease: 'power2.inOut' }, '<')
      .to(bird, { y: -10, duration: 0.35, ease: 'power2.out' }, '<')
      .to(bird, { y: 0, duration: 0.35, ease: 'power2.in' }, '>')
      .add(() => {
        flap.kill()
        gsap.to(wing, { rotation: 0, svgOrigin: '43 34', duration: 0.12 })
        turn(1)
      })
      .fromTo(
        bird,
        { scaleY: 0.9 },
        {
          scaleY: 1,
          svgOrigin: FEET,
          duration: 0.4,
          ease: 'elastic.out(1, 0.4)'
        }
      )
  }

  /** 咬耳朵：飞到光标处连啄几口，再飞回栖木 */
  const earNibble = (target: Point) =>
    flight(target, (timeline) =>
      timeline
        .to(bird, {
          rotation: -12 * facing,
          svgOrigin: FEET,
          duration: 0.07,
          yoyo: true,
          repeat: 5,
          onRepeat: () =>
            biteMark({ x: target.x + rand(-6, 6), y: target.y + rand(-4, 4) })
        })
        .add(() => feather(target))
    )

  const bite = (kind: BiteKind, at?: Point, custom?: string) => {
    interruptIdle()
    if (busy) return
    if (!finePointer.matches) navigator.vibrate?.(18)
    busy = true
    window.clearTimeout(hoverTimer)
    lastActivity = performance.now()
    const count = recordBite(kind)
    const { rect } = frame()
    const target = at ??
      pointer ?? {
        x: rect.left + rect.width * 0.3,
        y: rect.top + rect.height * 0.35
      }

    const global = getStats()
    const line =
      custom ??
      (count % 10 === 0
        ? `你已经被咬 ${count} 口了`
        : global && Math.random() < 0.25
          ? `全站今天第 ${global.today.bites} 口`
          : pick(LINES[kind]))
    say(line)

    if (!moving()) {
      biteMark(target)
      busy = false
      return
    }

    const motion = kind === 'ear' ? earNibble(target) : peck(target)
    motion.eventCallback('onComplete', () => {
      busy = false
    })
  }

  // ---------- 挠头 ----------

  const overHead = (point: Point) => {
    const center = toClient(HEAD)
    return (
      Math.hypot(point.x - center.x, point.y - center.y) < 15 * frame().scale
    )
  }

  const note = () => {
    const start = toClient({ x: 36, y: 12 })
    const fx = spawn('xy-z')
    fx.textContent = pick(['♪', '♫', '~'])
    gsap.set(fx, { x: start.x, y: start.y })
    gsap
      .timeline({ onComplete: () => fx.remove() })
      .fromTo(
        fx,
        { autoAlpha: 0, scale: 0.6 },
        {
          autoAlpha: 1,
          scale: 1,
          x: start.x + rand(-16, 16),
          y: start.y - rand(16, 26),
          duration: 1.1,
          ease: 'sine.out'
        }
      )
      .to(fx, { autoAlpha: 0, duration: 0.4 }, '-=0.4')
  }

  const startPet = () => {
    interruptIdle()
    if (petting || busy) return
    wake()
    petting = true
    petStroke = 0
    lastActivity = performance.now()
    window.clearTimeout(hoverTimer)
    recordPet()
    const global = getStats()
    say(
      global && Math.random() < 0.3
        ? `今天被挠了 ${global.today.pets} 次`
        : pick(LINES.pet),
      1600
    )
    petBubbleAt = performance.now()
    if (!moving()) return
    gsap.to(pupil, { x: 0, y: 0, duration: 0.15 })
    gsap.to(eye, { autoAlpha: 0, duration: 0.15 })
    gsap.to(lid, { opacity: 1, duration: 0.15 })
    gsap.to([body, wing], {
      scale: 1.08,
      svgOrigin: '42 50',
      duration: 0.35,
      ease: 'back.out(2)'
    })
    // 低头蹭手指
    gsap.killTweensOf(head)
    petLoop = gsap.to(head, {
      rotation: -20,
      y: 1.4,
      svgOrigin: NECK,
      duration: 0.5,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    })
    petNotesTimer = window.setInterval(note, 900)
  }

  const stopPet = (gentle: boolean) => {
    if (!petting) return
    petting = false
    window.clearTimeout(petEndTimer)
    window.clearInterval(petNotesTimer)
    petLoop?.kill()
    petLoop = null
    fluffed = false
    gsap.to(eye, { autoAlpha: 1, duration: 0.15 })
    gsap.to(lid, { opacity: 0, duration: 0.15 })
    gsap.to(head, { rotation: 0, y: 0, svgOrigin: NECK, duration: 0.35 })
    gsap.to([body, wing], { scale: 1, svgOrigin: '42 50', duration: 0.3 })
    // 挠一半停手不走，它会不耐烦地咬一口
    if (gentle && hit.matches(':hover')) {
      hoverTimer = window.setTimeout(() => {
        if (mood === 'idle' && !petting)
          bite('peck', undefined, pick(LINES.stillHand))
      }, 1800)
    }
  }

  const keepPetting = () => {
    lastActivity = performance.now()
    window.clearTimeout(hoverTimer)
    window.clearTimeout(petEndTimer)
    petEndTimer = window.setTimeout(() => stopPet(true), 650)
    if (performance.now() - petBubbleAt > 3500) {
      petBubbleAt = performance.now()
      say(pick(LINES.pet), 1600)
    }
  }

  /** 鼠标在头上移动：慢划算挠头，快速乱晃算骚扰 */
  const sensePet = (point: Point) => {
    const now = performance.now()
    const previous = lastMove
    lastMove = { ...point, t: now }
    if (!previous || !overHead(point)) {
      if (!petting) petStroke = 0
      return
    }
    interruptIdle()
    if (busy) return
    const dt = now - previous.t
    if (dt <= 0 || dt > 120) return
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    const speed = distance / dt

    if (speed > ROUGH_SPEED) {
      rough++
      window.clearTimeout(roughTimer)
      roughTimer = window.setTimeout(() => (rough = 0), 600)
      if (rough >= 4) {
        rough = 0
        stopPet(false)
        bite('peck', point, pick(LINES.rough))
      }
      return
    }
    if (speed < 0.03 || speed > PET_MAX_SPEED) return
    petStroke += distance
    if (!petting && petStroke > PET_STROKE) startPet()
    if (petting) keepPetting()
  }

  // ---------- 投喂 ----------

  const dish = $<HTMLButtonElement>('.xy-dish')

  const refreshDish = () => {
    const left = FEED_LIMIT - getFeedsToday()
    root.toggleAttribute('data-full', left <= 0)
    dish.title =
      left > 0
        ? `拖一颗瓜子喂小鹰（今天还剩 ${left} 颗）`
        : '今天的瓜子吃完了，明天再来'
  }

  const dropSeed = (seed: HTMLElement) =>
    gsap.to(seed, {
      y: '+=120',
      rotation: rand(120, 260),
      autoAlpha: 0,
      duration: 0.8,
      ease: 'power2.in',
      onComplete: () => seed.remove()
    })

  const husks = (at: Point) => {
    for (const side of [-1, 1]) {
      const fx = spawn('xy-husk', HUSK_SVG)
      gsap.set(fx, { x: at.x, y: at.y, rotation: rand(0, 360) })
      gsap.to(fx, {
        x: at.x + side * rand(8, 22),
        y: at.y + rand(50, 90),
        rotation: `+=${side * rand(180, 360)}`,
        autoAlpha: 0,
        duration: 1.1,
        ease: 'power1.in',
        onComplete: () => fx.remove()
      })
    }
  }

  /** 嗑瓜子：喙连开三次，瓜子变小消失，掉下两片壳 */
  const chew = (seed: HTMLElement, mouth: Point) => {
    const timeline = gsap.timeline()
    for (let i = 0; i < 3; i++) {
      timeline.add(openBeak(true, 0.06)).add(openBeak(false, 0.08), '+=0.08')
    }
    return timeline
      .to(seed, { scale: 0.3, autoAlpha: 0, duration: 0.5 }, 0)
      .add(() => {
        seed.remove()
        husks(mouth)
      }, 0.4)
  }

  const refuseFood = () => {
    say(pick(LINES.full))
    if (!moving() || busy) return
    turn(-1)
    window.setTimeout(() => turn(1), 900)
  }

  const feed = (at: Point, dragged?: HTMLElement) => {
    if (getFeedsToday() >= FEED_LIMIT) {
      if (dragged) dropSeed(dragged)
      refuseFood()
      return
    }
    interruptIdle()
    if (busy || petting) {
      if (dragged) dropSeed(dragged)
      if (busy) say('等我嗑完', 1200)
      return
    }
    wake()
    busy = true
    lastActivity = performance.now()
    const count = recordFeed()
    refreshDish()
    const global = getStats()
    say(
      count === FEED_LIMIT
        ? '最后一颗，吃饱了'
        : global && Math.random() < 0.3
          ? `今天全站喂了我 ${global.today.feeds} 颗`
          : pick(LINES.feed)
    )

    const seed = dragged ?? spawn('xy-seed', SEED_SVG)
    gsap.set(seed, { x: at.x - 7, y: at.y - 4.5 })

    if (!moving()) {
      seed.remove()
      busy = false
      return
    }

    const done = () => {
      busy = false
    }
    const beakAt = toClient(BEAK)
    if (Math.hypot(at.x - beakAt.x, at.y - beakAt.y) < 70) {
      // 就在嘴边：瓜子凑过来直接嗑
      gsap
        .timeline({ onComplete: done })
        .to(seed, {
          x: beakAt.x - 7,
          y: beakAt.y - 4.5,
          duration: 0.25,
          ease: 'power2.out'
        })
        .add(chew(seed, beakAt))
    } else {
      // 扔得远：飞过去在半空接住
      flight(at, (timeline) => void timeline.add(chew(seed, at))).eventCallback(
        'onComplete',
        done
      )
    }
  }

  let dragFrom: Point | null = null
  let dragSeed: HTMLElement | null = null
  let dragged = false

  dish.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    dish.setPointerCapture(event.pointerId)
    dragFrom = { x: event.clientX, y: event.clientY }
    dragged = false
  })

  dish.addEventListener('pointermove', (event) => {
    if (!dragFrom) return
    const point = { x: event.clientX, y: event.clientY }
    if (!dragged) {
      if (Math.hypot(point.x - dragFrom.x, point.y - dragFrom.y) < 6) return
      dragged = true
      if (getFeedsToday() >= FEED_LIMIT) {
        dragFrom = null
        refuseFood()
        return
      }
      wake()
      dragSeed = spawn('xy-seed', SEED_SVG)
    }
    if (dragSeed) gsap.set(dragSeed, { x: point.x - 7, y: point.y - 4.5 })
  })

  dish.addEventListener('pointerup', (event) => {
    dragFrom = null
    if (!dragSeed) return
    const seed = dragSeed
    dragSeed = null
    feed({ x: event.clientX, y: event.clientY }, seed)
  })

  dish.addEventListener('pointercancel', () => {
    dragFrom = null
    if (dragSeed) dropSeed(dragSeed)
    dragSeed = null
  })

  // 单击或键盘回车：从食盆里取一颗
  dish.addEventListener('click', () => {
    if (dragged) {
      dragged = false
      return
    }
    const rect = dish.getBoundingClientRect()
    feed({ x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.3 })
  })

  refreshDish()

  // ---------- 闲置小动作 ----------

  const idleActions: Array<() => gsap.core.Timeline | gsap.core.Tween> = [
    // 歪头
    () =>
      gsap
        .timeline()
        .to(head, {
          rotation: pick([-14, 12]),
          svgOrigin: NECK,
          duration: 0.25,
          ease: 'back.out(2)'
        })
        .to(
          head,
          { rotation: 0, svgOrigin: NECK, duration: 0.4, ease: 'power2.inOut' },
          '+=0.9'
        ),
    // 原地蹦一下
    () =>
      gsap
        .timeline()
        .to(bird, { scaleY: 0.9, svgOrigin: FEET, duration: 0.1 })
        .to(bird, {
          y: -7,
          scaleY: 1.04,
          svgOrigin: FEET,
          duration: 0.18,
          ease: 'power2.out'
        })
        .to(bird, {
          y: 0,
          scaleY: 1,
          svgOrigin: FEET,
          duration: 0.2,
          ease: 'power2.in'
        })
        .to(bird, {
          scaleY: 0.94,
          svgOrigin: FEET,
          duration: 0.06,
          yoyo: true,
          repeat: 1
        }),
    // 抖毛
    () =>
      gsap
        .timeline()
        .to([body, wing], { scale: 1.08, svgOrigin: '42 50', duration: 0.12 })
        .to(bird, {
          rotation: 3,
          svgOrigin: FEET,
          duration: 0.045,
          yoyo: true,
          repeat: 7
        })
        .to([body, wing], {
          scale: 1,
          svgOrigin: '42 50',
          duration: 0.3,
          ease: 'power2.out'
        }),
    // 伸翅膀
    () =>
      gsap
        .timeline()
        .to(wing, {
          rotation: -28,
          svgOrigin: '43 34',
          duration: 0.3,
          ease: 'power2.out'
        })
        .to(
          wing,
          {
            rotation: 0,
            svgOrigin: '43 34',
            duration: 0.35,
            ease: 'back.out(2)'
          },
          '+=0.5'
        ),
    // 摇尾巴
    () =>
      gsap.to(tail, {
        rotation: 9,
        svgOrigin: '47 59',
        duration: 0.08,
        yoyo: true,
        repeat: 5,
        ease: 'sine.inOut'
      }),
    // 点头（牡丹鹦鹉兴奋时的招牌动作）
    () =>
      gsap.to(head, {
        y: 1.8,
        svgOrigin: NECK,
        duration: 0.1,
        yoyo: true,
        repeat: 7,
        ease: 'sine.inOut'
      }),
    // 叫一声
    () => {
      say(pick(LINES.chirp), 1300)
      return gsap
        .timeline()
        .add(openBeak(true, 0.06))
        .add(openBeak(false, 0.08), '+=0.12')
        .add(openBeak(true, 0.06), '+=0.05')
        .add(openBeak(false, 0.08), '+=0.1')
    }
  ]

  const scheduleIdle = () => {
    window.setTimeout(
      () => {
        if (
          mood === 'idle' &&
          !busy &&
          !petting &&
          moving() &&
          !document.hidden
        ) {
          busy = true
          const action = pick(idleActions)()
          idleAction = action
          action.eventCallback('onComplete', () => {
            if (idleAction === action) idleAction = null
            busy = false
          })
        }
        scheduleIdle()
      },
      rand(4500, 9500)
    )
  }

  const scheduleBlink = () => {
    window.setTimeout(
      () => {
        if (mood === 'idle' && !petting && !document.hidden) {
          gsap.to(eye, {
            scaleY: 0.1,
            svgOrigin: `${EYE.x} ${EYE.y}`,
            duration: 0.07,
            yoyo: true,
            repeat: Math.random() < 0.25 ? 3 : 1
          })
        }
        scheduleBlink()
      },
      rand(2500, 6500)
    )
  }

  // ---------- 跟随指针 ----------

  const track = () => {
    trackFrame = 0
    if (!pointer || busy || petting || mood !== 'idle' || !moving()) return
    const { rect } = frame()
    const center = rect.left + rect.width / 2
    if (pointer.x > center + 28) turn(-1)
    else if (pointer.x < center - 28) turn(1)

    const eyeAt = toClient(EYE)
    const dx = pointer.x - eyeAt.x
    const dy = pointer.y - eyeAt.y
    const distance = Math.hypot(dx, dy) || 1
    const ux = dx / distance
    const uy = dy / distance

    gsap.to(pupil, {
      x: ux * 1.1 * facing,
      y: uy * 1.1,
      duration: 0.2,
      overwrite: 'auto'
    })
    gsap.to(head, {
      rotation: clamp(-uy * 14, -14, 14),
      svgOrigin: NECK,
      duration: 0.4,
      ease: 'power2.out',
      overwrite: 'auto'
    })

    // 光标逼近：炸毛警戒
    const close = distance < 110
    if (close !== fluffed) {
      fluffed = close
      gsap.to([body, wing], {
        scale: close ? 1.06 : 1,
        svgOrigin: '42 50',
        duration: 0.3,
        ease: close ? 'back.out(3)' : 'power2.out'
      })
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY }
    lastActivity = performance.now()
    if (mood === 'sleep' && !isDark()) {
      const eyeAt = toClient(EYE)
      if (Math.hypot(pointer.x - eyeAt.x, pointer.y - eyeAt.y) < 140)
        wake('嘎？')
    }
    if (!finePointer.matches) return
    sensePet(pointer)
    // 停在它身上不动才会被咬：每次移动都重新计时
    if (!petting && hit.matches(':hover')) {
      window.clearTimeout(hoverTimer)
      hoverTimer = window.setTimeout(() => {
        if (mood === 'idle' && !petting) bite('peck')
      }, HOVER_BITE_DELAY)
    }
    if (!trackFrame) trackFrame = window.requestAnimationFrame(track)
  }

  // ---------- 撕纸：读完文章，叼一条纸塞进尾羽 ----------

  const PAPER_KEY = 'xiaoying:paper'
  const readPaper = () => {
    try {
      return new Set<string>(
        JSON.parse(sessionStorage.getItem(PAPER_KEY) ?? '[]')
      )
    } catch {
      return new Set<string>()
    }
  }
  const savePaper = (paths: Set<string>) => {
    try {
      sessionStorage.setItem(PAPER_KEY, JSON.stringify([...paths]))
    } catch {
      // 忽略
    }
  }
  if (readPaper().size) gsap.set(paper, { opacity: 1 })

  const tuck = (source: Element, label: string) => {
    wake()
    if (!moving()) {
      gsap.set(paper, { opacity: 1 })
      say('这页我收下了', 2400)
      return
    }
    busy = true
    turn(1)
    const from = source.getBoundingClientRect()
    const strip = spawn('xy-strip')
    strip.textContent = label
    const to = toClient(TAIL)
    const start = {
      x: clamp(from.left + from.width / 2 - 68, 8, window.innerWidth - 150),
      y: clamp(from.top, 8, window.innerHeight - 40)
    }
    gsap.set(strip, {
      x: start.x,
      y: start.y,
      rotation: -3,
      transformOrigin: '50% 50%'
    })
    say('这页我收下了', 2400)

    gsap
      .timeline({
        onComplete: () => {
          strip.remove()
          busy = false
        }
      })
      .fromTo(
        strip,
        { autoAlpha: 0, y: start.y + 10 },
        { autoAlpha: 1, y: start.y, duration: 0.35 }
      )
      .to(
        strip,
        { x: start.x - 4, rotation: -9, duration: 0.08, yoyo: true, repeat: 3 },
        '+=0.25'
      )
      .to(strip, {
        x: to.x - 68,
        y: to.y - 12,
        scale: 0.14,
        rotation: 160,
        duration: 1.05,
        ease: 'power2.in'
      })
      .to(strip, { autoAlpha: 0, duration: 0.12 }, '-=0.12')
      .set(paper, { opacity: 1 })
      .add(openBeak(true, 0.05), '-=0.35')
      .add(openBeak(false, 0.08))
      .to(tail, {
        rotation: 10,
        svgOrigin: '47 59',
        duration: 0.07,
        yoyo: true,
        repeat: 5
      })
  }

  let paperObserver: IntersectionObserver | null = null
  let watchedBody: HTMLElement | null = null

  const watchPage = () => {
    // 首次挂载与 astro:page-load 可能对同一页面各触发一次
    if (watchedBody === document.body) return
    watchedBody = document.body
    paperObserver?.disconnect()
    paperObserver = null
    const path = window.location.pathname

    if (document.querySelector('[data-xiaoying-404]')) {
      window.setTimeout(() => {
        wake()
        gsap.set(paper, { opacity: 1 })
        say('……不是我撕的', 3200)
      }, 900)
      return
    }

    const sentinel = document.querySelector('[data-xiaoying-paper]')
    if (!sentinel || readPaper().has(path)) return
    paperObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || busy) return
        paperObserver?.disconnect()
        const done = readPaper()
        done.add(path)
        savePaper(done)
        const title = document.querySelector('h1')?.textContent?.trim() ?? path
        tuck(sentinel, title)
      },
      { threshold: 1 }
    )
    paperObserver.observe(sentinel)
  }

  // ---------- 入场 / 换页 / 关笼 ----------

  const enter = () => {
    root.dataset.ready = ''
    if (!moving()) return
    const flap = gsap.to(wing, {
      rotation: -36,
      svgOrigin: '43 34',
      duration: 0.07,
      yoyo: true,
      repeat: 9
    })
    gsap
      .timeline()
      .fromTo(
        bird,
        { y: -70, x: 30, autoAlpha: 0 },
        { y: 0, x: 0, autoAlpha: 1, duration: 0.75, ease: 'power2.out' }
      )
      .add(() => {
        flap.kill()
        gsap.to(wing, { rotation: 0, svgOrigin: '43 34', duration: 0.1 })
      })
      .fromTo(
        bird,
        { scaleY: 0.88 },
        {
          scaleY: 1,
          svgOrigin: FEET,
          duration: 0.45,
          ease: 'elastic.out(1, 0.4)'
        }
      )
  }

  const onRouteChange = () => {
    lastActivity = performance.now()
    if (mood === 'idle' && !busy && moving()) idleActions[1]()
    const path = window.location.pathname
    const route = Object.keys(LINES.route).find((prefix) =>
      path.startsWith(prefix)
    )
    if (route && Math.random() < 0.4)
      window.setTimeout(() => say(LINES.route[route]), 700)
  }

  const applyCage = (caged: boolean, animate: boolean) => {
    if (!caged) {
      root.hidden = false
      enter()
      return
    }
    if (!animate || !moving()) {
      root.hidden = true
      return
    }
    say('回笼子了，拜拜', 1200)
    gsap.to(bird, {
      y: -90,
      x: 40,
      autoAlpha: 0,
      duration: 0.7,
      delay: 0.6,
      ease: 'power2.in',
      onComplete: () => {
        root.hidden = true
        gsap.set(bird, { x: 0, y: 0 })
      }
    })
  }

  // ---------- 事件绑定 ----------

  // 触屏：长按算挠头，松手结束；轻点照旧会被咬
  let pressTimer = 0
  let suppressClick = false
  hit.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return
    window.clearTimeout(pressTimer)
    pressTimer = window.setTimeout(() => {
      suppressClick = true
      startPet()
      navigator.vibrate?.(8)
    }, LONG_PRESS)
  })
  const release = () => {
    window.clearTimeout(pressTimer)
    if (petting && !finePointer.matches) stopPet(false)
  }
  hit.addEventListener('pointerup', release)
  hit.addEventListener('pointercancel', release)
  hit.addEventListener('contextmenu', (event) => event.preventDefault())

  hit.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false
      return
    }
    if (petting) return
    const at =
      event.detail === 0 ? undefined : { x: event.clientX, y: event.clientY }
    if (mood === 'sleep') {
      wake()
      say(pick(LINES.grumpy))
      window.setTimeout(() => bite('grumpy', at), 260)
      return
    }
    clicks++
    bite(clicks % 5 === 0 ? 'ear' : 'peck', at)
  })

  hit.addEventListener('pointerleave', () => {
    window.clearTimeout(hoverTimer)
    if (petting && finePointer.matches) stopPet(false)
  })

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('scroll', () => (lastActivity = performance.now()), {
    passive: true
  })
  window.addEventListener('keydown', () => (lastActivity = performance.now()))

  // 暗色模式 = 盖上笼布睡觉；切回亮色就醒
  new MutationObserver(() => {
    if (isDark())
      window.setTimeout(() => isDark() && (say('关灯了……', 1200), sleep()), 900)
    else wake('天亮了！')
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-mode']
  })

  window.setInterval(() => {
    if (mood !== 'idle' || busy || petting || document.hidden) return
    const limit = isDark() ? SLEEP_AFTER_DARK : SLEEP_AFTER
    if (performance.now() - lastActivity > limit) sleep()
  }, 2000)

  window.addEventListener(CAGE_EVENT, (event) => {
    applyCage(
      Boolean((event as CustomEvent<{ caged: boolean }>).detail?.caged),
      true
    )
  })

  document.addEventListener('astro:after-swap', onRouteChange)
  document.addEventListener('astro:page-load', watchPage)

  // ---------- 启动 ----------

  applyCage(isCaged(), false)
  if (isDark()) sleep()
  watchPage()
  scheduleIdle()
  scheduleBlink()
}
