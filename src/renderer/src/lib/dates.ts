import { addDays, fromKey, toKey, todayKey } from '@shared/schedule'

export const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六']

export const weekdayOf = (key: string): number => fromKey(key).getDay()

export function dayTitle(key: string): string {
  const d = fromKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function monthTitle(key: string): string {
  const d = fromKey(key)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

export function relativeLabel(key: string): string | null {
  const t = todayKey()
  if (key === t) return '今天'
  if (key === addDays(t, 1)) return '明天'
  if (key === addDays(t, -1)) return '昨天'
  return null
}

export function startOfWeek(key: string, weekStart: number): string {
  const dow = weekdayOf(key)
  return addDays(key, -((dow - weekStart + 7) % 7))
}

export function weekDates(key: string, weekStart: number): string[] {
  const start = startOfWeek(key, weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function monthMatrix(key: string, weekStart: number): string[] {
  const d = fromKey(key)
  const first = toKey(new Date(d.getFullYear(), d.getMonth(), 1))
  const start = startOfWeek(first, weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key)
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), last))
  return toKey(target)
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function isoWeek(key: string): number {
  const d = fromKey(key)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayNr = (target.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}

export function durationLabel(minutes: number): string {
  if (minutes <= 0) return '0 分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} 分钟`
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}
