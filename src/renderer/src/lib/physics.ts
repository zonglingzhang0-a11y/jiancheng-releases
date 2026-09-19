// 失重漂浮：自写的轴对齐碰撞，只反弹、不打转、不随机变向
// 完成的待办按完成先后慢慢移到左下角，排成一行，排满了叠到上一行
// 速度单位是「像素 / 步」，一步 = 1/60 秒
import { smooth } from './ribbon'

export const STEP = 1000 / 60

/** drift：漂浮 · sink：正在移向左下角的位置 · rest：已经排好 · held：被拖着 */
export type Mode = 'drift' | 'sink' | 'rest' | 'held'

export interface Body {
  id: string
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  mode: Mode
  /** 巡航速度（像素 / 步） */
  cruise: number
  /** 当前运动方向（弧度） */
  dir: number
  ph: number
  sinkAt: number
  rot: number
  /** 已完成：在左下角占一个位置 */
  done: boolean
  /** 完成的先后，决定排在第几个 */
  order: number
  /** 排好后的位置 */
  tx: number
  ty: number
  /** 这一趟的最大速度，按距离定：远的走快一点，总时长差不多 */
  cap: number
  sunk?: boolean
}

export interface Rect {
  l: number
  r: number
  t: number
  b: number
}

export class World {
  bodies: Body[] = []
  statics: Rect[] = []
  W = 1
  H = 1
  /** 完成的待办离左、下边框的距离，以及彼此的间距 */
  shelfPad = 8
  shelfGap = 6
  private seq = 0

  get(id: string): Body | undefined {
    return this.bodies.find((b) => b.id === id)
  }

  remove(id: string): void {
    this.bodies = this.bodies.filter((b) => b.id !== id)
  }

  /** 初速度方向按黄金角依次错开：每个待办方向不同，但每次打开都一样 */
  make(id: string, x: number, y: number, w: number, h: number, mode: Mode, cruise: number): Body {
    const i = this.seq++
    const dir = 0.6 + i * 2.39996
    const c = cruise * (0.85 + (i % 3) * 0.12)
    return {
      id,
      x,
      y,
      w,
      h,
      mode,
      dir,
      cruise: c,
      ph: i * 1.7,
      vx: mode === 'drift' ? Math.cos(dir) * c : 0,
      vy: mode === 'drift' ? Math.sin(dir) * c : 0,
      sinkAt: -99,
      rot: 0,
      done: false,
      order: 0,
      tx: x,
      ty: y,
      cap: 0
    }
  }

  /**
   * 新加入的物体摆放：漂浮的分上下两条航道均匀排开，已完成的直接放在左下角排好的位置
   * lanes 为两条航道中心的 y 坐标
   */
  place(fresh: { id: string; w: number; h: number; sunk: boolean; order: number }[], lanes: [number, number], cruise: number): void {
    const flying = fresh.filter((f) => !f.sunk)
    const resting = fresh.filter((f) => f.sunk)
    flying.forEach((f, i) => {
      const lane = i % 2
      const n = Math.ceil((flying.length - lane) / 2)
      const k = Math.floor(i / 2)
      const x = (this.W * (k + 0.5 + lane * 0.35)) / (n + lane * 0.35)
      this.bodies.push(this.make(f.id, x, lanes[lane] + ((k % 3) - 1) * (lane ? 3 : 5), f.w, f.h, 'drift', cruise))
    })
    const added = resting.map((f) => {
      const b = this.make(f.id, 0, 0, f.w, f.h, 'rest', cruise)
      b.done = true
      b.order = f.order
      this.bodies.push(b)
      return b
    })
    this.shelve()
    for (const b of added) {
      b.x = b.tx
      b.y = b.ty
    }
    this.clampAll()
  }

  /** 算出每个已完成待办的位置：从左下角起按完成先后排成一行，排满了叠到上一行 */
  shelve(): void {
    const { W, H, shelfPad: pad, shelfGap: gap } = this
    const list = this.bodies.filter((b) => b.done).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
    let x = pad
    let bottom = H - pad
    let rowH = 0
    for (const b of list) {
      if (x > pad && x + b.w > W - pad) {
        bottom -= rowH + gap
        x = pad
        rowH = 0
      }
      b.tx = x + b.w / 2
      b.ty = Math.max(b.h / 2, bottom - b.h / 2)
      x += b.w + gap
      rowH = Math.max(rowH, b.h)
    }
  }

  clampAll(): void {
    for (const b of this.bodies) {
      b.x = Math.max(b.w / 2, Math.min(this.W - b.w / 2, b.x))
      b.y = Math.max(b.h / 2, Math.min(this.H - b.h / 2, b.y))
    }
  }

  /** 完成 / 取消完成：完成的慢慢移到左下角排好；取消完成的给一个向上的初速度重新漂起来 */
  setSunk(id: string, sunk: boolean, T: number, order = 0): void {
    const b = this.get(id)
    if (!b) return
    b.done = sunk
    b.order = order
    if (b.mode === 'held') return
    if (sunk && b.mode === 'drift') {
      b.mode = 'sink'
      b.sinkAt = T
      b.cap = 0
    } else if (!sunk && (b.mode === 'sink' || b.mode === 'rest')) {
      b.mode = 'drift'
      b.dir = -Math.PI / 2 + (Math.sin(b.ph) > 0 ? 0.5 : -0.5)
      b.vx = Math.cos(b.dir) * b.cruise
      b.vy = Math.sin(b.dir) * b.cruise
    }
  }

  step(T: number, mul: number): void {
    this.shelve()
    for (const b of this.bodies) {
      if (b.mode === 'held') continue
      if (b.mode === 'drift') {
        // 巡航：只把速度大小慢慢拉回设定值，方向完全由碰撞决定
        const target = b.cruise * mul
        const v = Math.hypot(b.vx, b.vy)
        if (target <= 0) {
          b.vx *= 0.94
          b.vy *= 0.94
        } else if (v < 1e-3) {
          b.vx = Math.cos(b.dir) * 0.01
          b.vy = Math.sin(b.dir) * 0.01
        } else {
          const k = 1 + (target / v - 1) * 0.02
          b.vx *= k
          b.vy *= k
        }
      } else {
        const dx = b.tx - b.x
        const dy = b.ty - b.y
        const dist = Math.hypot(dx, dy)
        // 排好的位置变了（前面有待办取消完成、窗口变宽窄），再慢慢挪过去
        if (b.mode === 'rest' && dist > 1) {
          b.mode = 'sink'
          b.sinkAt = T - 0.6
          b.cap = 0
        }
        // 不漂动（减少动态效果、卡片移开变淡）时直接放到位
        if (b.mode === 'rest' || mul <= 0) {
          b.x = b.tx
          b.y = b.ty
          b.vx = 0
          b.vy = 0
          if (b.mode === 'sink') b.mode = 'rest'
          continue
        }
        // 先停 0.6 秒，再用 2 秒慢慢起步，像被轻轻牵着移过去；约 4 秒到位
        if (!b.cap) b.cap = Math.max(1.2, Math.min(6, dist / 110))
        const k = 0.002 * smooth((T - b.sinkAt - 0.6) / 2)
        b.vx = (b.vx + dx * k) * 0.925
        b.vy = (b.vy + dy * k) * 0.925
        const v = Math.hypot(b.vx, b.vy)
        if (v > b.cap) {
          b.vx *= b.cap / v
          b.vy *= b.cap / v
        }
        if (dist < 0.5 && v < 0.05 && T - b.sinkAt > 0.6) {
          b.mode = 'rest'
          continue
        }
      }
      b.x += b.vx
      b.y += b.vy
    }
    for (let i = 0; i < 3; i++) this.collide()
    for (const b of this.bodies) if (b.mode === 'drift' && (b.vx || b.vy)) b.dir = Math.atan2(b.vy, b.vx)
  }

  private collide(): void {
    const { W, H, bodies } = this
    for (const b of bodies) {
      const e = b.mode === 'drift' ? 1 : 0
      const hw = b.w / 2
      const hh = b.h / 2
      if (b.x - hw < 0) {
        b.x = hw
        if (b.vx < 0) b.vx = -b.vx * e
      }
      if (b.x + hw > W) {
        b.x = W - hw
        if (b.vx > 0) b.vx = -b.vx * e
      }
      if (b.y - hh < 0) {
        b.y = hh
        if (b.vy < 0) b.vy = -b.vy * e
      }
      if (b.y + hh > H) {
        b.y = H - hh
        if (b.vy > 0) b.vy = -b.vy * e
      }
      if (b.mode !== 'drift') continue
      for (const s of this.statics) {
        const ox = Math.min(b.x + hw, s.r) - Math.max(b.x - hw, s.l)
        const oy = Math.min(b.y + hh, s.b) - Math.max(b.y - hh, s.t)
        if (ox <= 0 || oy <= 0) continue
        if (ox < oy) {
          const d = b.x < (s.l + s.r) / 2 ? -1 : 1
          b.x += d * ox
          if (b.vx * d < 0) b.vx = -b.vx
        } else {
          const d = b.y < (s.t + s.b) / 2 ? -1 : 1
          b.y += d * oy
          if (b.vy * d < 0) b.vy = -b.vy
        }
      }
    }
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) this.pair(bodies[i], bodies[j])
  }

  private pair(a: Body, b: Body): void {
    // 正在移向左下角的待办从别的待办后面穿过；排好的待办不会被撞动，漂浮的碰到它就弹开
    if (a.mode === 'sink' || b.mode === 'sink') return
    const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2)
    const oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2)
    if (ox <= 0 || oy <= 0) return
    const im = (x: Body): number => (x.mode === 'held' || x.mode === 'rest' ? 0 : 400 / (x.w * x.h))
    const ia = im(a)
    const ib = im(b)
    if (ia + ib === 0) return
    // 刚排好的待办压在漂浮的上面时，把漂浮的慢慢推开，不要一下子跳开
    const lim = a.mode === 'rest' || b.mode === 'rest' ? 2 : Infinity
    const e = a.mode === 'drift' || b.mode === 'drift' ? 1 : 0
    if (ox < oy) {
      const d = a.x < b.x ? -1 : 1
      a.x += (d * Math.min(ox, lim) * ia) / (ia + ib)
      b.x -= (d * Math.min(ox, lim) * ib) / (ia + ib)
      const rel = (a.vx - b.vx) * -d
      if (rel > 0) {
        const j = ((1 + e) * rel) / (ia + ib)
        a.vx += d * j * ia
        b.vx -= d * j * ib
      }
    } else {
      const d = a.y < b.y ? -1 : 1
      a.y += (d * Math.min(oy, lim) * ia) / (ia + ib)
      b.y -= (d * Math.min(oy, lim) * ib) / (ia + ib)
      const rel = (a.vy - b.vy) * -d
      if (rel > 0) {
        const j = ((1 + e) * rel) / (ia + ib)
        a.vy += d * j * ia
        b.vy -= d * j * ib
      }
    }
  }
}

/** 把物体位置写到元素上；移向左下角时前端微微抬起 */
export function placeBody(b: Body, el: HTMLElement): void {
  const tilt = b.mode === 'sink' ? Math.max(-2.5, Math.min(2.5, -b.vx * 0.8)) : 0
  b.rot += (tilt - b.rot) * 0.06
  el.style.transform = `translate(${(b.x - b.w / 2).toFixed(1)}px, ${(b.y - b.h / 2).toFixed(1)}px)${Math.abs(b.rot) > 0.02 ? ` rotate(${b.rot.toFixed(2)}deg)` : ''}`
  const sunk = b.mode === 'sink' || b.mode === 'rest'
  if (b.sunk !== sunk) {
    b.sunk = sunk
    el.classList.toggle('sunk', sunk)
  }
}

/** 固定步长的动画循环：高刷新率屏幕上也不会漂得更快 */
export function runLoop(tick: (T: number) => void, frame: (T: number) => void): () => void {
  let acc = 0
  let last = 0
  let raf = 0
  const loop = (now: number): void => {
    acc = Math.min(acc + (last ? now - last : STEP), 50)
    last = now
    const T = now / 1000
    for (let n = 0; acc >= STEP && n < 3; n++) {
      tick(T)
      acc -= STEP
    }
    frame(T)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}
