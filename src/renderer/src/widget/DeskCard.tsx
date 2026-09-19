// 桌角卡片：小卡 / 中卡 / 侧栏。桌面卡片窗口和外观设置的预览共用
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { addDays, fromKey } from '@shared/schedule'
import type { AppData, AutoProgress, CardSize, ImportedFont, LookSettings } from '@shared/types'
import { dayItems, dayRatio, floatItems, timedItems, type DayItem } from '../lib/day'
import { hm, longDur, lunar, shortDur, sunOf, termLabel } from '../lib/cal'
import { linearGradient, ribbonGradient, xOf } from '../lib/ribbon'
import { placeBody, runLoop, World } from '../lib/physics'
import { applyLook } from '../lib/look'
import { useNowMin } from '../lib/clock'
import { TaskIcon } from '../lib/icons'
import { burstAt } from '../lib/fx'
import { WEEKDAY } from '../lib/dates'
import { cx } from '../components/ui'
import { DayRing } from '../home/Ticker'

export type CardAction = { type: 'open' } | { type: 'add' } | { type: 'task'; taskId: string; date: string }

interface Props {
  size: CardSize
  data: AppData
  progress: Record<string, AutoProgress>
  look: LookSettings
  fonts: ImportedFont[]
  /** 卡片窗口里：整张卡片可以拖动窗口 */
  windowed?: boolean
  fadeAway?: boolean
  onAction: (a: CardAction) => void
  onToggle: (item: DayItem) => void
  /** 卡片窗口里：右上角的关闭按钮 */
  onClose?: () => void
}

const RC = 2 * Math.PI * 42

function Ring(props: { p: number; t: string; l: string; small?: boolean }): React.JSX.Element {
  return (
    <div className={cx('wg-ring', props.small && 'sm')}>
      <svg viewBox="0 0 100 100">
        <circle className="ct" cx="50" cy="50" r="42" />
        <circle className="cv" cx="50" cy="50" r="42" strokeDasharray={RC} strokeDashoffset={RC * (1 - props.p)} />
      </svg>
      <div className="wr-t">
        <b className="tnum">{props.t}</b>
        <span>{props.l}</span>
      </div>
    </div>
  )
}

/** 中卡的小圆点、侧栏的小药丸：和首页用同一套失重碰撞 */
function useFloaters(opts: {
  box: React.RefObject<HTMLDivElement | null>
  items: DayItem[]
  statics: (W: number, H: number) => { l: number; r: number; t: number; b: number }[]
  lanes: (H: number) => [number, number]
  cruise: number
  g: number
  gravity: boolean
  speed: number
  paused: boolean
}): Map<string, HTMLElement> {
  const world = useRef(new World()).current
  const els = useRef(new Map<string, HTMLElement>()).current
  const [size, setSize] = useState({ w: 0, h: 0 })
  const mul = useRef(1)
  mul.current = opts.paused ? 0 : opts.speed

  useLayoutEffect(() => {
    const el = opts.box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [opts.box])

  useLayoutEffect(() => {
    if (!size.w) return
    world.W = size.w
    world.H = size.h
    world.g = opts.g
    world.statics = opts.statics(size.w, size.h)
    const keys = new Set(opts.items.map((i) => i.key))
    world.bodies = world.bodies.filter((b) => keys.has(b.id))
    const fresh = opts.items
      .filter((i) => !world.get(i.key))
      .map((i) => {
        const el = els.get(i.key)
        return { id: i.key, w: el?.offsetWidth ?? 8, h: el?.offsetHeight ?? 8, sunk: opts.gravity && i.done }
      })
    world.place(fresh, opts.lanes(size.h), opts.cruise)
    for (const b of world.bodies) {
      const el = els.get(b.id)
      if (el) {
        b.w = el.offsetWidth
        b.h = el.offsetHeight
      }
    }
    world.clampAll()
    const T = performance.now() / 1000
    for (const i of opts.items) world.setSunk(i.key, opts.gravity && i.done, T)
  })

  useEffect(
    () =>
      runLoop(
        (T) => world.step(T, mul.current),
        (T) => {
          for (const b of world.bodies) {
            const el = els.get(b.id)
            if (el) placeBody(b, el, T)
          }
        }
      ),
    [world, els]
  )
  return els
}

export function DeskCard(props: Props): React.JSX.Element {
  const { size, data, progress, look } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const ribRef = useRef<HTMLDivElement>(null)
  const poolRef = useRef<HTMLDivElement>(null)
  const tlRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [tlH, setTlH] = useState(0)
  const { min: m, today } = useNowMin()
  const items = useMemo(() => dayItems(data, progress, today), [data, progress, today])
  const timed = useMemo(() => timedItems(items), [items])
  const floats = useMemo(() => floatItems(items), [items])
  const sun = useMemo(() => sunOf(today), [today])
  const grad = useMemo(() => ribbonGradient('90deg', 24, sun, look.night), [sun, look.night])
  const paused = !!props.fadeAway && !hover

  useLayoutEffect(() => {
    if (rootRef.current) applyLook(rootRef.current, look, props.fonts)
  }, [look, props.fonts])

  useLayoutEffect(() => {
    const el = tlRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTlH(el.clientHeight))
    ro.observe(el)
    setTlH(el.clientHeight)
    return () => ro.disconnect()
  }, [size])

  const dotEls = useFloaters({
    box: ribRef,
    items: size === 'm' ? floats : [],
    statics: (W) => timed.map((i) => ({ l: xOf(i.start!) * W, r: xOf(i.end!) * W - 2, t: 20, b: 36 })),
    lanes: (H) => [9, H - 9],
    cruise: 0.16,
    g: 0.35,
    gravity: look.gravity,
    speed: look.floatSpeed,
    paused
  })
  const pillEls = useFloaters({
    box: poolRef,
    items: size === 'side' ? floats : [],
    statics: () => [],
    lanes: () => [38, 76],
    cruise: 0.22,
    g: 0.7,
    gravity: look.gravity,
    speed: look.floatSpeed,
    paused
  })

  const cur = timed.find((i) => !i.done && i.start! <= m && m < i.end!)
  const upcoming = timed.filter((i) => !i.done && i.start! > m)
  const next = upcoming[0]
  const anyLeft = floats.filter((i) => !i.done).length
  const head = cur ?? next

  // 环：进行中显示剩余，空闲时显示离下一项还有多久；都按分钟，不跳秒
  let ringP = 0
  let ringT = '—'
  let ringL = '空闲'
  if (cur) {
    ringP = (m - cur.start!) / (cur.end! - cur.start!)
    ringT = shortDur(cur.end! - m)
    ringL = '剩余'
  } else if (next) {
    ringT = shortDur(next.start! - m)
    ringL = '后开始'
  }
  const label = cur ? `正在 · ${cur.task.start}–${cur.task.end}` : next ? `下一项 · ${next.task.start}` : '接下来'
  const title = head ? (
    <b className="wg-title">
      {look.icons && <TaskIcon name={head.icon} size={15} />}
      <span>{head.task.title}</span>
    </b>
  ) : (
    <b className="wg-title">
      <span>{items.length ? '安排都完成了' : '今天还没有安排'}</span>
    </b>
  )
  const doneBtn = cur ? (
    <button
      className="wg-done fx no-drag"
      onClick={(e) => {
        e.stopPropagation()
        burstAt(e)
        props.onToggle(cur)
      }}
    >
      完成
    </button>
  ) : null
  const addBtn = (
    <button
      className="wg-add fx no-drag"
      onClick={(e) => {
        e.stopPropagation()
        props.onAction({ type: 'add' })
      }}
      title="新建"
      aria-label="新建"
    >
      <Plus size={13} strokeWidth={2.6} />
    </button>
  )
  const d = fromKey(today)

  let body: React.JSX.Element
  if (size === 's') {
    const after = cur ? upcoming[0] : upcoming[1]
    body = (
      <div className="wg-s">
        <Ring p={ringP} t={ringT} l={ringL} />
        <div className="wg-main">
          <span className="wg-cap">{label}</span>
          {title}
          <span className="wg-cap">{after ? `之后 ${after.task.start} ${after.task.title}` : anyLeft ? `还有 ${anyLeft} 项随时可做` : '之后没有安排'}</span>
        </div>
        <div className="wg-line" style={{ background: grad }}>
          {timed.map((i) => (
            <i key={i.key} className={cx(i.done && 'done', i === cur && 'cur')} style={{ left: `${xOf(i.start!) * 100}%`, width: `${(xOf(i.end!) - xOf(i.start!)) * 100}%` }} />
          ))}
          <i className="nw" style={{ left: `${xOf(m) * 100}%` }} />
        </div>
      </div>
    )
  } else if (size === 'm') {
    const nx = cur ? upcoming.slice(0, 2) : upcoming.slice(1, 3)
    body = (
      <div className="wg-m">
        <div className={cx('wm-top', props.windowed && 'drag')}>
          <span className="wg-cap">
            {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAY[d.getDay()]} · {lunar(d)}
          </span>
          {addBtn}
        </div>
        <div className="wm-now">
          <Ring p={ringP} t={ringT} l={ringL} small />
          <div className="wm-txt">
            <span className="wg-cap">{label}</span>
            {title}
          </div>
          {doneBtn}
        </div>
        <div className="wm-rib" ref={ribRef} style={{ background: grad }}>
          <i className="pst" style={{ width: `${xOf(m) * 100}%` }} />
          {timed.map((i) => (
            <i key={i.key} className={cx('b', i.done && 'done', i === cur && 'cur')} style={{ left: `${xOf(i.start!) * 100}%`, width: `calc(${(xOf(i.end!) - xOf(i.start!)) * 100}% - 2px)` }} />
          ))}
          <i className="nw" style={{ left: `${xOf(m) * 100}%` }} />
          {floats.map((f) => (
            <i
              key={f.key}
              ref={(el) => {
                if (el) dotEls.set(f.key, el)
                else dotEls.delete(f.key)
              }}
              className={cx('fdot', f.done && 'done')}
              title={f.task.title}
            />
          ))}
        </div>
        <div className="wm-axis tnum">
          {[6, 12, 18, 24].map((h) => (
            <span key={h} style={{ left: `${xOf(h * 60) * 100}%` }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        <div className="wm-next">
          {nx.length
            ? nx.map((t, k) => (
                <span key={t.key}>
                  {k > 0 && <span className="wm-sep">·</span>}
                  <b className="tnum">{t.task.start}</b>
                  {t.task.title}
                </span>
              ))
            : anyLeft
              ? `随时可做 ${anyLeft} 项`
              : '之后没有安排'}
        </div>
      </div>
    )
  } else {
    // 侧栏：竖向时间轴，只画「前 1 小时 + 后 7 小时」，随时间往下滚
    const span = 480
    const m0 = Math.floor(m / 60) * 60 - 60
    const m1 = m0 + span
    const y = (x: number): number => ((x - m0) / span) * tlH
    const hours: number[] = []
    for (let h = m0 + 60; h < m1; h += 60) hours.push(h)
    const gaps: { g0: number; g1: number; d: number }[] = []
    let prevEnd: number | null = null
    for (const i of timed) {
      if (prevEnd !== null && i.start! - prevEnd >= 45) gaps.push({ g0: Math.max(prevEnd, m0), g1: Math.min(i.start!, m1), d: i.start! - prevEnd })
      prevEnd = Math.max(prevEnd ?? 0, i.end!)
    }
    const dow = (d.getDay() + 7 - data.settings.weekStart) % 7
    body = (
      <div className="wg-side">
        <div className={cx('ws-head', props.windowed && 'drag')}>
          <div>
            <b>
              {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAY[d.getDay()]}
            </b>
            <span className="wg-cap">
              {lunar(d)} · {termLabel(d)}
            </span>
          </div>
          {addBtn}
        </div>
        <div className="ws-clock tnum">{hm(m)}</div>
        <div className="ws-now">
          <span className="wg-cap">{cur ? `正在 · 还剩 ${longDur(cur.end! - m)}` : next ? `下一项 · ${next.task.start} · ${longDur(next.start! - m)}后` : '接下来'}</span>
          <div className="row">
            {title}
            {doneBtn}
          </div>
          <div className="ws-bar" style={{ visibility: cur ? 'visible' : 'hidden' }}>
            <i style={{ width: `${ringP * 100}%` }} />
          </div>
        </div>
        <div className="ws-tl" ref={tlRef} style={{ background: linearGradient('180deg', m0, m1, 8, sun, look.night) }}>
          {tlH > 0 && (
            <>
              <i className="pst" style={{ height: y(m) }} />
              {hours.map((h) => (
                <div key={h} className="hr" style={{ top: y(h) }}>
                  <span className="tnum">{String(((h / 60) % 24 + 24) % 24).padStart(2, '0')}</span>
                </div>
              ))}
              {gaps
                .filter((g) => y(g.g1) - y(g.g0) >= 26)
                .map((g) => (
                  <div key={g.g0} className="gp" style={{ top: y(g.g0), height: y(g.g1) - y(g.g0) }}>
                    空 {longDur(g.d)}
                  </div>
                ))}
              {timed
                .filter((i) => i.end! > m0 && i.start! < m1)
                .map((i) => {
                  const top = y(Math.max(i.start!, m0)) + 1
                  const hgt = y(Math.min(i.end!, m1)) - top - 2
                  const isCur = i === cur
                  return (
                    <button
                      key={i.key}
                      className={cx('b fx no-drag', i.done && 'done', isCur && 'cur')}
                      style={{ top, height: hgt }}
                      title={`${i.task.start}–${i.task.end} ${i.task.title}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onAction({ type: 'task', taskId: i.task.id, date: i.date })
                      }}
                    >
                      {isCur && <i className="fill" style={{ height: `${ringP * 100}%` }} />}
                      {hgt >= 18 && (
                        <b>
                          {look.icons && <TaskIcon name={i.icon} size={12} />}
                          {i.task.title}
                        </b>
                      )}
                      {hgt >= 38 && (
                        <span className="tnum">
                          {i.task.start}–{i.task.end}
                        </span>
                      )}
                    </button>
                  )
                })}
              <div className="nw" style={{ top: y(m) }} />
            </>
          )}
        </div>
        <div className="ws-pool" ref={poolRef}>
          <span className="cap">随时 · {anyLeft} 项</span>
          {floats.map((f) => (
            <button
              key={f.key}
              ref={(el) => {
                if (el) pillEls.set(f.key, el)
                else pillEls.delete(f.key)
              }}
              className={cx('fpill fx no-drag', f.done && 'done')}
              title="点一下完成 / 取消完成"
              onClick={(e) => {
                e.stopPropagation()
                if (!f.done) burstAt(e)
                props.onToggle(f)
              }}
            >
              {look.icons && <TaskIcon name={f.icon} size={13} />}
              {f.task.title}
            </button>
          ))}
        </div>
        <div className="ws-week">
          {Array.from({ length: 7 }, (_, i) => {
            const key = addDays(today, i - dow)
            return (
              <div key={key} className={cx('wd2', key === today && 'today')}>
                <DayRing r={dayRatio(data, progress, key)} size={22} />
                {WEEKDAY[fromKey(key).getDay()].slice(1)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={cx('widget', props.windowed && 'windowed', paused && 'faded')}
      data-size={size}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={() => size === 's' && props.onAction({ type: 'open' })}
      title={size === 's' ? '打开简程' : undefined}
    >
      {props.windowed && <i className="grip drag" title="拖动这里移动卡片" />}
      {props.onClose && (
        <button
          className="wg-close fx no-drag"
          title="收起桌角卡片"
          aria-label="收起桌角卡片"
          onClick={(e) => {
            e.stopPropagation()
            props.onClose!()
          }}
        >
          <X size={12} strokeWidth={2.6} />
        </button>
      )}
      {body}
    </div>
  )
}
