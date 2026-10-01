// 某一天的事项：定时日程（跨午夜的拆成两段）、随时待办、顺延过来的待办；
// 跨天的「长期」事另算，不占色带，只在清单和周 / 月视图里出现
import {
  addDays,
  dayDiff,
  fromKey,
  fuzzOf,
  isLong,
  occurrenceDates,
  occurrenceKey,
  occurrenceMinutes,
  occurrencesOn,
  sureness,
  todayKey,
  type Fuzz
} from '@shared/schedule'
import type { AppData, AutoProgress, Task } from '@shared/types'
import { iconOf } from './icons'
import { hm } from './cal'

export interface DayItem {
  task: Task
  /** 完成记录用的日期：顺延的待办、跨午夜的下半段用它原来那天 */
  date: string
  key: string
  done: boolean
  by: 'manual' | 'auto' | null
  /** 完成的时间，决定完成后在左下角排第几个 */
  doneAt: number
  /** 这一天里占的分钟；随时待办为 null */
  start: number | null
  end: number | null
  /** whole：当天内结束 · head：今天开始、明天才结束 · tail：昨天开始、今天结束 */
  part: 'whole' | 'head' | 'tail'
  /** 整段相对这一天 0 点的分钟数，可以小于 0 或大于 1440 */
  from: number
  to: number
  /** 顺延了几天，0 表示当天的 */
  carried: number
  icon: string
  subs: { id: string; title: string; done: boolean }[]
  progress: AutoProgress | null
}

/** 一件跨天的长期事在某一天的样子 */
export interface SpanItem {
  task: Task
  /** 这次发生开始的日期，完成记录也用它 */
  date: string
  key: string
  done: boolean
  by: 'manual' | 'auto' | null
  doneAt: number
  icon: string
  allDay: boolean
  /** 一共几天、今天是第几天、今天之后还剩几天 */
  totalDays: number
  dayNo: number
  daysLeft: number
  /** 已经过去的比例 */
  ratio: number
  startMs: number
  endMs: number
  startsToday: boolean
  endsToday: boolean
  /** 带时间的长期事在这一天的开始 / 结束分钟 */
  startMin: number | null
  endMin: number | null
  label: string
  /** 进度条右侧的天数，比如「3 / 5 天」「3 / 4–7 天」「第 9 天」 */
  dayText: string
  /** 进度条上开始、结束说不准的位置（0–1）；确定的是 0 和 1 */
  fadeIn: number
  fadeOut: number
  /** 结束、开始说不准时清单里给的按钮：过了预计点「结束」，预计开始的那几天点「开始」 */
  action: 'end' | 'start' | null
  /** 结束说不准（预计区间 / 没定 / 超出预计）：打勾就等于在这一天结束 */
  fuzzyEnd: boolean
  /** 正在看的那一天 */
  viewDate: string
  progress: AutoProgress | null
}

/** 周 / 月视图里用的一段：不分具体哪天 */
export interface SpanRange {
  key: string
  task: Task
  date: string
  totalDays: number
  done: boolean
  /** 起止日期（说不准的按画出来的范围） */
  s: string
  e: string
  fuzz: Fuzz
  /** 没有结束日期，或者过了预计还没结束 */
  open: boolean
}

/** 某一天在这段长期事里的把握，0–1 */
export const surenessOn = (r: SpanRange, d: string): number => sureness(r.fuzz, dayDiff(r.date, d))

const CARRY_DAYS = 7

function build(
  data: AppData,
  progress: Record<string, AutoProgress>,
  task: Task,
  date: string,
  carried: number,
  span: { start: number | null; end: number | null; part: DayItem['part']; from: number; to: number }
): DayItem {
  const key = occurrenceKey(task.id, date)
  const c = data.completions[key]
  const p = progress[key] ?? null
  return {
    task,
    date,
    key,
    done: c?.done ?? p?.done ?? false,
    by: c?.done ? c.by : p?.done ? 'auto' : null,
    doneAt: c?.done ? c.at : Number.MAX_SAFE_INTEGER,
    ...span,
    carried,
    icon: iconOf(task),
    subs: (task.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, done: s.doneOn.includes(date) })),
    progress: p
  }
}

const anytime = { start: null, end: null, part: 'whole' as const, from: 0, to: 0 }

export function dayItems(data: AppData, progress: Record<string, AutoProgress>, date: string): DayItem[] {
  const items: DayItem[] = []
  for (const { task, date: d } of occurrencesOn(data.tasks, date)) {
    if (isLong(task)) continue
    const r = occurrenceMinutes(task)
    if (!r) {
      items.push(build(data, progress, task, d, 0, anytime))
      continue
    }
    // 把这次发生换算成「相对今天 0 点」的分钟数
    const shift = dayDiff(d, date) * 1440
    const from = r[0] - shift
    const to = r[1] - shift
    const part = from >= 0 && to <= 1440 ? 'whole' : from < 0 ? 'tail' : 'head'
    items.push(build(data, progress, task, d, 0, { start: Math.max(0, from), end: Math.min(1440, to), part, from, to }))
  }
  if (date === todayKey()) {
    // 最近几天没做完的一次性待办（不限时间），顺延到今天继续漂着；今天才做完的留到今天结束
    const first = addDays(date, -CARRY_DAYS)
    const dayStart = fromKey(date).getTime()
    for (const t of data.tasks) {
      if (t.repeat.type !== 'none' || t.start || t.allDay || t.date >= date || t.date < first) continue
      const c = data.completions[occurrenceKey(t.id, t.date)]
      if (c?.done && c.at < dayStart) continue
      items.push(build(data, progress, t, t.date, dayDiff(t.date, date), anytime))
    }
  }
  return items.sort((a, b) => (a.start ?? -1) - (b.start ?? -1) || a.task.createdAt - b.task.createdAt)
}

/** 某一天在进行的长期事，快结束的排前面，做完的沉到最后 */
export function spanItems(data: AppData, progress: Record<string, AutoProgress>, date: string): SpanItem[] {
  const out: SpanItem[] = []
  const now = Date.now()
  const today = todayKey()
  for (const { task, date: d } of occurrencesOn(data.tasks, date)) {
    if (!isLong(task)) continue
    const r = occurrenceMinutes(task)
    if (!r) continue
    const base = fromKey(d).getTime()
    const startMs = base + r[0] * 60000
    const endMs = base + r[1] * 60000
    const dates = occurrenceDates(task, d)
    const totalDays = dates.length
    const dayNo = dayDiff(d, date) + 1
    const daysLeft = totalDays - dayNo
    const key = occurrenceKey(task.id, d)
    const c = data.completions[key]
    const p = progress[key] ?? null
    const f = fuzzOf(task, today)
    const k = dayNo - 1
    const waiting = k < f.sureFrom
    const endsToday = daysLeft === 0 && f.end === 'fixed'
    const endLabel = task.allDay || !task.end ? '' : ` ${task.end}`
    let label = endsToday ? `今天${endLabel}结束` : daysLeft === 1 ? `明天${endLabel}结束` : `还剩 ${daysLeft} 天结束`
    let dayText = `${dayNo} / ${totalDays} 天`
    let action: SpanItem['action'] = null
    // 预计区间：最早第 earliest 天、最晚第 latest 天结束
    const earliest = Math.max(task.days ?? 0, f.sureFrom)
    const latest = Math.max(earliest, task.daysMax ?? 0)
    if (waiting) {
      label = `预计 ${f.sureFrom - k} 天内开始`
      dayText = ''
      if (date === today) action = 'start'
    } else if (f.end === 'range' || (f.end === 'over' && k <= latest)) {
      label = k < earliest ? `预计还剩 ${earliest - k}–${latest - k} 天结束` : latest === k ? '预计今天结束' : `预计 ${latest - k} 天内结束`
      dayText = `${dayNo} / ${earliest + 1}–${latest + 1} 天`
    } else if (f.end === 'over') {
      label = `已超出预计 ${k - latest} 天`
      dayText = `第 ${dayNo} 天`
      if (date === today) action = 'end'
    } else if (f.end === 'open') {
      label = dayNo === 1 ? '今天开始' : `已进行 ${dayNo} 天`
      dayText = '没有结束日期'
    }
    const len = f.last + 1
    out.push({
        task,
        date: d,
        key,
        done: c?.done ?? p?.done ?? false,
        by: c?.done ? c.by : p?.done ? 'auto' : null,
        doneAt: c?.done ? c.at : Number.MAX_SAFE_INTEGER,
        icon: iconOf(task),
        allDay: !!task.allDay,
        totalDays,
        dayNo,
        daysLeft,
        ratio: Math.max(0, Math.min(1, (now - startMs) / Math.max(1, endMs - startMs))),
        startMs,
        endMs,
        startsToday: dayNo === 1 && f.sureFrom === 0,
        endsToday,
        startMin: !task.allDay && dayNo === 1 ? r[0] : null,
        endMin: !task.allDay && endsToday ? r[1] - (totalDays - 1) * 1440 : null,
        label,
        dayText,
        fadeIn: f.sureFrom / len,
        fadeOut: f.end === 'fixed' ? 1 : (f.sureTo + 1) / len,
        action,
        fuzzyEnd: f.end !== 'fixed',
        viewDate: date,
        progress: p
      })
  }
  return out.sort((a, b) => Number(a.done) - Number(b.done) || a.endMs - b.endMs || a.task.createdAt - b.task.createdAt)
}

/** 一段日期范围内的长期事，每次发生只出现一次 */
export function spansIn(data: AppData, from: string, to: string): SpanRange[] {
  const seen = new Map<string, SpanRange>()
  const today = todayKey()
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const { task, date } of occurrencesOn(data.tasks, d)) {
      if (!isLong(task)) continue
      const key = occurrenceKey(task.id, date)
      if (seen.has(key)) continue
      const dates = occurrenceDates(task, date)
      const fuzz = fuzzOf(task, today)
      seen.set(key, {
        key,
        task,
        date,
        totalDays: dates.length,
        done: data.completions[key]?.done ?? false,
        s: dates[0],
        e: dates[dates.length - 1],
        fuzz,
        open: fuzz.end === 'open' || fuzz.end === 'over'
      })
    }
  }
  return [...seen.values()].sort((a, b) => a.totalDays - b.totalDays || a.s.localeCompare(b.s))
}

/** 时间段的说法：跨午夜的标出「次日」「昨晚」 */
export function timeLabel(i: DayItem): string {
  if (i.start === null) return '随时'
  if (i.part === 'head') return `${hm(i.from)}–次日 ${hm(i.to - 1440)}`
  if (i.part === 'tail') return `${hm(i.from + 1440)}–${hm(i.to)}`
  return `${hm(i.from)}–${hm(i.to)}`
}

/** 列表里显示的开始时间 */
export const startLabel = (i: DayItem): string => (i.start === null ? '' : hm(i.start))

/** 跨午夜的小标签 */
export const crossTag = (i: DayItem): string | null => (i.part === 'head' ? '到次日' : i.part === 'tail' ? '昨晚起' : null)

export const timedItems = (items: DayItem[]): DayItem[] => items.filter((i) => i.start !== null).sort((a, b) => a.start! - b.start!)
export const floatItems = (items: DayItem[]): DayItem[] => items.filter((i) => i.start === null)

/** 某天的完成度；将来的日子返回 null。跨午夜的下半段不重复计数 */
export function dayRatio(data: AppData, progress: Record<string, AutoProgress>, date: string): number | null {
  if (date > todayKey()) return null
  const items = dayItems(data, progress, date).filter((i) => i.part !== 'tail')
  if (!items.length) return 0
  return items.filter((i) => i.done).length / items.length
}

export const carriedLabel = (days: number): string => (days === 1 ? '昨天' : `${days} 天前`)
