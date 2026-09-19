import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Pencil, Plus } from 'lucide-react'
import { pad, todayKey } from '@shared/schedule'
import { useStore } from '../store'
import { carriedLabel, floatItems, timedItems, type DayItem } from '../lib/day'
import { hm, longDur } from '../lib/cal'
import { paintRibbon, xOf, type Sun } from '../lib/ribbon'
import { placeBody, runLoop, World } from '../lib/physics'
import { TaskIcon } from '../lib/icons'
import { burst, burstAt } from '../lib/fx'
import { cx } from '../components/ui'

const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
const BLOCK_H = 46

/** 规划用的空位：每段空档最多放一个（三个半小时以上放两个），时长 45–60 分钟 */
function planSlots(timed: DayItem[], fromMin: number, count: number): [number, number][] {
  const busy = timed.map((i) => [i.start!, i.end!] as [number, number]).sort((a, b) => a[0] - b[0])
  const edges: [number, number][] = [[0, fromMin], ...busy, [1350, 1440]]
  const out: [number, number][] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const g0 = Math.max(fromMin, Math.ceil(edges[i][1] / 15) * 15)
    const g1 = edges[i + 1][0]
    const len = Math.min(60, g1 - g0)
    if (len < 45) continue
    if (g1 - g0 >= 210) out.push([g0 + 30, 60], [g1 - 90, 60])
    else out.push([g1 - g0 >= 120 ? g0 + 30 : g0, len])
  }
  return out.slice(0, count)
}

function SunArc(props: { W: number; sun: Sun; m: number | null }): React.JSX.Element {
  const { W, sun, m } = props
  const H = 40
  const x0 = xOf(sun.rise) * W
  const x1 = xOf(sun.set) * W
  const base = H - 3
  const cx0 = (x0 + x1) / 2
  const cy = 8 - base
  let marker: React.JSX.Element | null = null
  if (m !== null && m >= sun.rise && m <= sun.set) {
    const t = (m - sun.rise) / (sun.set - sun.rise)
    const px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx0 + t ** 2 * x1
    const py = (1 - t) ** 2 * base + 2 * (1 - t) * t * cy + t ** 2 * base
    const q0x = x0 + (cx0 - x0) * t
    const q0y = base + (cy - base) * t
    marker = (
      <>
        <path className="arc-done" d={`M${x0},${base} Q${q0x},${q0y} ${px},${py}`} />
        <g className="rays">
          {Array.from({ length: 8 }, (_, i) => {
            const a = (Math.PI * i) / 4
            return <line key={i} x1={px + Math.cos(a) * 8} y1={py + Math.sin(a) * 8} x2={px + Math.cos(a) * 11} y2={py + Math.sin(a) * 11} />
          })}
        </g>
        <circle className="sun" cx={px} cy={py} r={5.5} />
      </>
    )
  } else if (m !== null) {
    const px = xOf(m) * W
    marker = (
      <>
        <circle className="moon" cx={px} cy={base - 4} r={5} />
        <circle className="moon-cut" cx={px + 2.5} cy={base - 6} r={4.5} />
      </>
    )
  }
  return (
    <svg className="sunarc" viewBox={`0 0 ${Math.max(1, W)} ${H}`} aria-hidden>
      <path className="arc" d={`M${x0},${base} Q${cx0},${cy} ${x1},${base}`} />
      <text x={x0 - 6} y={base + 1} textAnchor="end">
        升
      </text>
      <text x={x1 + 6} y={base + 1}>
        落
      </text>
      {marker}
    </svg>
  )
}

interface PopState {
  item: DayItem
  x: number
  y: number
}

export function Ribbon(props: { items: DayItem[]; isToday: boolean; nowMin: number; sun: Sun }): React.JSX.Element {
  const { items, isToday, nowMin, sun } = props
  const look = useStore((s) => s.data.settings.look)
  const cursor = useStore((s) => s.cursor)
  const planning = useStore((s) => s.planning)
  const setPlanning = useStore((s) => s.setPlanning)
  const openTask = useStore((s) => s.openTask)
  const toggle = useStore((s) => s.toggle)
  const scheduleAt = useStore((s) => s.scheduleAt)
  const showToast = useStore((s) => s.showToast)
  const rbRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [pop, setPop] = useState<PopState | null>(null)
  const [hot, setHot] = useState<number | null>(null)
  const [planned, setPlanned] = useState(0)

  const timed = useMemo(() => timedItems(items), [items])
  const floats = useMemo(() => floatItems(items), [items])
  const m = isToday ? nowMin : cursor < todayKey() ? 1440 : -1

  /* ---------- 尺寸与色带 ---------- */
  useLayoutEffect(() => {
    const el = rbRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (canvasRef.current && size.w) paintRibbon(canvasRef.current, size.w, size.h, sun, look.night)
  }, [size, sun, look.night])

  /* ---------- 失重漂浮 ---------- */
  const world = useRef(new World()).current
  const els = useRef(new Map<string, HTMLElement>())
  const speed = useRef(look.floatSpeed)
  speed.current = look.floatSpeed

  useLayoutEffect(() => {
    if (!size.w) return
    world.W = size.w
    world.H = size.h
    world.statics = timed.map((i) => ({ l: xOf(i.start!) * size.w, r: xOf(i.end!) * size.w - 3, t: size.h / 2 - BLOCK_H / 2, b: size.h / 2 + BLOCK_H / 2 }))
    const keys = new Set(floats.map((f) => f.key))
    world.bodies = world.bodies.filter((b) => keys.has(b.id))
    const fresh = floats
      .filter((f) => !world.get(f.key))
      .map((f) => {
        const el = els.current.get(f.key)
        return { id: f.key, w: el?.offsetWidth ?? 96, h: el?.offsetHeight ?? 30, sunk: look.gravity && f.done }
      })
    world.place(fresh, [30, size.h - 54], 0.4)
    for (const b of world.bodies) {
      const el = els.current.get(b.id)
      if (el) {
        b.w = el.offsetWidth
        b.h = el.offsetHeight
      }
    }
    world.clampAll()
  }, [floats, timed, size, look.icons, look.gravity, world])

  useEffect(() => {
    const T = performance.now() / 1000
    for (const f of floats) world.setSunk(f.key, look.gravity && f.done, T)
  }, [floats, look.gravity, world])

  useEffect(
    () =>
      runLoop(
        (T) => world.step(T, reduced() ? 0 : speed.current),
        (T) => {
          for (const b of world.bodies) {
            const el = els.current.get(b.id)
            if (el) placeBody(b, el, T)
          }
        }
      ),
    [world]
  )

  /* ---------- 规划空位 ---------- */
  const slots = useMemo(() => (planning && isToday ? planSlots(timed, Math.max(Math.ceil(nowMin / 15) * 15, 0), 4) : []), [planning, isToday, timed, nowMin])
  useEffect(() => {
    if (!planning) setPlanned(0)
  }, [planning])

  const ghostAt = (x: number, y: number): [number, number] | null => {
    const nodes = rbRef.current?.querySelectorAll<HTMLElement>('.slot-ghost') ?? []
    for (const g of nodes) {
      const r = g.getBoundingClientRect()
      if (x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 14 && y <= r.bottom + 14) return [Number(g.dataset.start), Number(g.dataset.len)]
    }
    return null
  }

  const place = (item: DayItem, start: number, len: number, from: DOMRect | null): void => {
    scheduleAt(item.task, item.date, cursor, hm(start), hm(Math.min(1439, start + len)))
    if (from) burst(from.left + from.width / 2, from.top + from.height / 2)
    if (planning) setPlanned((n) => n + 1)
  }

  /* ---------- 拖动 ---------- */
  const drag = useRef<{ key: string; x0: number; y0: number; lx: number; ly: number; lt: number; vx: number; vy: number; moved: boolean; saved: { mode: 'drift' | 'sink' | 'rest' | 'held'; vx: number; vy: number } | null } | null>(null)

  const onDown = (e: React.PointerEvent<HTMLDivElement>, item: DayItem): void => {
    if (e.button !== 0) return
    const b = world.get(item.key)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { key: item.key, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0, moved: false, saved: b ? { mode: b.mode, vx: b.vx, vy: b.vy } : null }
    e.currentTarget.classList.add('drag')
    if (b) {
      b.mode = 'held'
      b.vx = 0
      b.vy = 0
    }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const b = world.get(d.key)
    const dx = e.clientX - d.lx
    const dy = e.clientY - d.ly
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) d.moved = true
    const now = performance.now()
    const dt = Math.max(1, now - d.lt)
    d.vx = (dx / dt) * (1000 / 60)
    d.vy = (dy / dt) * (1000 / 60)
    d.lx = e.clientX
    d.ly = e.clientY
    d.lt = now
    if (b) {
      b.x = clamp(b.x + dx, b.w / 2, world.W - b.w / 2)
      b.y = clamp(b.y + dy, b.h / 2, world.H - b.h / 2)
      b.vx = d.vx
      b.vy = d.vy
    }
    if (planning) {
      const g = ghostAt(e.clientX, e.clientY)
      setHot(g ? g[0] : null)
    }
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>, item: DayItem): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    const el = e.currentTarget
    el.classList.remove('drag')
    setHot(null)
    const b = world.get(d.key)
    const g = planning && d.moved ? ghostAt(e.clientX, e.clientY) : null
    if (g) {
      world.remove(d.key)
      place(item, g[0], g[1], el.getBoundingClientRect())
      return
    }
    if (b) {
      if (!d.moved && d.saved) Object.assign(b, d.saved)
      else if (look.gravity && item.done) {
        b.mode = 'sink'
        b.sinkAt = performance.now() / 1000 - 0.6
        b.vx = 0
        b.vy = 0
      } else {
        // 扔出去的速度会在一两秒内慢慢回到巡航速度
        b.mode = 'drift'
        b.vx = clamp(d.vx * 0.6, -6, 6)
        b.vy = clamp(d.vy * 0.6, -6, 6)
      }
    }
    if (!d.moved) {
      const r = el.getBoundingClientRect()
      setPop({ item, x: r.left + r.width / 2, y: r.top })
    }
  }

  useEffect(() => {
    if (!pop) return
    const close = (e: PointerEvent): void => {
      if (!(e.target as HTMLElement).closest('.pop-card, .flt')) setPop(null)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPop(null)
    }
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [pop])

  /* ---------- 空档、下一项 ---------- */
  const W = size.w
  const gaps: { mid: number; d: number }[] = []
  if (look.gaps && W) {
    for (let i = 0; i < timed.length - 1; i++) {
      const g0 = timed[i].end!
      const g1 = timed[i + 1].start!
      if (g1 - g0 < 30 || (xOf(g1) - xOf(g0)) * W < 90) continue
      gaps.push({ mid: (xOf(g0) + xOf(g1)) / 2, d: g1 - g0 })
    }
  }
  const next = isToday ? timed.find((i) => !i.done && i.start! > nowMin) : undefined
  const undoneFloats = floats.filter((f) => !f.done).length
  const dayLen = sun.set - sun.rise

  return (
    <section className="ribbon-wrap">
      {planning && isToday ? (
        <div className="plan-banner">
          <span>
            <b>规划今天</b> · 把想做的待办拖进色带里的虚线框
          </span>
          <span className="sp" />
          <span className="pb-n tnum">已排 {planned} 项</span>
          <button className="btn primary fx" onClick={() => setPlanning(false)}>
            完成规划
          </button>
        </div>
      ) : (
        <div className="ribbon-head">
          <span>{floats.length ? '漂着的是随时可做的待办：拖一下、扔出去，点它看操作' : '有具体时间的日程贴在色带上，没定时间的会漂在这里'}</span>
          <span className="sp" />
          <span className="tnum">
            昼长 {Math.floor(dayLen / 60)} 小时 {Math.round(dayLen % 60)} 分
          </span>
          {isToday && undoneFloats > 0 && (
            <button className="btn soft sm fx" onClick={() => setPlanning(true)}>
              <CalendarClock size={13} />
              规划今天
            </button>
          )}
        </div>
      )}
      {look.sun && W > 0 && <SunArc W={W} sun={sun} m={isToday ? nowMin : null} />}
      <div className="ribbon" ref={rbRef}>
        <canvas ref={canvasRef} />
        <i className="ribbon-shine" />
        {[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((h) => (
          <i key={h} className="hourline" style={{ left: `${xOf(h * 60) * 100}%` }} />
        ))}
        {m >= 0 && <div className="past" style={{ width: `${xOf(Math.min(1440, m)) * 100}%` }} />}
        {gaps.map((g) => (
          <span key={g.mid} className="gap tnum" style={{ left: `${g.mid * 100}%` }}>
            空 {Math.floor(g.d / 60) ? `${Math.floor(g.d / 60)}小时` : ''}
            {g.d % 60 ? `${g.d % 60}分` : ''}
          </span>
        ))}
        {look.gaps && next && (
          <div className="next-link" style={{ left: `${xOf(nowMin) * 100}%`, width: `calc(${(xOf(next.start!) - xOf(nowMin)) * 100}% - 4px)` }}>
            <span className="tnum">{next.start! - nowMin < 60 ? `${Math.ceil(next.start! - nowMin)} 分钟后` : `${longDur(next.start! - nowMin)}后`}</span>
          </div>
        )}
        {slots.map(([s, len], i) => (
          <div
            key={s}
            className={cx('slot-ghost tnum', hot === s && 'hot')}
            data-start={s}
            data-len={len}
            style={{ left: `${xOf(s) * 100}%`, width: `calc(${(xOf(s + len) - xOf(s)) * 100}% - 3px)`, animationDelay: `${i * 80}ms` }}
            title={`拖到这里，排在 ${hm(s)}`}
          >
            <span>
              ＋<br />
              {hm(s)}
            </span>
          </div>
        ))}
        {timed.map((i) => {
          const left = xOf(i.start!)
          const width = Math.max(0.002, xOf(i.end!) - left)
          const px = width * W
          const cur = isToday && !i.done && nowMin >= i.start! && nowMin < i.end!
          const p = cur ? ((nowMin - i.start!) / (i.end! - i.start!)) * 100 : 0
          return (
            <button
              key={i.key}
              className={cx('blk fx', px < 40 ? 'narrow' : px < 96 && 'compact', i.done && 'done', cur && 'cur', cur && look.ring && 'filling')}
              style={{ left: `${left * 100}%`, width: `calc(${width * 100}% - 3px)`, ['--p' as string]: `${p}%` }}
              onClick={() => openTask(i.task, i.date)}
              title={`${i.task.start}–${i.task.end} ${i.task.title}`}
            >
              <span className="bt">
                {look.icons && <TaskIcon name={i.icon} size={13} />}
                <span>{i.task.title}</span>
              </span>
              <span className="bm tnum">
                {i.task.start}–{i.task.end}
              </span>
              {cur && !look.ring && <i className="prog" style={{ width: `${p}%` }} />}
            </button>
          )
        })}
        {floats.map((f) => (
          <div
            key={f.key}
            ref={(el) => {
              if (el) els.current.set(f.key, el)
              else els.current.delete(f.key)
            }}
            className={cx('flt', f.done && 'done')}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => onDown(e, f)}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(e, f)}
            onPointerCancel={(e) => onUp(e, f)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                setPop({ item: f, x: r.left + r.width / 2, y: r.top })
              }
            }}
          >
            {look.icons ? <TaskIcon name={f.icon} size={14} /> : <i className="fd" />}
            {f.task.title}
            {f.carried > 0 && <span className="ytag">{carriedLabel(f.carried)}</span>}
          </div>
        ))}
        {isToday && <div className="now-mark" style={{ left: `${xOf(nowMin) * 100}%` }} />}
        {floats.length === 0 && timed.length === 0 && <div className="ribbon-empty">这一天还空着</div>}
      </div>
      <div className="axis tnum">
        {[0, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((h) => (
          <span key={h} style={{ left: `${xOf(h * 60) * 100}%` }}>
            {pad(h)}
          </span>
        ))}
        <span className="sunt" style={{ left: `${xOf(sun.rise) * 100}%` }}>
          日出 {hm(sun.rise)}
        </span>
        <span className="sunt" style={{ left: `${xOf(sun.set) * 100}%` }}>
          日落 {hm(sun.set)}
        </span>
      </div>

      {pop && (
        <div className="pop-card" style={{ left: clamp(pop.x - 130, 12, window.innerWidth - 272), top: pop.y - 12 }}>
          <h4>
            {look.icons && <TaskIcon name={pop.item.icon} size={15} />}
            {pop.item.task.title}
          </h4>
          <span className="chip-soft">
            {pop.item.carried > 0 ? `${carriedLabel(pop.item.carried)}没做完` : pop.item.task.auto?.enabled ? pop.item.progress?.detail ?? '智能完成' : '没定时间'}
          </span>
          <div className="row">
            <button
              className="btn primary fx"
              onClick={(e) => {
                if (!pop.item.done) burstAt(e)
                toggle(pop.item.task.id, pop.item.date)
                setPop(null)
              }}
            >
              {pop.item.done ? '取消完成' : '完成'}
            </button>
            {isToday && !pop.item.done && (
              <button
                className="btn soft fx"
                onClick={() => {
                  const slot = planSlots(timed, Math.ceil(nowMin / 15) * 15, 1)[0]
                  if (!slot) showToast('今天后面没有一小时以上的空档了')
                  else {
                    const el = els.current.get(pop.item.key)
                    world.remove(pop.item.key)
                    place(pop.item, slot[0], slot[1], el?.getBoundingClientRect() ?? null)
                    showToast(`已排到 ${hm(slot[0])}`)
                  }
                  setPop(null)
                }}
              >
                <Plus size={13} />
                排进时间轴
              </button>
            )}
            <button
              className="btn soft fx"
              onClick={() => {
                openTask(pop.item.task, pop.item.date)
                setPop(null)
              }}
            >
              <Pencil size={13} />
              编辑
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
