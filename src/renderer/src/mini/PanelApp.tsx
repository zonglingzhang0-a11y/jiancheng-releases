// 快捷面板：托盘图标 / 全局快捷键呼出，一句话添加、看今天、勾选
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Maximize2, PanelRight, Settings2 } from 'lucide-react'
import { fromKey } from '@shared/schedule'
import { api } from '../lib/api'
import { WEEKDAY } from '../lib/dates'
import { useStore } from '../store'
import { carriedLabel, dayItems, floatItems, startLabel, timedItems, type DayItem } from '../lib/day'
import { useNowMin } from '../lib/clock'
import { longDur, lunar } from '../lib/cal'
import { TaskIcon } from '../lib/icons'
import { burstAt } from '../lib/fx'
import { QuickInput, type QuickInputHandle } from '../components/QuickInput'
import { Toast } from '../components/Toast'
import { AppIcon, cx } from '../components/ui'
import { Check } from '../home/Tree'

function Line({ item, now }: { item: DayItem; now: number }): React.JSX.Element {
  const toggle = useStore((s) => s.toggle)
  const icons = useStore((s) => s.data.settings.look.icons)
  const cur = !item.done && item.start !== null && item.start <= now && now < item.end!
  const missed = !item.done && item.end !== null && item.end <= now
  return (
    <div
      className={cx('pl-row fx', item.done && 'done', cur && 'cur')}
      role="button"
      tabIndex={0}
      onClick={() => api().showMain({ view: 'today', date: item.date, taskId: item.task.id })}
    >
      <Check
        on={item.done}
        onToggle={(e) => {
          if (!item.done) burstAt(e)
          toggle(item.task.id, item.date)
        }}
      />
      {item.task.start ? <span className="time tnum">{item.task.start}</span> : null}
      {icons && <TaskIcon name={item.icon} size={14} className="ico" />}
      <span className="ttl">{item.task.title}</span>
      {item.carried > 0 && <span className="tag-y">{carriedLabel(item.carried)}</span>}
      {cur && <span className="pl-cur">进行中</span>}
      {missed && <span className="pl-miss">已过</span>}
    </div>
  )
}

export function PanelApp(): React.JSX.Element {
  const init = useStore((s) => s.init)
  const ready = useStore((s) => s.ready)
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const monitor = useStore((s) => s.monitor)
  const hotkey = useStore((s) => s.hotkey)
  const notifyCreated = useStore((s) => s.notifyCreated)
  const { min, today } = useNowMin()
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef<QuickInputHandle>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    init()
    const off = api().onPanelShown(() => {
      listRef.current?.scrollTo({ top: 0 })
      setTimeout(() => inputRef.current?.focus(), 30)
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') api().hidePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [init])

  const items = useMemo(() => dayItems(data, progress, today), [data, progress, today])
  const timed = timedItems(items).filter((i) => !i.done)
  const floats = floatItems(items).filter((i) => !i.done)
  const done = items.filter((i) => i.done)
  const cur = timed.find((i) => i.start! <= min && min < i.end!)
  const next = timed.find((i) => i.start! > min)
  const ratio = items.length ? done.length / items.length : 0
  const C = 2 * Math.PI * 15
  const d = fromKey(today)
  const card = data.settings.card

  return (
    <div className="mini-shell">
      <div className="panel">
        <header className="pl-head">
          <span className="pl-ring" title={`完成 ${done.length} / ${items.length}`}>
            <svg viewBox="0 0 36 36">
              <circle className="tr" cx="18" cy="18" r="15" />
              <circle className="vl" cx="18" cy="18" r="15" strokeDasharray={C} strokeDashoffset={C * (1 - ratio)} />
            </svg>
            <b className="tnum">{done.length}</b>
          </span>
          <div className="pl-date">
            <b>
              {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAY[d.getDay()]}
            </b>
            <span>
              {lunar(d)} · 完成 {done.length} / {items.length}
            </span>
          </div>
          <span className="sp" />
          <button className={cx('ic fx', card.enabled && 'on')} title={card.enabled ? '隐藏桌角卡片' : '显示桌角卡片'} onClick={() => api().setCard({ enabled: !card.enabled })}>
            <PanelRight size={16} />
          </button>
          <button className="ic fx" title="设置" onClick={() => api().showMain({ settings: true })}>
            <Settings2 size={16} />
          </button>
          <button className="ic fx" title="打开简程" onClick={() => api().showMain({ view: 'today' })}>
            <Maximize2 size={15} />
          </button>
        </header>

        {ready && (
          <>
            <div className="pl-input">
              <QuickInput ref={inputRef} autoFocus onCreated={notifyCreated} onEscape={() => api().hidePanel()} />
            </div>
            {(cur || next) && (
              <div className="pl-now">
                <span className="pl-now-l">{cur ? `正在 · 还剩 ${longDur(cur.to - min)}` : `下一项 · ${startLabel(next!)} · ${longDur(next!.start! - min)}后`}</span>
                <b>{(cur ?? next)!.task.title}</b>
              </div>
            )}
            <div className="pl-list" ref={listRef}>
              {timed.length > 0 && (
                <div className="pl-group">
                  <div className="pl-label">定时</div>
                  {timed.map((i) => (
                    <Line key={i.key} item={i} now={min} />
                  ))}
                </div>
              )}
              {floats.length > 0 && (
                <div className="pl-group">
                  <div className="pl-label">随时</div>
                  {floats.map((i) => (
                    <Line key={i.key} item={i} now={min} />
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div className="pl-group">
                  <button className={cx('pl-done-toggle fx', showDone && 'open')} onClick={() => setShowDone((v) => !v)}>
                    <ChevronDown size={13} />
                    已完成 {done.length} 项
                  </button>
                  {showDone && done.map((i) => <Line key={i.key} item={i} now={min} />)}
                </div>
              )}
              {items.length === 0 && <div className="pl-empty">今天还没有安排，在上面写一句话就能添加</div>}
            </div>
          </>
        )}

        <footer className="pl-foot">
          <span className="pl-status">
            {monitor.enabled && monitor.current ? (
              <>
                <AppIcon exe={monitor.current.exe} name={monitor.current.name} size={14} />
                <span>{monitor.current.name}</span>
              </>
            ) : (
              <span>{monitor.enabled ? '监测中' : '监测已暂停'}</span>
            )}
          </span>
          {hotkey.ok && hotkey.accelerator && <kbd className="kbd">{hotkey.accelerator}</kbd>}
        </footer>
        <Toast placement="bottom" />
      </div>
    </div>
  )
}
