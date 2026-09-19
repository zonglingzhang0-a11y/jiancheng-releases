// 一句话添加日程：从中文自然语言里识别日期、时间、时长、重复和「智能完成」规则
import { addDays, fromKey, fromMin, pad } from './schedule'
import type { Repeat } from './types'

export interface QuickApp {
  exe: string
  name: string
}

export interface QuickToken {
  kind: 'date' | 'time' | 'repeat' | 'rule'
  label: string
}

export interface QuickParsed {
  title: string
  date: string
  start: string | null
  end: string | null
  repeat: Repeat
  auto: { kind: 'app' | 'title'; apps: string[]; keywords: string[]; minutes: number } | null
  tokens: QuickToken[]
}

const WD: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const WD_LABEL = ['日', '一', '二', '三', '四', '五', '六']
const CN_NUM: Record<string, number> = { 半: 0.5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }

const dow = (key: string): number => fromKey(key).getDay()

function relLabel(date: string, today: string): string {
  if (date === today) return '今天'
  if (date === addDays(today, 1)) return '明天'
  if (date === addDays(today, 2)) return '后天'
  const d = fromKey(date)
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WD_LABEL[d.getDay()]}`
}

/** 在最近使用的应用中查找：进程名 → 名称包含 → 按字母顺序的模糊匹配 */
export function matchApp(query: string, apps: QuickApp[]): QuickApp | null {
  const q = query.toLowerCase().replace(/\s+/g, '').replace(/\.exe$/, '')
  if (!q) return null
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '')
  const exact = apps.find((a) => a.exe.replace(/\.exe$/, '') === q || norm(a.name) === q)
  if (exact) return exact
  const contains = apps.find((a) => norm(a.name).includes(q) || a.exe.includes(q))
  if (contains) return contains
  if (q.length >= 4) {
    const isSubsequence = (text: string): boolean => {
      let i = 0
      for (const ch of text) if (ch === q[i]) i++
      return i === q.length
    }
    return apps.find((a) => isSubsequence(norm(a.name))) ?? null
  }
  return null
}

function toHour(h: number, period: string | undefined, fallbackPm: boolean): number {
  if (period) {
    if (/下午|傍晚|晚上|今晚/.test(period)) return h < 12 ? h + 12 : h
    if (period === '中午') return h <= 3 ? h + 12 : h
    if (period === '凌晨') return h === 12 ? 0 : h
    return h === 12 && period !== '上午' ? 12 : h
  }
  // 没说上午下午时，1–6 点通常指下午
  return fallbackPm && h >= 1 && h <= 6 ? h + 12 : h
}

export function parseQuick(input: string, opts: { today: string; apps?: QuickApp[] }): QuickParsed {
  const { today } = opts
  const apps = opts.apps ?? []
  let s = ` ${input.trim()} `
  const tokens: QuickToken[] = []
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = s.match(re)
    if (m) s = s.replace(m[0], ' ')
    return m
  }

  // ---- 智能完成目标：@应用名 / @关键词 ----
  let target: { app: QuickApp | null; keyword: string } | null = null
  const at = take(/[@＠]([^\s@＠，,。]+)/)
  if (at) target = { app: matchApp(at[1], apps), keyword: at[1] }

  // ---- 重复 ----
  let repeat: Repeat = { type: 'none', weekdays: [], until: null }
  let repeatLabel = ''
  if (take(/每个?工作日|工作日/)) {
    repeat = { type: 'weekdays', weekdays: [], until: null }
    repeatLabel = '工作日'
  } else if (take(/每天|每日|天天/)) {
    repeat = { type: 'daily', weekdays: [], until: null }
    repeatLabel = '每天'
  } else if (take(/每个?周末/)) {
    repeat = { type: 'weekly', weekdays: [0, 6], until: null }
    repeatLabel = '每周末'
  } else {
    const weekly = take(/每个?(?:周|星期|礼拜)([一二三四五六日天](?:[、,，和及]?[一二三四五六日天])*)?/)
    if (weekly) {
      const days = weekly[1] ? [...new Set([...weekly[1]].filter((c) => c in WD).map((c) => WD[c]))] : []
      repeat = { type: 'weekly', weekdays: days.sort((a, b) => a - b), until: null }
      repeatLabel = days.length ? `每周${days.map((d) => WD_LABEL[d]).join('、')}` : '每周'
    }
  }

  // ---- 日期 ----
  let date = today
  let dateFound = false
  const setDate = (d: string): void => {
    date = d
    dateFound = true
  }
  let m: RegExpMatchArray | null
  if ((m = take(/大后天|后天|明天|明日|今天|今日/))) {
    setDate(addDays(today, { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3 }[m[0]]!))
  } else if ((m = take(/下个?(?:周|星期|礼拜)([一二三四五六日天])/))) {
    const monday = addDays(today, -((dow(today) + 6) % 7) + 7)
    setDate(addDays(monday, (WD[m[1]] + 6) % 7))
  } else if ((m = take(/(这|本)?(?:周|星期|礼拜)([一二三四五六日天])/))) {
    const monday = addDays(today, -((dow(today) + 6) % 7))
    let d = addDays(monday, (WD[m[2]] + 6) % 7)
    if (!m[1] && d < today) d = addDays(d, 7)
    setDate(d)
  } else if ((m = take(/周末/))) {
    const wd = dow(today)
    setDate(wd === 0 ? today : addDays(today, 6 - wd))
  } else if ((m = take(/(\d{1,2})月(\d{1,2})[日号]?/) ?? take(/(?<![\d:：])(\d{1,2})\/(\d{1,2})(?![\d:：])/))) {
    const t = fromKey(today)
    let d = `${t.getFullYear()}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
    if (d < today) d = `${t.getFullYear() + 1}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
    if (!Number.isNaN(fromKey(d).getTime())) setDate(d)
  } else if ((m = take(/(?<![\d月])(\d{1,2})[号日](?!\d)/))) {
    const t = fromKey(today)
    let d = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Number(m[1]))}`
    if (d < today) {
      const next = new Date(t.getFullYear(), t.getMonth() + 1, Number(m[1]))
      d = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
    }
    setDate(d)
  }

  // ---- 时间 ----
  const PERIOD = '(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|今晚)?'
  const POINT = '(\\d{1,2})(?:[:：](\\d{2})|点(?:(半)|(\\d{1,2})分?)?)'
  let start: number | null = null
  let end: number | null = null
  const pointMin = (mm?: string, half?: string, mm2?: string): number => Number(mm ?? mm2 ?? (half ? 30 : 0))
  const range = take(new RegExp(`${PERIOD}\\s*${POINT}\\s*(?:-|–|—|~|～|到|至)\\s*${PERIOD}\\s*${POINT}`))
  if (range) {
    const [, p1, h1, m1, half1, mm1, p2, h2, m2, half2, mm2] = range
    const hasPeriod = !!(p1 || p2)
    start = toHour(Number(h1), p1, !hasPeriod) * 60 + pointMin(m1, half1, mm1)
    end = toHour(Number(h2), p2 ?? p1, !hasPeriod) * 60 + pointMin(m2, half2, mm2)
    if (end <= start && end + 720 > start) end += 720
    if (p1 === '今晚' && !dateFound) setDate(today)
  } else {
    const single = take(new RegExp(`${PERIOD}\\s*${POINT}`))
    if (single) {
      const [, p, h, mm, half, mm2] = single
      start = toHour(Number(h), p, true) * 60 + pointMin(mm, half, mm2)
      if (p === '今晚' && !dateFound) setDate(today)
    }
  }
  if (start !== null && (start >= 24 * 60 || (end !== null && end > 24 * 60))) {
    start = null
    end = null
  }

  // ---- 时长（仅在有具体时间或智能目标时才作为时长使用）----
  let duration: number | null = null
  if (start !== null || target) {
    const dur =
      take(/(\d+|[一两二三四五六])个半(?:小时|钟头)/) ??
      take(/(\d+(?:\.\d+)?|[半一两二三四五六])\s*个?\s*(?:小时|钟头|h\b)(?:\s*(\d{1,2})\s*分钟?)?/i) ??
      take(/(\d{1,3})\s*(?:分钟|min\b)/i)
    if (dur) {
      const raw = dur[0]
      const n = (v: string): number => CN_NUM[v] ?? Number(v)
      if (/个半/.test(raw)) duration = (n(dur[1]) + 0.5) * 60
      else if (/小时|钟头|h/i.test(raw)) duration = n(dur[1]) * 60 + Number(dur[2] ?? 0)
      else duration = Number(dur[1])
      duration = Math.round(duration)
    }
  }
  if (start !== null && end === null) end = Math.min(24 * 60, start + (duration ?? 60))

  // ---- 组装 ----
  const title = s
    .replace(/\s+/g, ' ')
    .replace(/^[\s，,。、:：]+|[\s，,。、:：]+$/g, '')
    .trim()

  if (dateFound) tokens.push({ kind: 'date', label: repeat.type === 'none' ? relLabel(date, today) : `从${relLabel(date, today)}起` })
  if (start !== null && end !== null) tokens.push({ kind: 'time', label: `${fromMin(start)}–${fromMin(end)}` })
  if (repeatLabel) tokens.push({ kind: 'repeat', label: repeatLabel })

  let auto: QuickParsed['auto'] = null
  if (target) {
    const minutes = duration ?? 30
    auto = target.app
      ? { kind: 'app', apps: [target.app.exe], keywords: [], minutes }
      : { kind: 'title', apps: [], keywords: [target.keyword], minutes }
    tokens.push({
      kind: 'rule',
      label: target.app ? `${target.app.name} ${minutes} 分钟` : `标题含「${target.keyword}」${minutes} 分钟`
    })
  }

  return {
    title,
    date,
    start: start === null ? null : fromMin(start),
    end: end === null ? null : fromMin(end),
    repeat,
    auto,
    tokens
  }
}
