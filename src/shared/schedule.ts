import type { AutoRule, Segment, Task } from './types'

export const pad = (n: number): string => String(n).padStart(2, '0')

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function todayKey(): string {
  return toKey(new Date())
}

/** "HH:mm" → 分钟数 */
export function toMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export function fromMin(min: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function occurrenceKey(taskId: string, date: string): string {
  return `${taskId}@${date}`
}

export function occursOn(task: Task, date: string): boolean {
  if (date < task.date) return false
  const { repeat } = task
  if (repeat.until && date > repeat.until) return false
  if (task.exceptions.includes(date)) return false
  switch (repeat.type) {
    case 'none':
      return date === task.date
    case 'daily':
      return true
    case 'weekdays': {
      const dow = fromKey(date).getDay()
      return dow >= 1 && dow <= 5
    }
    case 'weekly': {
      const dow = fromKey(date).getDay()
      const days = repeat.weekdays.length ? repeat.weekdays : [fromKey(task.date).getDay()]
      return days.includes(dow)
    }
  }
}

/** 某天的任务：不限时间的在前，其余按开始时间排序 */
export function tasksOn(tasks: Task[], date: string): Task[] {
  return tasks
    .filter((t) => occursOn(t, date))
    .sort((a, b) => {
      if (!a.start && !b.start) return a.createdAt - b.createdAt
      if (!a.start) return -1
      if (!b.start) return 1
      return toMin(a.start) - toMin(b.start) || a.createdAt - b.createdAt
    })
}

export function ruleMatches(rule: AutoRule, seg: Segment): boolean {
  if (seg.i && !rule.countIdle) return false
  if (rule.kind === 'app') return rule.apps.includes(seg.p)
  if (rule.kind === 'title') {
    if (rule.apps.length && !rule.apps.includes(seg.p)) return false
    const title = seg.t.toLowerCase()
    return rule.keywords.some((k) => k.trim() && title.includes(k.trim().toLowerCase()))
  }
  return false
}

/** 规则在某个任务发生日的统计时间窗口 [from, to) */
export function ruleWindow(task: Task, date: string): [number, number] {
  const base = fromKey(date).getTime()
  const rule = task.auto
  if (rule && rule.scope === 'slot' && task.start && task.end) {
    return [base + toMin(task.start) * 60000, base + toMin(task.end) * 60000]
  }
  return [base, base + 24 * 3600000]
}

/** 统计规则在时间窗口内累计匹配的秒数 */
export function matchedSeconds(task: Task, date: string, segments: Segment[]): number {
  const rule = task.auto
  if (!rule) return 0
  const [from, to] = ruleWindow(task, date)
  let ms = 0
  for (const seg of segments) {
    if (seg.e <= from || seg.s >= to) continue
    if (!ruleMatches(rule, seg)) continue
    ms += Math.min(seg.e, to) - Math.max(seg.s, from)
  }
  return Math.floor(ms / 1000)
}

export function requiredSeconds(rule: AutoRule): number {
  if (rule.kind === 'file') return 1
  return Math.max(10, Math.round(rule.minutes * 60))
}

export function formatDuration(seconds: number, short = false): string {
  const m = Math.floor(seconds / 60)
  if (m < 1) return short ? '0分' : '不到 1 分钟'
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (short) return h ? (mm ? `${h}时${mm}分` : `${h}小时`) : `${mm}分`
  return h ? (mm ? `${h} 小时 ${mm} 分` : `${h} 小时`) : `${mm} 分钟`
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function prettyExe(exe: string): string {
  const base = exe.replace(/\.exe$/i, '')
  return base.charAt(0).toUpperCase() + base.slice(1)
}
