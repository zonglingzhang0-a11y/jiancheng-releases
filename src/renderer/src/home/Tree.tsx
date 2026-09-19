import { useMemo, useState } from 'react'
import { ChevronRight, CircleDashed, Moon, Sun, Sunrise, Sunset, Zap, type LucideIcon } from 'lucide-react'
import { todayKey } from '@shared/schedule'
import { useStore } from '../store'
import { carriedLabel, type DayItem } from '../lib/day'
import { TaskIcon } from '../lib/icons'
import { burstAt } from '../lib/fx'
import { cx } from '../components/ui'

interface Folder {
  id: string
  name: string
  icon: LucideIcon
  /** 分钟范围 [from, to)；随时为 null */
  range: [number, number] | null
}

const FOLDERS: Folder[] = [
  { id: 'dawn', name: '晨', icon: Sunrise, range: [300, 660] },
  { id: 'day', name: '昼', icon: Sun, range: [660, 1020] },
  { id: 'dusk', name: '暮', icon: Sunset, range: [1020, 1200] },
  { id: 'night', name: '夜', icon: Moon, range: [1200, 1740] },
  { id: 'any', name: '随时', icon: CircleDashed, range: null }
]

const folderOf = (i: DayItem): string => {
  if (i.start === null) return 'any'
  const m = i.start < 300 ? i.start + 1440 : i.start
  return FOLDERS.find((f) => f.range && m >= f.range[0] && m < f.range[1])!.id
}

const OPEN_KEY = 'jc.tree.open'
function loadOpen(): Set<string> {
  try {
    const v = localStorage.getItem(OPEN_KEY)
    if (v) return new Set(JSON.parse(v))
  } catch {
    /* 读不到就用默认 */
  }
  return new Set(['dawn', 'day', 'dusk', 'night', 'any'])
}

export function Check(props: { on: boolean; small?: boolean; onToggle: (e: React.MouseEvent) => void; label?: string }): React.JSX.Element {
  return (
    <button
      className={cx('ck', props.on && 'on', props.small && 'sm')}
      role="checkbox"
      aria-checked={props.on}
      aria-label={props.label ?? (props.on ? '标记为未完成' : '标记为完成')}
      onClick={(e) => {
        e.stopPropagation()
        props.onToggle(e)
      }}
    >
      <svg viewBox="0 0 12 12">
        <path d="M2.5 6.3 5 8.6 9.6 3.6" />
      </svg>
    </button>
  )
}

function Item({ item, open, onOpen }: { item: DayItem; open: boolean; onOpen: () => void }): React.JSX.Element {
  const toggle = useStore((s) => s.toggle)
  const toggleSub = useStore((s) => s.toggleSub)
  const openTask = useStore((s) => s.openTask)
  const icons = useStore((s) => s.data.settings.look.icons)
  const subDone = item.subs.filter((s) => s.done).length
  const auto = item.task.auto?.enabled
  const p = item.progress
  return (
    <div className={cx('item', item.done && 'done', open && 'open')}>
      <div
        className="item-row"
        role="button"
        tabIndex={0}
        onClick={() => (item.subs.length ? onOpen() : openTask(item.task, item.date))}
        onDoubleClick={() => openTask(item.task, item.date)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openTask(item.task, item.date)
        }}
      >
        <Check
          on={item.done}
          onToggle={(e) => {
            if (!item.done) burstAt(e)
            toggle(item.task.id, item.date)
          }}
        />
        {item.task.start && <span className="time tnum">{item.task.start}</span>}
        {icons && <TaskIcon name={item.icon} size={14} className="ico" />}
        <span className="ttl">{item.task.title}</span>
        {item.carried > 0 && <span className="tag-y">{carriedLabel(item.carried)}</span>}
        {auto && !item.done && (
          <span className="auto-mark tnum" title={p ? p.detail : '智能完成'}>
            <Zap size={11} strokeWidth={2.4} />
            {p ? `${Math.round(Math.min(1, p.seconds / p.required) * 100)}%` : ''}
          </span>
        )}
        {item.subs.length > 0 && (
          <>
            <span className="sub-n tnum">
              {subDone}/{item.subs.length}
            </span>
            <ChevronRight size={14} className="chev" />
          </>
        )}
      </div>
      {item.subs.length > 0 && (
        <div className="subs">
          <div>
            {item.subs.map((s) => (
              <div key={s.id} className={cx('sub', s.done && 'done')}>
                <Check
                  small
                  on={s.done}
                  label="完成子待办"
                  onToggle={(e) => {
                    if (!s.done) burstAt(e)
                    toggleSub(item.task, s.id, item.date)
                  }}
                />
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Tree({ items }: { items: DayItem[] }): React.JSX.Element {
  const cursor = useStore((s) => s.cursor)
  const [open, setOpen] = useState(loadOpen)
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const groups = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    for (const i of items) {
      const f = folderOf(i)
      if (!map.has(f)) map.set(f, [])
      map.get(f)!.push(i)
    }
    for (const list of map.values()) list.sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999) || a.task.createdAt - b.task.createdAt)
    return map
  }, [items])

  const flip = (id: string): void => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
    } catch {
      /* 记不住也没关系 */
    }
  }

  const done = items.filter((i) => i.done).length
  return (
    <aside className="tree" aria-label="当天的日程">
      <div className="tree-head">
        <span>{cursor === todayKey() ? '今天的安排' : '这一天的安排'}</span>
        <span className="tnum">
          {done} / {items.length}
        </span>
      </div>
      {items.length === 0 && <div className="tree-empty">在上面的输入框里写一句话，或点「新建」</div>}
      {FOLDERS.map((f) => {
        const list = groups.get(f.id)
        if (!list?.length) return null
        const isOpen = open.has(f.id)
        const Icon = f.icon
        return (
          <div key={f.id} className={cx('fold', isOpen && 'open')}>
            <button className="fold-row fx" onClick={() => flip(f.id)} aria-expanded={isOpen}>
              <ChevronRight size={14} className="chev" />
              <Icon size={14} className="fico" />
              <span className="fold-name">{f.name}</span>
              <span className="fold-count tnum">
                {list.filter((i) => i.done).length}/{list.length}
              </span>
            </button>
            <div className="fold-body">
              <div>
                {list.map((i) => (
                  <Item
                    key={i.key}
                    item={i}
                    open={openItems.has(i.key)}
                    onOpen={() => {
                      const next = new Set(openItems)
                      if (next.has(i.key)) next.delete(i.key)
                      else next.add(i.key)
                      setOpenItems(next)
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </aside>
  )
}
