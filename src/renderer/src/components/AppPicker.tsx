import { useEffect, useState } from 'react'
import { Check as CheckIcon, Plus, Search, X } from 'lucide-react'
import type { AppInfo } from '@shared/types'
import { api } from '../lib/api'
import { Popover, useAnchor } from './Popover'
import { AppIcon, cx } from './ui'

/** 从最近使用的应用中选择，或手动输入进程名 */
export function AppPicker(props: { value: string[]; onChange: (apps: string[]) => void; placeholder?: string }): React.JSX.Element {
  const a = useAnchor()
  const [apps, setApps] = useState<AppInfo[]>([])
  const [query, setQuery] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    api()
      .getRecentApps()
      .then((list) => {
        setApps(list)
        setNames(Object.fromEntries(list.map((x) => [x.exe, x.name])))
      })
  }, [a.open])

  const toggle = (exe: string): void => {
    props.onChange(props.value.includes(exe) ? props.value.filter((x) => x !== exe) : [...props.value, exe])
  }

  const q = query.trim().toLowerCase()
  const filtered = apps.filter((x) => !q || x.name.toLowerCase().includes(q) || x.exe.includes(q))
  const custom = q && !apps.some((x) => x.exe === q || x.exe === `${q}.exe`) ? (q.endsWith('.exe') ? q : `${q}.exe`) : null

  return (
    <div className="app-picker">
      {props.value.map((exe) => (
        <span key={exe} className="chip app-chip">
          <AppIcon exe={exe} name={names[exe]} size={16} />
          <span>{names[exe] ?? exe}</span>
          <button onClick={() => toggle(exe)} aria-label="移除">
            <X size={12} />
          </button>
        </span>
      ))}
      <button ref={a.ref} className={cx('chip chip-add', a.open && 'open')} onClick={a.toggle}>
        <Plus size={13} />
        {props.value.length ? '添加' : (props.placeholder ?? '选择应用')}
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={300}>
        <div className="picker-search">
          <Search size={14} />
          <input
            autoFocus
            placeholder="搜索应用，或输入进程名"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (filtered[0]) toggle(filtered[0].exe)
                else if (custom) toggle(custom)
                setQuery('')
              }
            }}
          />
        </div>
        <div className="picker-list">
          {!q && <div className="menu-label">最近使用</div>}
          {filtered.map((x) => (
            <button key={x.exe} className={cx('menu-item', props.value.includes(x.exe) && 'selected')} onClick={() => toggle(x.exe)}>
              <AppIcon exe={x.exe} name={x.name} size={18} />
              <span className="picker-name">{x.name}</span>
              <span className="menu-meta">{x.exe}</span>
              {props.value.includes(x.exe) && <CheckIcon size={14} className="menu-check" />}
            </button>
          ))}
          {custom && (
            <button
              className="menu-item"
              onClick={() => {
                toggle(custom)
                setQuery('')
              }}
            >
              <Plus size={15} />
              <span>
                添加进程 <b>{custom}</b>
              </span>
            </button>
          )}
          {!filtered.length && !custom && <div className="picker-empty">打开应用使用一会儿，它就会出现在这里</div>}
        </div>
      </Popover>
    </div>
  )
}
