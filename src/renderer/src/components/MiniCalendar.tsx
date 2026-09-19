import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fromKey, todayKey } from '@shared/schedule'
import { addMonths, monthMatrix, monthTitle, sameMonth, WEEKDAY_SHORT } from '../lib/dates'
import { cx } from './ui'

export function MiniCalendar(props: {
  value: string
  onSelect: (date: string) => void
  weekStart: number
  hasMark?: (date: string) => boolean
  highlightWeek?: boolean
}): React.JSX.Element {
  const [month, setMonth] = useState(props.value)
  const today = todayKey()

  useEffect(() => {
    setMonth(props.value)
  }, [props.value])

  const cells = useMemo(() => monthMatrix(month, props.weekStart), [month, props.weekStart])
  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(i + props.weekStart) % 7])
  const selectedRow = props.highlightWeek ? Math.floor(cells.indexOf(props.value) / 7) : -1

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <span className="mini-cal-title">{monthTitle(month)}</span>
        <div className="mini-cal-nav">
          <button className="icon-btn sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="上个月">
            <ChevronLeft size={15} />
          </button>
          <button className="icon-btn sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="下个月">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="mini-cal-grid">
        {weekdays.map((w) => (
          <span key={w} className="mini-cal-wd">
            {w}
          </span>
        ))}
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className={cx('mini-cal-row', row === selectedRow && 'week-on')}>
            {cells.slice(row * 7, row * 7 + 7).map((d) => (
              <button
                key={d}
                className={cx(
                  'mini-cal-day tnum',
                  !sameMonth(d, month) && 'out',
                  d === today && 'today',
                  d === props.value && 'selected'
                )}
                onClick={() => props.onSelect(d)}
              >
                {fromKey(d).getDate()}
                {props.hasMark?.(d) && <i className="mini-cal-mark" />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
