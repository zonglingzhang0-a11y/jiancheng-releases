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

/** 结束在开始那天之后的第几天 */
export const spanOf = (task: Task): number => Math.max(0, Math.floor(task.days ?? 0))

/**
 * 一次发生从开始那天 0 点算起的分钟范围 [开始, 结束)。
 * 全天 / 多天的占满整天；定时间的可以跨过午夜；随时待办返回 null
 */
export function occurrenceMinutes(task: Task): [number, number] | null {
  const span = spanOf(task)
  if (task.allDay) return [0, (span + 1) * 1440]
  if (!task.start) return null
  const s = toMin(task.start)
  const e = span * 1440 + (task.end ? toMin(task.end) : Math.min(1440, s + 60))
  return [s, Math.max(e, s + 1)]
}

/** 全天、多天或持续 24 小时以上的日程：不画在色带上，放进「进行中」 */
export function isLong(task: Task): boolean {
  if (task.allDay) return true
  const r = occurrenceMinutes(task)
  return !!r && r[1] - r[0] >= 1440
}

/** 覆盖某一天的所有发生（包括前几天开始、延续到这天的），date 是那次发生开始的日期 */
export function occurrencesOn(tasks: Task[], date: string): { task: Task; date: string }[] {
  const out: { task: Task; date: string }[] = []
  for (const task of tasks) {
    const r = occurrenceMinutes(task)
    const reach = r ? Math.max(0, Math.ceil(r[1] / 1440) - 1) : 0
    for (let k = reach; k >= 0; k--) {
      const d = k ? addDays(date, -k) : date
      if (!occursOn(task, d)) continue
      if (r && !(r[0] < (k + 1) * 1440 && r[1] > k * 1440)) continue
      out.push({ task, date: d })
    }
  }
  return out
}

/** 一次发生涉及的日期（开始那天到结束那天） */
export function occurrenceDates(task: Task, date: string): string[] {
  const r = occurrenceMinutes(task)
  const last = r ? Math.max(0, Math.ceil(r[1] / 1440) - 1) : 0
  return Array.from({ length: last + 1 }, (_, i) => addDays(date, i))
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

/** 规则在某次发生的统计时间窗口 [from, to)：仅计划时段按日程的起止，全天按涉及的每一整天 */
export function ruleWindow(task: Task, date: string): [number, number] {
  const base = fromKey(date).getTime()
  const rule = task.auto
  const r = occurrenceMinutes(task)
  if (rule && rule.scope === 'slot' && r && !task.allDay) return [base + r[0] * 60000, base + r[1] * 60000]
  const days = occurrenceDates(task, date).length
  return [base, fromKey(addDays(date, days)).getTime()]
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
