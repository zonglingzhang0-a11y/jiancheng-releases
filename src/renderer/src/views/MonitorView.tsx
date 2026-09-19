import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Camera, FileClock, MonitorSmartphone, Plus, ShieldCheck, Sparkles, Timer, Zap } from 'lucide-react'
import { formatDuration, fromKey, matchedSeconds, occurrenceKey, pad, requiredSeconds, tasksOn, todayKey } from '@shared/schedule'
import type { ColorKey, Segment, Shot, Task, UsageItem } from '@shared/types'
import { api } from '../lib/api'
import { defaultRule, useStore } from '../store'
import { AppIcon, Bar, Check, cx, Switch } from '../components/ui'
import { ActivityLog, useShots } from './ActivityLog'

const PALETTE: ColorKey[] = ['blue', 'violet', 'emerald', 'orange', 'rose', 'teal', 'amber']

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function useActivity(date: string): { usage: UsageItem[]; segments: Segment[] } {
  const [state, setState] = useState<{ usage: UsageItem[]; segments: Segment[] }>({ usage: [], segments: [] })
  useEffect(() => {
    let alive = true
    const load = (): void => {
      Promise.all([api().getUsage(date), api().getSegments(date)]).then(([usage, segments]) => {
        if (alive) setState({ usage, segments })
      })
    }
    load()
    const t = date === todayKey() ? setInterval(load, 15_000) : null
    return () => {
      alive = false
      if (t) clearInterval(t)
    }
  }, [date])
  return state
}

interface Block {
  exe: string
  s: number
  e: number
  idle: boolean
  title: string
}

/** 合并相邻的同应用片段，便于绘制 */
function toBlocks(segments: Segment[]): Block[] {
  const blocks: Block[] = []
  for (const seg of segments) {
    const last = blocks[blocks.length - 1]
    const idle = !!seg.i
    if (last && last.exe === seg.p && last.idle === idle && seg.s - last.e < 90_000) {
      last.e = Math.max(last.e, seg.e)
    } else {
      blocks.push({ exe: seg.p, s: seg.s, e: seg.e, idle, title: seg.t })
    }
  }
  return blocks
}

function Timeline({ date, segments, usage, colorOf }: { date: string; segments: Segment[]; usage: UsageItem[]; colorOf: (exe: string) => ColorKey }): React.JSX.Element {
  const [tip, setTip] = useState<{ x: number; y: number; block: Block } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const base = fromKey(date).getTime()
  const nameOf = (exe: string): string => usage.find((u) => u.exe === exe)?.name ?? exe

  const blocks = useMemo(() => toBlocks(segments), [segments])
  const isToday = date === todayKey()
  const firstHour = blocks.length ? Math.max(0, Math.min(8, new Date(blocks[0].s).getHours())) : 8
  const lastMs = Math.max(blocks.length ? blocks[blocks.length - 1].e : 0, isToday ? Date.now() : 0)
  const lastHour = Math.min(24, Math.max(20, lastMs ? new Date(lastMs).getHours() + 1 : 20))
  const from = base + firstHour * 3600_000
  const span = (lastHour - firstHour) * 3600_000
  const pct = (ms: number): number => ((ms - from) / span) * 100
  const ticks: number[] = []
  const step = lastHour - firstHour > 14 ? 3 : 2
  for (let h = firstHour; h <= lastHour; h += step) ticks.push(h)

  return (
    <div className="card timeline-card">
      <div className="card-head">
        <div className="card-title">
          <Activity size={15} />
          活动时间线
        </div>
        <div className="legend">
          {usage.slice(0, 5).map((u) => (
            <span key={u.exe} className={cx('legend-item', `tone-${colorOf(u.exe)}`)}>
              <i />
              {u.name}
            </span>
          ))}
          <span className="legend-item idle">
            <i />
            空闲
          </span>
        </div>
      </div>
      <div className="timeline-track" ref={trackRef} onMouseLeave={() => setTip(null)}>
        {ticks.map((h) => (
          <i key={h} className="timeline-grid" style={{ left: `${pct(base + h * 3600_000)}%` }} />
        ))}
        {blocks.map((b, i) => {
          const left = pct(b.s)
          const width = Math.max(0.15, pct(b.e) - left)
          return (
            <span
              key={i}
              className={cx('timeline-block', b.idle ? 'idle' : `tone-${colorOf(b.exe)}`)}
              style={{ left: `${left}%`, width: `${width}%` }}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, block: b })}
            />
          )
        })}
        {isToday && <i className="timeline-now" style={{ left: `${pct(Date.now())}%` }} />}
        {blocks.length === 0 && <div className="timeline-empty">暂无活动记录</div>}
      </div>
      <div className="timeline-axis">
        {ticks.map((h) => (
          <span key={h} className="tnum" style={{ left: `${pct(base + h * 3600_000)}%` }}>
            {pad(h)}:00
          </span>
        ))}
      </div>
      {tip && (
        <div className="tip" style={{ left: tip.x + 12, top: tip.y + 14 }}>
          <b>{tip.block.idle ? `空闲 · ${nameOf(tip.block.exe)}` : nameOf(tip.block.exe)}</b>
          <div className="tnum" style={{ opacity: 0.7 }}>
            {clock(tip.block.s)} – {clock(tip.block.e)} · {formatDuration((tip.block.e - tip.block.s) / 1000, true)}
          </div>
        </div>
      )}
    </div>
  )
}

function AutoTaskRow({ task, date, segments, shots }: { task: Task; date: string; segments: Segment[]; shots: Shot[] }): React.JSX.Element {
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const toggle = useStore((s) => s.toggle)
  const openTask = useStore((s) => s.openTask)
  const openViewer = useStore((s) => s.openViewer)
  const evidence = useMemo(() => shots.filter((sh) => sh.taskIds.includes(task.id)), [shots, task.id])
  const key = occurrenceKey(task.id, date)
  const completion = data.completions[key]
  // 今天的进度由主进程实时推送；历史日期用当天的活动记录在本地回算
  const prog = useMemo(() => {
    if (date === todayKey() || date > todayKey() || task.auto?.kind === 'file') return progress[key]
    const required = requiredSeconds(task.auto!)
    const seconds = matchedSeconds(task, date, segments)
    return {
      key,
      taskId: task.id,
      date,
      seconds: Math.min(seconds, required),
      required,
      done: seconds >= required,
      detail: `${formatDuration(seconds, true)} / ${formatDuration(required, true)}`
    }
  }, [date, task, segments, progress, key])
  const done = completion?.done ?? prog?.done ?? false
  const rule = task.auto!
  const ratio = done ? 1 : prog ? prog.seconds / prog.required : 0

  const ruleText =
    rule.kind === 'app'
      ? `使用 ${rule.apps.length} 个应用累计 ${rule.minutes} 分钟`
      : rule.kind === 'title'
        ? `标题含「${rule.keywords.slice(0, 2).join('」「')}」累计 ${rule.minutes} 分钟`
        : `文件夹有更新`

  return (
    <div className={cx('auto-row', `tone-${task.color}`, done && 'done')} onClick={() => openTask(task, date)}>
      <Check checked={done} tone={task.color} onChange={() => toggle(task.id, date)} />
      <div className="auto-row-main">
        <div className="auto-row-top">
          <span className="auto-row-title">{task.title || '未命名'}</span>
          <span className="auto-row-rule">
            {rule.kind === 'app' && (
              <span className="auto-row-apps">
                {rule.apps.slice(0, 3).map((a) => (
                  <AppIcon key={a} exe={a} size={14} />
                ))}
              </span>
            )}
            {rule.kind === 'file' && <FileClock size={12} />}
            {ruleText}
          </span>
        </div>
        <div className="auto-row-progress">
          <Bar value={ratio} tone={task.color} />
          <span className="auto-row-detail tnum">
            {done ? (completion?.by === 'auto' ? '已自动完成' : '已完成') : (prog?.detail ?? (date === todayKey() ? '计算中…' : '—'))}
          </span>
          {evidence.length > 0 && (
            <button
              className="evidence-btn tnum"
              title="查看这项任务计时期间的截图"
              onClick={(e) => {
                e.stopPropagation()
                openViewer(evidence, evidence.length - 1)
              }}
            >
              <Camera size={12} />
              {evidence.length}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function MonitorView(): React.JSX.Element {
  const cursor = useStore((s) => s.cursor)
  const data = useStore((s) => s.data)
  const monitor = useStore((s) => s.monitor)
  const updateSettings = useStore((s) => s.updateSettings)
  const openNew = useStore((s) => s.openNew)
  const capture = useStore((s) => s.capture)
  const { usage, segments } = useActivity(cursor)
  const shots = useShots(cursor)
  const isToday = cursor === todayKey()
  const colorOf = useMemo(() => {
    const map = new Map<string, ColorKey>()
    usage.slice(0, PALETTE.length).forEach((u, i) => map.set(u.exe, PALETTE[i]))
    return (exe: string): ColorKey => map.get(exe) ?? 'slate'
  }, [usage])

  const total = usage.reduce((a, u) => a + u.seconds, 0)
  const activeSeconds = isToday ? Math.max(monitor.activeSeconds, total) : total
  const autoTasks = useMemo(() => tasksOn(data.tasks, cursor).filter((t) => t.auto?.enabled), [data.tasks, cursor])
  const autoDone = autoTasks.filter((t) => data.completions[occurrenceKey(t.id, cursor)]?.done).length
  const top = usage[0]

  const createFor = (u: UsageItem): void => {
    openNew({
      date: cursor,
      title: `使用 ${u.name}`,
      color: 'violet',
      repeat: { type: 'daily', weekdays: [], until: null },
      auto: { ...defaultRule(), kind: 'app', apps: [u.exe], minutes: 30 }
    })
  }

  let state: { cls: string; label: string }
  if (!monitor.available) state = { cls: 'paused', label: '不可用' }
  else if (!monitor.enabled) state = { cls: 'paused', label: '已暂停' }
  else if (monitor.idle) state = { cls: 'idle', label: '空闲中' }
  else state = { cls: 'live', label: '监测中' }

  return (
    <div className="monitor-view">
      <div className="monitor-inner">
        <div className="monitor-hero">
          <div className="card now-card">
            <div className="now-card-icon">
              {monitor.current && monitor.enabled ? (
                <AppIcon exe={monitor.current.exe} name={monitor.current.name} size={40} />
              ) : (
                <MonitorSmartphone size={22} />
              )}
            </div>
            <div className="now-card-main">
              <div className="now-card-label">
                <span className={cx('pill', state.cls)}>
                  {state.cls === 'live' && <span className="dot-live" />}
                  {state.label}
                </span>
                {capture.enabled && (
                  <span className="pill accent" title={capture.note ?? `每 ${data.settings.shotInterval} 分钟截屏`}>
                    <Camera size={11} strokeWidth={2.4} />
                    截屏中
                  </span>
                )}
              </div>
              <div className="now-card-name">
                {!monitor.available
                  ? '当前环境不支持应用监测'
                  : !monitor.enabled
                    ? '智能监测已暂停'
                    : (monitor.current?.name ?? '等待前台窗口…')}
              </div>
              <div className="now-card-title">
                {monitor.enabled && monitor.current?.title
                  ? monitor.current.title
                  : '每秒采样一次前台窗口，所有数据仅保存在本机'}
              </div>
            </div>
            <div className="now-card-switch">
              <span>智能监测</span>
              <Switch
                checked={data.settings.monitorEnabled}
                disabled={!monitor.available}
                onChange={(v) => updateSettings({ monitorEnabled: v })}
              />
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-label">
              <Timer size={14} />
              {isToday ? '今日活跃' : '当日活跃'}
            </div>
            <div className="stat-value tnum">{formatDuration(activeSeconds, true)}</div>
            <div className="stat-sub">
              {top ? (
                <>
                  最常用 <b>{top.name}</b>
                </>
              ) : (
                '暂无数据'
              )}
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-label">
              <Zap size={14} />
              智能任务
            </div>
            <div className="stat-value tnum">
              {autoDone}
              <span className="stat-of">/ {autoTasks.length}</span>
            </div>
            <div className="stat-sub">
              {data.settings.idleMinutes > 0 ? `无操作 ${data.settings.idleMinutes} 分钟视为空闲` : '未启用空闲检测'}
            </div>
          </div>
        </div>

        <Timeline date={cursor} segments={segments} usage={usage} colorOf={colorOf} />

        <div className="monitor-cols">
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Sparkles size={15} />
                智能任务
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openNew({ date: cursor, auto: defaultRule(), repeat: { type: 'daily', weekdays: [], until: null } })}
              >
                <Plus size={14} />
                新建
              </button>
            </div>
            {autoTasks.length === 0 ? (
              <div className="empty">
                <Zap size={26} strokeWidth={1.5} />
                <div>这一天没有智能任务</div>
                <div className="empty-sub">为日程开启「智能完成」，使用应用时会自动打勾</div>
              </div>
            ) : (
              <div className="auto-list">
                {autoTasks.map((t) => (
                  <AutoTaskRow key={t.id} task={t} date={cursor} segments={segments} shots={shots} />
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <MonitorSmartphone size={15} />
                应用使用
              </div>
              <span className="card-meta tnum">{formatDuration(total, true)}</span>
            </div>
            {usage.length === 0 ? (
              <div className="empty">
                <Activity size={26} strokeWidth={1.5} />
                <div>暂无应用使用记录</div>
              </div>
            ) : (
              <div className="usage-list">
                {usage.slice(0, 9).map((u, i) => (
                  <div key={u.exe} className="usage-row">
                    <AppIcon exe={u.exe} name={u.name} size={26} />
                    <div className="usage-main">
                      <div className="usage-top">
                        <span className="usage-name" title={u.exe}>
                          {u.name}
                        </span>
                        <span className="usage-time tnum">{formatDuration(u.seconds, true)}</span>
                      </div>
                      <Bar value={u.seconds / usage[0].seconds} tone={i < PALETTE.length ? PALETTE[i] : 'slate'} />
                    </div>
                    <button className="icon-btn sm usage-add" title="为此应用创建智能任务" onClick={() => createFor(u)}>
                      <Plus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="privacy-note">
              <ShieldCheck size={13} />
              {data.settings.shotEnabled ? '截图与记录仅保存在本机，不上传' : '仅记录应用名与窗口标题，不截屏、不上传'}
            </div>
          </div>
        </div>

        <ActivityLog date={cursor} segments={segments} usage={usage} shots={shots} colorOf={colorOf} />
      </div>
    </div>
  )
}
