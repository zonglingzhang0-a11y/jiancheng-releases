import { useEffect, useState } from 'react'
import { Check, ChevronDown, CircleAlert, FileClock, FolderOpen, File as FileIcon, AppWindow, Minus, Plus, Trash2, Type, X, Zap } from 'lucide-react'
import { formatDuration, toMin } from '@shared/schedule'
import type { AutoKind, AutoRule, Task } from '@shared/types'
import { useStore } from '../store'
import { api, isMock } from '../lib/api'
import { AppPicker } from '../components/AppPicker'
import { Popover, useAnchor } from '../components/Popover'
import { AppIcon, cx, Segmented, Switch } from '../components/ui'

/* ---------- 关键词 ---------- */
function KeywordInput(props: { value: string[]; onChange: (v: string[]) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const add = (): void => {
    const parts = text
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length) props.onChange([...new Set([...props.value, ...parts])])
    setText('')
  }
  return (
    <div className="keyword-input">
      {props.value.map((k) => (
        <span key={k} className="chip">
          {k}
          <button onClick={() => props.onChange(props.value.filter((x) => x !== k))} aria-label="移除">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={text}
        placeholder={props.value.length ? '继续添加…' : '如：LeetCode、哔哩哔哩、背单词'}
        onChange={(e) => setText(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !text && props.value.length) {
            props.onChange(props.value.slice(0, -1))
          }
        }}
      />
    </div>
  )
}

/* ---------- 规则编辑 ---------- */
const HIDDEN_APPS = new Set(['explorer.exe', 'electron.exe', '简程.exe', 'applicationframehost.exe', 'searchhost.exe', 'lockapp.exe'])

/** 最近使用的应用平铺成图标格，点一下即选中 */
function AppGrid(props: { value: string[]; onChange: (apps: string[]) => void }): React.JSX.Element {
  const recent = useStore((s) => s.recentApps)
  const refreshApps = useStore((s) => s.refreshApps)
  useEffect(() => {
    refreshApps()
  }, [refreshApps])

  const tiles = recent.filter((a) => !HIDDEN_APPS.has(a.exe)).slice(0, 8)
  const tileExes = tiles.map((a) => a.exe)
  const others = props.value.filter((exe) => !tileExes.includes(exe))
  const toggle = (exe: string): void =>
    props.onChange(props.value.includes(exe) ? props.value.filter((x) => x !== exe) : [...props.value, exe])

  return (
    <div className="app-grid-wrap">
      {tiles.length > 0 ? (
        <div className="app-grid">
          {tiles.map((a) => {
            const on = props.value.includes(a.exe)
            return (
              <button key={a.exe} className={cx('app-tile', on && 'on')} onClick={() => toggle(a.exe)} title={a.exe}>
                <AppIcon exe={a.exe} name={a.name} size={26} />
                <span className="app-tile-name">{a.name}</span>
                {on && (
                  <span className="app-tile-check">
                    <Check size={10} strokeWidth={3.2} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="app-grid-empty">打开你要监测的应用用一会儿，它就会出现在这里</div>
      )}
      <AppPicker
        value={others}
        onChange={(next) => props.onChange([...props.value.filter((exe) => tileExes.includes(exe)), ...next])}
        placeholder="其他应用"
      />
    </div>
  )
}

export function RuleEditor(props: { task: Task; error: string | null; onChange: (rule: AutoRule) => void }): React.JSX.Element {
  const rule = props.task.auto!
  const set = (patch: Partial<AutoRule>): void => props.onChange({ ...rule, ...patch })
  const hasSlot = !!(props.task.start && props.task.end)
  const slotMinutes = hasSlot ? toMin(props.task.end!) - toMin(props.task.start!) : 0
  const recent = useStore((s) => s.recentApps)
  const [advanced, setAdvanced] = useState(rule.kind !== 'app' || rule.scope === 'slot' || rule.countIdle)
  const names = Object.fromEntries(recent.map((x) => [x.exe, x.name]))

  const appNames = rule.apps.map((x) => names[x] ?? x).join('、')
  const range = rule.scope === 'slot' && hasSlot ? `在 ${props.task.start}–${props.task.end} 内` : '当天'
  let summary: string
  if (rule.kind === 'app') {
    summary = rule.apps.length ? `${range}在 ${appNames} 中累计使用满 ${formatDuration(rule.minutes * 60)}，自动打勾` : '选一个或几个应用，用够时长就自动打勾'
  } else if (rule.kind === 'title') {
    summary = rule.keywords.length
      ? `${range}窗口标题包含「${rule.keywords.join('」或「')}」${rule.apps.length ? `（限 ${appNames}）` : ''}的时间累计满 ${formatDuration(rule.minutes * 60)}，自动打勾`
      : '适合网页与文档：例如浏览器标签页标题包含「LeetCode」'
  } else {
    summary = rule.path ? `${range}「${rule.path}」中有文件被修改时，自动打勾` : '适合写日记、写作、交作业：检测到文件保存就打勾'
  }

  const minutePresets = [15, 30, 45, 60, 90, 120]

  return (
    <div className="rule-editor">
      {rule.kind === 'app' && (
        <div className="rule-step">
          <div className="rule-q">用哪个应用？</div>
          <AppGrid value={rule.apps} onChange={(apps) => set({ apps })} />
        </div>
      )}

      {rule.kind === 'title' && (
        <div className="rule-step">
          <div className="rule-q">窗口标题里包含什么？</div>
          <KeywordInput value={rule.keywords} onChange={(keywords) => set({ keywords })} />
        </div>
      )}

      {rule.kind === 'file' && (
        <div className="rule-step">
          <div className="rule-q">监测哪个文件或文件夹？</div>
          <div className="path-row">
            <input className="input" placeholder="文件或文件夹路径" value={rule.path} onChange={(e) => set({ path: e.target.value })} />
            <button
              className="btn btn-outline btn-sm"
              onClick={async () => {
                const p = await api().pickPath('folder')
                if (p) set({ path: p })
              }}
              disabled={isMock()}
              title="选择文件夹"
            >
              <FolderOpen size={14} />
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={async () => {
                const p = await api().pickPath('file')
                if (p) set({ path: p })
              }}
              disabled={isMock()}
              title="选择文件"
            >
              <FileIcon size={14} />
            </button>
          </div>
        </div>
      )}

      {rule.kind !== 'file' && (
        <div className="rule-step">
          <div className="rule-q">用多久算完成？</div>
          <div className="minutes-row">
            <div className="presets">
              {minutePresets.map((m) => (
                <button key={m} className={cx('preset', rule.minutes === m && 'on')} onClick={() => set({ minutes: m })}>
                  {m >= 60 ? `${m / 60} 小时` : `${m} 分钟`}
                </button>
              ))}
            </div>
            <div className="stepper">
              <button onClick={() => set({ minutes: Math.max(1, rule.minutes - 5) })} aria-label="减少">
                <Minus size={13} />
              </button>
              <input
                className="tnum"
                value={rule.minutes}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, ''))
                  set({ minutes: Math.min(24 * 60, v || 0) })
                }}
                onBlur={() => rule.minutes < 1 && set({ minutes: 1 })}
              />
              <span className="stepper-unit">分钟</span>
              <button onClick={() => set({ minutes: Math.min(24 * 60, rule.minutes + 5) })} aria-label="增加">
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cx('rule-summary', props.error && 'error')}>
        {props.error ? <CircleAlert size={13} strokeWidth={2.4} /> : <Zap size={13} strokeWidth={2.4} />}
        <span>{props.error ?? summary}</span>
      </div>

      <button className={cx('rule-adv-toggle', advanced && 'open')} onClick={() => setAdvanced((v) => !v)}>
        <ChevronDown size={14} />
        高级设置
        {!advanced && rule.kind !== 'app' && <em>· {rule.kind === 'title' ? '按窗口标题' : '按文件更新'}</em>}
      </button>

      {advanced && (
        <div className="rule-advanced">
          <div className="rule-field">
            <label>判定方式</label>
            <Segmented<AutoKind>
              size="sm"
              value={rule.kind}
              onChange={(kind) => set({ kind })}
              options={[
                { value: 'app', label: <span className="seg-with-icon"><AppWindow size={13} />应用时长</span> },
                { value: 'title', label: <span className="seg-with-icon"><Type size={13} />窗口标题</span> },
                { value: 'file', label: <span className="seg-with-icon"><FileClock size={13} />文件更新</span> }
              ]}
            />
          </div>

          {rule.kind === 'title' && (
            <div className="rule-field">
              <label>限定应用</label>
              <AppPicker value={rule.apps} onChange={(apps) => set({ apps })} placeholder="不限应用" />
            </div>
          )}

          <div className="rule-field">
            <label>统计范围</label>
            <div className="rule-inline">
              <Segmented<'day' | 'slot'>
                size="sm"
                value={hasSlot ? rule.scope : 'day'}
                onChange={(scope) => set({ scope })}
                options={[
                  { value: 'day', label: '全天' },
                  { value: 'slot', label: '仅计划时段', disabled: !hasSlot, title: hasSlot ? undefined : '设置了具体时间后可用' }
                ]}
              />
              {rule.kind !== 'file' && rule.scope === 'slot' && hasSlot && rule.minutes > slotMinutes && (
                <span className="rule-warn">时长超过了计划时段（{slotMinutes} 分钟）</span>
              )}
            </div>
          </div>

          {rule.kind !== 'file' && (
            <label className="rule-check">
              <Switch checked={rule.countIdle} onChange={(countIdle) => set({ countIdle })} />
              <span>
                无键鼠操作时继续计时
                <em>适合看网课、视频会议</em>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- 删除确认 ---------- */
export function DeleteButton(props: { task: Task; onDelete: (mode: 'all' | 'one') => void }): React.JSX.Element {
  const a = useAnchor()
  const recurring = props.task.repeat.type !== 'none'
  return (
    <>
      <button ref={a.ref} className="btn btn-ghost btn-danger btn-sm" onClick={() => (recurring ? a.toggle() : props.onDelete('all'))}>
        <Trash2 size={14} />
        删除
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={200}>
        <div className="menu-label">这是一个重复日程</div>
        <button className="menu-item" onClick={() => props.onDelete('one')}>
          仅删除这一次
        </button>
        <button className="menu-item btn-danger" onClick={() => props.onDelete('all')}>
          删除所有重复
        </button>
      </Popover>
    </>
  )
}

