// 某一天的事项：定时日程、随时待办、从前几天顺延过来的待办
import { addDays, fromKey, occurrenceKey, tasksOn, todayKey, toMin } from '@shared/schedule'
import type { AppData, AutoProgress, Task } from '@shared/types'
import { iconOf } from './icons'

export interface DayItem {
  task: Task
  /** 完成记录用的日期：顺延的待办用它原来的日期 */
  date: string
  key: string
  done: boolean
  by: 'manual' | 'auto' | null
  /** 完成的时间，决定完成后在左下角排第几个 */
  doneAt: number
  /** 分钟；随时待办为 null */
  start: number | null
  end: number | null
  /** 顺延了几天，0 表示当天的 */
  carried: number
  icon: string
  subs: { id: string; title: string; done: boolean }[]
  progress: AutoProgress | null
}

const CARRY_DAYS = 7

function build(data: AppData, progress: Record<string, AutoProgress>, task: Task, date: string, carried: number): DayItem {
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
    start: task.start ? toMin(task.start) : null,
    end: task.end ? toMin(task.end) : task.start ? toMin(task.start) + 60 : null,
    carried,
    icon: iconOf(task),
    subs: (task.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, done: s.doneOn.includes(date) })),
    progress: p
  }
}

export function dayItems(data: AppData, progress: Record<string, AutoProgress>, date: string): DayItem[] {
  const items = tasksOn(data.tasks, date).map((t) => build(data, progress, t, date, 0))
  if (date === todayKey()) {
    // 最近几天没做完的一次性待办（不限时间），顺延到今天继续漂着；今天才做完的留到今天结束
    const from = addDays(date, -CARRY_DAYS)
    const dayStart = fromKey(date).getTime()
    for (const t of data.tasks) {
      if (t.repeat.type !== 'none' || t.start || t.date >= date || t.date < from) continue
      const c = data.completions[occurrenceKey(t.id, t.date)]
      if (c?.done && c.at < dayStart) continue
      const days = Math.round((fromKey(date).getTime() - fromKey(t.date).getTime()) / 86400000)
      items.push(build(data, progress, t, t.date, days))
    }
  }
  return items
}

export const timedItems = (items: DayItem[]): DayItem[] => items.filter((i) => i.start !== null).sort((a, b) => a.start! - b.start!)
export const floatItems = (items: DayItem[]): DayItem[] => items.filter((i) => i.start === null)

/** 某天的完成度；将来的日子返回 null */
export function dayRatio(data: AppData, progress: Record<string, AutoProgress>, date: string): number | null {
  if (date > todayKey()) return null
  const items = dayItems(data, progress, date)
  if (!items.length) return 0
  return items.filter((i) => i.done).length / items.length
}

export const carriedLabel = (days: number): string => (days === 1 ? '昨天' : `${days} 天前`)
