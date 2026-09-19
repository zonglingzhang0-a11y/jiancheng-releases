import { useEffect, useMemo, useRef } from 'react'
import { Plus } from 'lucide-react'
import { fromKey, todayKey } from '@shared/schedule'
import { useStore } from '../store'
import { dayItems } from '../lib/day'
import { lunar, sunOf, termLabel } from '../lib/cal'
import { useNowMin } from '../lib/clock'
import { WEEKDAY } from '../lib/dates'
import { QuickInput, type QuickInputHandle } from '../components/QuickInput'
import { ClockBox } from './ClockBox'
import { Tree } from './Tree'
import { Ribbon } from './Ribbon'
import { Ticker } from './Ticker'

function HomeTop(props: { isToday: boolean }): React.JSX.Element {
  const cursor = useStore((s) => s.cursor)
  const setCursor = useStore((s) => s.setCursor)
  const openNew = useStore((s) => s.openNew)
  const notifyCreated = useStore((s) => s.notifyCreated)
  const openTask = useStore((s) => s.openTask)
  const quickFocus = useStore((s) => s.quickFocus)
  const quickRef = useRef<QuickInputHandle>(null)
  const d = fromKey(cursor)
  const rel = props.isToday ? null : cursor < todayKey() ? '回看' : '预览'

  useEffect(() => {
    if (quickFocus) quickRef.current?.focus()
  }, [quickFocus])

  return (
    <header className="h-top">
      <div className="datebox">
        <div className="d1 tnum">
          <b>
            {d.getMonth() + 1}月{d.getDate()}日
          </b>
          <span className="wk">{WEEKDAY[d.getDay()]}</span>
          {rel && <span className="rel">{rel}</span>}
        </div>
        <div className="d2">
          <span>{lunar(d)}</span>
          <span className="term">{termLabel(d)}</span>
        </div>
      </div>
      <div className="h-quick">
        <QuickInput
          ref={quickRef}
          date={cursor}
          placeholder={props.isToday ? '一句话添加，如「下午3点 开会」「每天 背单词 30分钟 @不背单词」' : `一句话添加到 ${d.getMonth() + 1}月${d.getDate()}日`}
          onCreated={notifyCreated}
          onDetail={(task) => openTask(task, task.date)}
        />
      </div>
      <div className="h-actions">
        {!props.isToday && (
          <button className="btn soft fx" onClick={() => setCursor(todayKey())}>
            回到今天
          </button>
        )}
        <button className="btn primary fx" onClick={() => openNew()} title="新建日程（Ctrl + N）">
          <Plus size={15} strokeWidth={2.4} />
          新建
        </button>
      </div>
    </header>
  )
}

export function Home(): React.JSX.Element {
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const cursor = useStore((s) => s.cursor)
  const { min, today } = useNowMin()
  const isToday = cursor === today
  const items = useMemo(() => dayItems(data, progress, cursor), [data, progress, cursor])
  const sun = useMemo(() => sunOf(cursor), [cursor])

  return (
    <div className="home">
      <HomeTop isToday={isToday} />
      <ClockBox items={items} isToday={isToday} />
      <Tree items={items} />
      <Ribbon items={items} isToday={isToday} nowMin={min} sun={sun} />
      <Ticker />
    </div>
  )
}
