import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { fromMin, toMin } from '@shared/schedule'
import { dayTitle, durationLabel, relativeLabel, WEEKDAY, weekdayOf } from '../lib/dates'
import { MiniCalendar } from './MiniCalendar'
import { Popover, useAnchor } from './Popover'
import { cx } from './ui'

/** 解析用户输入的时间：9、930、9:30、21：05、9.5 */
export function parseTime(input: string): string | null {
  const s = input.trim().replace('：', ':').replace('.', ':')
  let h: number
  let m = 0
  if (/^\d{1,2}$/.test(s)) h = Number(s)
  else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, s.length - 2))
    m = Number(s.slice(-2))
  } else if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [a, b] = s.split(':')
    h = Number(a)
    m = Number(b.length === 1 ? `${b}0` : b)
  } else return null
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null
  return fromMin(h * 60 + m)
}

export function TimeSelect(props: {
  value: string
  /** 选中的选项；nextDay 表示选的是「次日」的时间 */
  onChange: (v: string, nextDay: boolean) => void
  /** 作为结束时间时传入开始时间，用于显示时长并限制选项 */
  after?: string
  /** 结束时间可以一直选到次日同一时刻（跨过午夜） */
  overnight?: boolean
  /** 当前结束时间是否在次日，用来高亮正确的那一项 */
  valueNextDay?: boolean
  disabled?: boolean
}): React.JSX.Element {
  const a = useAnchor()
  const listRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')

  // 选项的分钟数可以超过 1440，表示次日
  const options = useMemo(() => {
    const list: number[] = []
    const from = props.after ? toMin(props.after) + 15 : 0
    const to = props.after ? (props.overnight ? toMin(props.after) + 24 * 60 : 24 * 60) : 24 * 60 - 15
    for (let m = from; m <= to; m += 15) list.push(m)
    return list
  }, [props.after, props.overnight])
  const current = toMin(props.value) + (props.valueNextDay ? 1440 : 0)

  useEffect(() => {
    if (!a.open) return
    setText('')
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>('.selected')
      if (el && listRef.current) listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2 + 16
    })
  }, [a.open])

  const pick = (m: number): void => {
    // 24:00 仍算当天结束；再往后才是次日
    const next = m > 1440
    props.onChange(fromMin(next ? m - 1440 : m), next)
    a.close()
  }
  const commitText = (v: string | null): void => {
    if (!v) return
    let m = toMin(v)
    if (props.after) {
      const s = toMin(props.after)
      if (m <= s) {
        if (!props.overnight) return
        m += 1440
      }
    }
    pick(m)
  }

  return (
    <>
      <button ref={a.ref} className={cx('field-btn tnum', a.open && 'open')} onClick={a.toggle} disabled={props.disabled}>
        {props.value}
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={props.after ? 176 : 120}>
        <input
          className="input time-input tnum"
          autoFocus
          placeholder="输入时间"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText(parseTime(text))
          }}
        />
        <div className="time-list" ref={listRef}>
          {options.map((m, i) => (
            <Fragment key={m}>
              {m > 1440 && (i === 0 || options[i - 1] <= 1440) && <div className="menu-label">次日</div>}
              <button className={cx('menu-item tnum', m === current && 'selected')} onClick={() => pick(m)}>
                <span>{fromMin(m > 1440 ? m - 1440 : m)}</span>
                {props.after && <span className="menu-meta">{durationLabel(m - toMin(props.after))}</span>}
              </button>
            </Fragment>
          ))}
        </div>
      </Popover>
    </>
  )
}

export function DatePicker(props: {
  value: string
  onChange: (v: string) => void
  weekStart: number
  prefix?: string
  /** 最早能选的日期（选了更早的就按这一天算），用于结束日期 */
  min?: string
}): React.JSX.Element {
  const a = useAnchor()
  const rel = relativeLabel(props.value)
  return (
    <>
      <button ref={a.ref} className={cx('field-btn', a.open && 'open')} onClick={a.toggle}>
        <CalendarDays size={14} className="chev" />
        <span>
          {props.prefix && <span className="field-rel">{props.prefix} </span>}
          {dayTitle(props.value)} {WEEKDAY[weekdayOf(props.value)]}
          {rel && <span className="field-rel"> · {rel}</span>}
        </span>
        <ChevronDown size={14} className="chev" />
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={252}>
        <div style={{ padding: '6px 6px 2px' }}>
          <MiniCalendar
            value={props.value}
            weekStart={props.weekStart}
            onSelect={(d) => {
              props.onChange(props.min && d < props.min ? props.min : d)
              a.close()
            }}
          />
        </div>
      </Popover>
    </>
  )
}
