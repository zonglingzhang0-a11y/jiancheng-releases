import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, fromKey, todayKey } from '@shared/schedule'
import { useStore } from '../store'
import { WEEKDAY } from '../lib/dates'
import { MonitorView } from '../views/MonitorView'

export function MonitorPage(): React.JSX.Element {
  const cursor = useStore((s) => s.cursor)
  const setCursor = useStore((s) => s.setCursor)
  const d = fromKey(cursor)
  const isToday = cursor === todayKey()
  return (
    <div className="mon-page">
      <div className="mon-head">
        <div>
          <h1>智能监测</h1>
          <p>记录前台应用和窗口标题，用来自动完成日程。数据只保存在这台电脑上。</p>
        </div>
        <span className="sp" />
        <div className="daynav">
          <button className="ic fx" onClick={() => setCursor(addDays(cursor, -1))} aria-label="前一天">
            <ChevronLeft size={16} />
          </button>
          <b className="tnum">
            {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAY[d.getDay()]}
          </b>
          <button className="ic fx" onClick={() => setCursor(addDays(cursor, 1))} disabled={isToday} aria-label="后一天">
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button className="btn soft sm fx" onClick={() => setCursor(todayKey())}>
              今天
            </button>
          )}
        </div>
      </div>
      <MonitorView />
    </div>
  )
}
