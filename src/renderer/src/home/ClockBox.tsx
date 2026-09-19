import { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { fromKey, pad, todayKey } from '@shared/schedule'
import type { ClockStyle } from '@shared/types'
import { useStore } from '../store'
import { floatItems, timedItems, type DayItem } from '../lib/day'
import { useNowSec } from '../lib/clock'
import { hm, longDur } from '../lib/cal'
import { TaskIcon } from '../lib/icons'
import { burstAt } from '../lib/fx'
import { WEEKDAY } from '../lib/dates'

/* ---------- 钟面 ---------- */
const SEGS = (() => {
  const H = (cx: number, cy: number, w: number): string =>
    `${cx - w / 2},${cy} ${cx - w / 2 + 5},${cy - 5} ${cx + w / 2 - 5},${cy - 5} ${cx + w / 2},${cy} ${cx + w / 2 - 5},${cy + 5} ${cx - w / 2 + 5},${cy + 5}`
  const V = (cx: number, cy: number, h: number): string =>
    `${cx},${cy - h / 2} ${cx + 5},${cy - h / 2 + 5} ${cx + 5},${cy + h / 2 - 5} ${cx},${cy + h / 2} ${cx - 5},${cy + h / 2 - 5} ${cx - 5},${cy - h / 2 + 5}`
  return { a: H(32, 7, 40), b: V(54, 29.5, 41), c: V(54, 74.5, 41), d: H(32, 97, 40), e: V(10, 74.5, 41), f: V(10, 29.5, 41), g: H(32, 52, 40) }
})()
const DIG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg']

function SegDigit({ v }: { v: string }): React.JSX.Element {
  return (
    <svg className="sdig" viewBox="0 0 64 104" aria-hidden>
      <g transform="skewX(-6) translate(6 0)">
        {Object.entries(SEGS).map(([k, p]) => (
          <polygon key={k} points={p} className={DIG[+v]?.includes(k) ? 'on' : undefined} />
        ))}
      </g>
    </svg>
  )
}

/** 翻页数字：数值变化时换 key 触发翻动动画 */
function FlipCard({ v }: { v: string }): React.JSX.Element {
  return (
    <span className="fcard">
      <span key={v} className="fcard-v">
        {v}
      </span>
    </span>
  )
}

export function Clock(props: { sec: number; style: ClockStyle; seconds: boolean; onClick?: () => void }): React.JSX.Element {
  const hh = pad(Math.floor(props.sec / 3600) % 24)
  const mm = pad(Math.floor((props.sec % 3600) / 60))
  const ss = pad(Math.floor(props.sec % 60))
  const sec = <span className="sec tnum">{props.seconds ? ss : ''}</span>
  let body: React.JSX.Element
  if (props.style === 'flip')
    body = (
      <span className="flip-wrap">
        <FlipCard v={hh[0]} />
        <FlipCard v={hh[1]} />
        <span className="fl-colon">
          <i />
          <i />
        </span>
        <FlipCard v={mm[0]} />
        <FlipCard v={mm[1]} />
      </span>
    )
  else if (props.style === 'seg')
    body = (
      <span className="seg-wrap">
        <SegDigit v={hh[0]} />
        <SegDigit v={hh[1]} />
        <span className="s-colon">
          <i />
          <i />
        </span>
        <SegDigit v={mm[0]} />
        <SegDigit v={mm[1]} />
      </span>
    )
  else
    body = (
      <>
        <span>{hh}</span>
        <span className="colon">:</span>
        <span>{mm}</span>
      </>
    )
  return (
    <button className="clock tnum" data-style={props.style} onClick={props.onClick} title={props.seconds ? '点击隐藏秒' : '点击显示秒'} aria-label={`现在 ${hh}:${mm}`}>
      {body}
      {sec}
    </button>
  )
}

/* ---------- 倒计时环 ---------- */
function CountRing(props: { left: number; total: number }): React.JSX.Element {
  const C = 2 * Math.PI * 44
  const h = Math.floor(props.left / 3600)
  const m = Math.floor((props.left % 3600) / 60)
  const s = Math.floor(props.left % 60)
  return (
    <div className="cring" aria-label="剩余时间">
      <svg viewBox="0 0 100 100">
        <circle className="ct" cx="50" cy="50" r="44" />
        <circle className="cv" cx="50" cy="50" r="44" strokeDasharray={C} strokeDashoffset={C * (1 - props.left / props.total)} />
      </svg>
      <div className="cr-txt">
        <b className="tnum">{h ? `${h}:${pad(m)}` : `${pad(m)}:${pad(s)}`}</b>
        <span>剩余</span>
      </div>
    </div>
  )
}

export function ClockBox(props: { items: DayItem[]; isToday: boolean }): React.JSX.Element {
  const look = useStore((s) => s.data.settings.look)
  const updateLook = useStore((s) => s.updateLook)
  const toggle = useStore((s) => s.toggle)
  const setCursor = useStore((s) => s.setCursor)
  const cursor = useStore((s) => s.cursor)
  const sec = useNowSec(1000)
  const m = sec / 60

  const timed = useMemo(() => timedItems(props.items), [props.items])
  const anyLeft = useMemo(() => floatItems(props.items).filter((i) => !i.done).length, [props.items])
  const cur = props.isToday ? timed.find((i) => !i.done && i.start! <= m && m < i.end!) : undefined
  const next = props.isToday ? timed.find((i) => !i.done && i.start! > m) : undefined

  let now: React.JSX.Element
  if (!props.isToday) {
    const d = fromKey(cursor)
    const done = props.items.filter((i) => i.done).length
    const past = cursor < todayKey()
    now = (
      <div className="now">
        <div className="now-label">
          {past ? '回看' : '预览'} · {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAY[d.getDay()]}
        </div>
        <div className="now-title">
          {props.items.length === 0 ? '这一天没有安排' : past ? `那天完成了 ${done} / ${props.items.length} 项` : `已经安排了 ${props.items.length} 项`}
        </div>
        <div className="now-meta">
          <button className="btn soft fx" onClick={() => setCursor(todayKey())}>
            回到今天
          </button>
        </div>
      </div>
    )
  } else if (cur) {
    const left = cur.end! * 60 - sec
    const total = (cur.end! - cur.start!) * 60
    const p = cur.progress
    now = (
      <div className="now">
        <div className="now-label">
          <i className="dot" />
          正在 · {cur.task.start}–{cur.task.end}
        </div>
        <div className="now-title">
          {look.icons && <TaskIcon name={cur.icon} size={22} />}
          <span>{cur.task.title}</span>
        </div>
        <div className="now-meta">
          <span>
            还剩 <b className="tnum">{longDur(left / 60)}</b>
          </span>
          {cur.task.auto?.enabled && p && (
            <span className="chip-soft">
              <Zap size={12} strokeWidth={2.4} />
              智能完成 {Math.round(Math.min(1, p.seconds / p.required) * 100)}%
            </span>
          )}
          <button
            className="btn primary fx"
            onClick={(e) => {
              burstAt(e)
              toggle(cur.task.id, cur.date)
            }}
          >
            完成
          </button>
        </div>
        {!look.ring && (
          <div className="now-bar">
            <i style={{ width: `${(1 - left / total) * 100}%` }} />
          </div>
        )}
      </div>
    )
    return (
      <section className="clockbox">
        <div className="clock-row">
          <Clock sec={sec} style={look.clock} seconds={look.seconds} onClick={() => updateLook({ seconds: !look.seconds })} />
          {look.ring && <CountRing left={left} total={total} />}
        </div>
        {now}
      </section>
    )
  } else if (next) {
    const until = next.start! - m
    now = (
      <div className="now">
        <div className="now-label">下一项 · {next.task.start}</div>
        <div className="now-title">
          {look.icons && <TaskIcon name={next.icon} size={22} />}
          <span>{next.task.title}</span>
        </div>
        <div className="now-meta">
          <span>
            <b className="tnum">{until < 60 ? `${Math.ceil(until)} 分钟后` : `${longDur(until)}后`}</b>开始
          </span>
          {anyLeft > 0 && <span className="chip-soft">空档里还有 {anyLeft} 项随时可做</span>}
        </div>
      </div>
    )
  } else {
    now = (
      <div className="now">
        <div className="now-label">{hm(m)} 之后</div>
        <div className="now-title">{anyLeft ? `还有 ${anyLeft} 项随时可做` : props.items.length ? '今天的安排都完成了' : '今天还没有安排'}</div>
      </div>
    )
  }

  return (
    <section className="clockbox">
      <div className="clock-row">
        <Clock sec={sec} style={look.clock} seconds={look.seconds} onClick={() => updateLook({ seconds: !look.seconds })} />
      </div>
      {now}
    </section>
  )
}

