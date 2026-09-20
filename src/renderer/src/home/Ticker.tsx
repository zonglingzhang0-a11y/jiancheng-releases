import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { addDays, fromKey, todayKey } from '@shared/schedule'
import { useStore } from '../store'
import { dayItems, dayRatio, spansIn, timedItems, type SpanRange } from '../lib/day'
import { sunOf } from '../lib/cal'
import { linearGradient, ribbonGradient, xOf } from '../lib/ribbon'
import { monthMatrix, sameMonth, WEEKDAY_SHORT, weekDates } from '../lib/dates'
import { cx } from '../components/ui'

const CN_MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

/**
 * 跨天的事：一周以内的画大框（最多三行），一周以上的合并成一根虚线，
 * 深浅表示那天有几件在进行；鼠标停在清单里某条长期事上时，它盖住的那几天会亮起来
 */
function SpanRows({ dates, spans }: { dates: string[]; spans: SpanRange[] }): React.JSX.Element | null {
  const hot = useStore((s) => s.hotSpan)
  const setHotSpan = useStore((s) => s.setHotSpan)
  const first = dates[0]
  const last = dates[dates.length - 1]
  const inRow = spans.filter((s) => s.e >= first && s.s <= last)
  const short = inRow.filter((s) => s.totalDays <= 7)
  const long = inRow.filter((s) => s.totalDays > 7)
  const shown = short.slice(0, 3)
  const more = short.length - shown.length
  const counts = dates.map((d) => long.filter((s) => d >= s.s && d <= s.e).length)
  const hotDays = (d: string): boolean => {
    const s = inRow.find((x) => x.key === hot)
    return !!s && d >= s.s && d <= s.e
  }
  if (!shown.length && !counts.some((c) => c)) return null
  return (
    <div className="spanrows">
      {shown.map((s) => {
        const a = Math.max(0, dates.indexOf(s.s))
        const z = s.e > last ? dates.length - 1 : dates.indexOf(s.e)
        return (
          <div key={s.key} className="spanrow">
            <span
              className={cx('spanbox', s.s < first && 'cut-l', s.e > last && 'cut-r', s.done && 'done', hot === s.key && 'hot')}
              style={{ gridColumn: `${a + 1} / span ${Math.max(1, z - a + 1)}` }}
              onMouseEnter={() => setHotSpan(s.key)}
              onMouseLeave={() => setHotSpan(null)}
              title={`${s.task.title} · ${s.totalDays} 天`}
            >
              {s.task.title}
            </span>
          </div>
        )
      })}
      {more > 0 && <div className="spanmore tnum">还有 {more} 项</div>}
      {counts.some((c) => c > 0) && (
        <div className="spanline" title={long.map((s) => s.task.title).join('、')}>
          {counts.map((c, i) => (
            <i key={dates[i]} className={cx(`lv${Math.min(4, c)}`, hotDays(dates[i]) && 'hot')} />
          ))}
        </div>
      )}
    </div>
  )
}

export function DayRing(props: { r: number | null; size?: number }): React.JSX.Element {
  const C = 2 * Math.PI * 9
  return (
    <span className={cx('dring', props.r === null && 'future')} style={props.size ? { width: props.size, height: props.size } : undefined}>
      <svg viewBox="0 0 24 24">
        <circle className="tr" cx="12" cy="12" r="9" />
        {props.r !== null && <circle className="vl" cx="12" cy="12" r="9" strokeDasharray={C} strokeDashoffset={C * (1 - props.r)} />}
      </svg>
    </span>
  )
}

export function Ticker(): React.JSX.Element {
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const cursor = useStore((s) => s.cursor)
  const setCursor = useStore((s) => s.setCursor)
  const drawer = useStore((s) => s.drawer)
  const setDrawer = useStore((s) => s.setDrawer)
  const night = data.settings.look.night
  const weekStart = data.settings.weekStart
  const today = todayKey()
  const tkRef = useRef<HTMLDivElement>(null)

  // 以今天为中心前后各两周；选中的日子超出范围时以它为中心
  const center = Math.abs(fromKey(cursor).getTime() - fromKey(today).getTime()) > 12 * 86400000 ? cursor : today
  const days = useMemo(() => Array.from({ length: 29 }, (_, i) => addDays(center, i - 14)), [center])
  const grad = useMemo(() => ribbonGradient('90deg', 24, sunOf(today), night), [today, night])

  const info = useMemo(() => {
    const map = new Map<string, { n: number; r: number | null; ticks: { l: number; w: number; done: boolean }[] }>()
    for (const d of days) {
      const items = dayItems(data, progress, d)
      map.set(d, {
        n: items.length,
        r: dayRatio(data, progress, d),
        ticks: timedItems(items).map((i) => ({ l: xOf(i.start!), w: Math.max(0.02, xOf(i.end!) - xOf(i.start!)), done: i.done }))
      })
    }
    return map
  }, [days, data, progress])

  const monthPct = useMemo(() => {
    const d = fromKey(today)
    let sum = 0
    let n = 0
    for (let i = 1; i <= d.getDate(); i++) {
      const key = addDays(today, i - d.getDate())
      sum += dayRatio(data, progress, key) ?? 0
      n++
    }
    return Math.round((sum / Math.max(1, n)) * 100)
  }, [today, data, progress])

  useLayoutEffect(() => {
    const el = tkRef.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)
    const tk = tkRef.current
    if (el && tk) tk.scrollTo({ left: el.offsetLeft - tk.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' })
  }, [cursor, days])

  // 首次打开时不做滚动动画
  useEffect(() => {
    const el = tkRef.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)
    const tk = tkRef.current
    if (el && tk) tk.scrollLeft = el.offsetLeft - tk.clientWidth / 2 + el.offsetWidth / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cd = fromKey(cursor)
  return (
    <footer className="month">
      <div className="month-head">
        <span className="m">{CN_MONTH[cd.getMonth()]}月</span>
        <span className="tnum">本月完成 {monthPct}%</span>
        <div className="seg" role="tablist">
          <button className={cx('fx', drawer === 'week' && 'on')} onClick={() => setDrawer(drawer === 'week' ? null : 'week')} title="展开这一周（W）">
            周
          </button>
          <button className={cx('fx', drawer === 'month' && 'on')} onClick={() => setDrawer(drawer === 'month' ? null : 'month')} title="展开这个月（M）">
            月
          </button>
        </div>
        <span className="sp" />
        <span className="hint">← → 切换日期</span>
      </div>
      <div className="ticker" ref={tkRef}>
        {days.map((d) => {
          const dt = fromKey(d)
          const it = info.get(d)!
          const dow = dt.getDay()
          return (
            <button
              key={d}
              data-day={d}
              className={cx('tk fx', d === today && 'today', d === cursor && 'sel', (dow === 0 || dow === 6) && 'weekend')}
              onClick={() => setCursor(d)}
              aria-label={`${dt.getMonth() + 1}月${dt.getDate()}日`}
            >
              <span className="tk-top">
                <span>{d === today ? '今天' : `周${WEEKDAY_SHORT[dow]}`}</span>
                <b className="tnum">{dt.getDate()}</b>
              </span>
              <span className="tk-bar" style={{ background: grad }}>
                {it.ticks.map((t, i) => (
                  <i key={i} style={{ left: `${t.l * 100}%`, width: `${t.w * 100}%`, opacity: t.done ? 0.35 : 1 }} />
                ))}
              </span>
              <span className="tk-bot">
                <span className="tnum">{it.n ? `${it.n} 项` : '空'}</span>
                <DayRing r={it.r} size={14} />
              </span>
            </button>
          )
        })}
      </div>
      <div className={cx('drawer', drawer && 'open')}>
        <div>{drawer === 'week' ? <WeekDrawer weekStart={weekStart} night={night} /> : drawer === 'month' ? <MonthDrawer weekStart={weekStart} /> : null}</div>
      </div>
    </footer>
  )
}

function WeekDrawer(props: { weekStart: number; night: number }): React.JSX.Element {
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const cursor = useStore((s) => s.cursor)
  const setCursor = useStore((s) => s.setCursor)
  const today = todayKey()
  const dates = weekDates(cursor, props.weekStart)
  const spans = useMemo(() => spansIn(data, dates[0], dates[6]), [data, dates])
  const grad = useMemo(() => linearGradient('180deg', 0, 1440, 16, sunOf(today), props.night), [today, props.night])
  // 竖向画满一整天，用和色带一样的压缩刻度：夜里压窄、白天展开；
  // 跨午夜的日程在前一天底部和第二天顶部各占一段
  const y = (m: number): number => xOf(m)
  return (
    <>
    <div className="week">
      {dates.map((d) => {
        const items = timedItems(dayItems(data, progress, d))
        const dt = fromKey(d)
        return (
          <button key={d} className={cx('wd fx', d === today && 'today', d === cursor && 'sel')} onClick={() => setCursor(d)}>
            <span className="wl">
              <span>周{WEEKDAY_SHORT[dt.getDay()]}</span>
              <b className="tnum">{dt.getDate()}</b>
            </span>
            <span className="wbar" style={{ background: grad }}>
              {items.map((i) => (
                <i
                  key={i.key}
                  className={cx(i.part !== 'whole' && 'cross')}
                  title={i.task.title}
                  style={{ top: `${y(i.start!) * 100}%`, height: `${Math.max(2.5, (y(i.end!) - y(i.start!)) * 100)}%`, opacity: i.done ? 0.4 : 1 }}
                />
              ))}
            </span>
            <span className="wn tnum">{items.length ? `${items.length} 个日程` : ' '}</span>
          </button>
        )
      })}
    </div>
    <SpanRows dates={dates} spans={spans} />
    </>
  )
}

function MonthDrawer(props: { weekStart: number }): React.JSX.Element {
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const cursor = useStore((s) => s.cursor)
  const setCursor = useStore((s) => s.setCursor)
  const today = todayKey()
  const cells = monthMatrix(cursor, props.weekStart)
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  const spans = useMemo(() => spansIn(data, cells[0], cells[cells.length - 1]), [data, cells])
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(i + props.weekStart) % 7])
  return (
    <div className="mwrap">
      <div className="mgrid">
        {heads.map((h) => (
          <div key={h} className="mh">
            {h}
          </div>
        ))}
      </div>
      {weeks.map((row) => (
        <div key={row[0]} className="mweek">
          <div className="mgrid">
            {row.map((d) => {
              const inMonth = sameMonth(d, cursor)
              const n = inMonth ? dayItems(data, progress, d).filter((i) => i.part !== 'tail').length : 0
              return (
                <button key={d} className={cx('md fx', !inMonth && 'out', d === today && 'today', d === cursor && 'sel')} onClick={() => setCursor(d)} disabled={!inMonth}>
                  {inMonth && <DayRing r={dayRatio(data, progress, d)} size={18} />}
                  <span className="tnum">{fromKey(d).getDate()}</span>
                  {n > 0 && <em className="tnum">{n}</em>}
                </button>
              )
            })}
          </div>
          <SpanRows dates={row} spans={spans} />
        </div>
      ))}
    </div>
  )
}
