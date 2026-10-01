// 一句话添加日程：从中文自然语言里识别日期、时间、时长、重复和「智能完成」规则
import { addDays, dayDiff, fromKey, fromMin, pad, toKey } from './schedule'
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
  /** 全天 / 多天 */
  allDay: boolean
  /** 结束在开始那天之后的第几天 */
  days: number
  /** 结束说不准：range 在第 days 到第 daysMax 天之间 · open 做完为止 */
  endMode?: 'range' | 'open'
  daysMax?: number
  /** 开始说不准：最晚在 date 之后第 startMax 天开始 */
  startMax?: number
  repeat: Repeat
  auto: { kind: 'app' | 'title'; apps: string[]; keywords: string[]; minutes: number } | null
  tokens: QuickToken[]
}

const WD: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const WD_LABEL = ['日', '一', '二', '三', '四', '五', '六']
const CN_NUM: Record<string, number> = { 半: 0.5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

const dow = (key: string): number => fromKey(key).getDay()

/** 「十二」「二十」「两」这样的中文数字 */
function cnNum(w: string): number {
  if (/^\d+$/.test(w)) return Number(w)
  const m = w.match(/^([一两二三四五六七八九])?十([一二三四五六七八九])?$/)
  if (m) return (m[1] ? CN_NUM[m[1]] : 1) * 10 + (m[2] ? CN_NUM[m[2]] : 0)
  return CN_NUM[w] ?? NaN
}
const NUM = '(\\d{1,3}|[一两二三四五六七八九]?十[一二三四五六七八九]?|[半一两二三四五六七八九])'
const UNIT = '(?:个)?(天|周|星期|礼拜|月)'
const unitDays = (u: string): number => (u === '天' ? 1 : u === '月' ? 30 : 7)

/** 一段说不准具体哪天的时间：下个月、下周、10 月中旬、月底 */
const PERIOD_W = '下个?月|下个?(?:周|星期|礼拜)(?![一二三四五六日天])|\\d{1,2}月(?:初|上旬|中旬|中|下旬|底|末)|(?:这个?|本)?月(?:初|中旬|下旬|底|末)'

function periodOf(w: string, today: string): [string, string] | null {
  const t = fromKey(today)
  if (/^下个?月$/.test(w)) return [toKey(new Date(t.getFullYear(), t.getMonth() + 1, 1)), toKey(new Date(t.getFullYear(), t.getMonth() + 2, 0))]
  if (/^下个?(?:周|星期|礼拜)$/.test(w)) {
    const monday = addDays(today, -((dow(today) + 6) % 7) + 7)
    return [monday, addDays(monday, 6)]
  }
  const m = w.match(/^(?:(\d{1,2})月|(?:这个?|本)?月)(初|上旬|中旬|中|下旬|底|末)$/)
  if (!m) return null
  const month = m[1] ? Number(m[1]) - 1 : t.getMonth()
  if (month > 11) return null
  const [d0, d1] = /初|上旬/.test(m[2]) ? [1, 10] : /中/.test(m[2]) ? [11, 20] : [21, 0]
  const range = (y: number): [string, string] => [toKey(new Date(y, month, d0)), toKey(d1 ? new Date(y, month, d1) : new Date(y, month + 1, 0))]
  let r = range(t.getFullYear())
  if (r[1] < today) r = range(t.getFullYear() + 1)
  return [r[0] < today ? today : r[0], r[1]]
}

/** 列表里的短日期：今天 / 明天 / 后天 / 10月8日 */
function shortLabel(date: string, today: string): string {
  if (date === today) return '今天'
  if (date === addDays(today, 1)) return '明天'
  if (date === addDays(today, 2)) return '后天'
  const d = fromKey(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

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

const PERIOD = '(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|今晚)?'
const POINT = '(\\d{1,2})(?:[:：](\\d{2})|点(?:(半)|(\\d{1,2})分?)?)'
const SEP = '(?:到|至|-|–|—|~|～)'
/** 能当作日期的说法（用于「A 到 B」） */
const DW = '(?:大后天|后天|明天|明日|今天|今日|下个?(?:周|星期|礼拜)[一二三四五六日天]|(?:这|本)?(?:周|星期|礼拜)[一二三四五六日天]|\\d{1,2}月\\d{1,2}[日号]?|\\d{1,2}[日号])'

const validKey = (d: string): boolean => {
  const x = fromKey(d)
  return !Number.isNaN(x.getTime()) && `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` === d
}

/**
 * 把一个日期说法换成日期；from 不为空时表示「A 到 B」里的 B，取 from 当天或之后最近的那天。
 * keepPast：「9 月 19 日到 21 日」这种正在进行的时段，开始日期可以在今天之前
 */
function dateWord(w: string, today: string, from: string | null, keepPast = false): string | null {
  const rel = ({ 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3 } as Record<string, number>)[w]
  if (rel !== undefined) return addDays(today, rel)
  const ref = from ?? today
  let m = w.match(/^下个?(?:周|星期|礼拜)([一二三四五六日天])$/)
  if (m) {
    const monday = addDays(today, -((dow(today) + 6) % 7) + 7)
    return addDays(monday, (WD[m[1]] + 6) % 7)
  }
  m = w.match(/^(这|本)?(?:周|星期|礼拜)([一二三四五六日天])$/)
  if (m) {
    if (from) return addDays(from, (WD[m[2]] - dow(from) + 7) % 7)
    const monday = addDays(today, -((dow(today) + 6) % 7))
    const d = addDays(monday, (WD[m[2]] + 6) % 7)
    return !m[1] && d < today ? addDays(d, 7) : d
  }
  const y = fromKey(ref).getFullYear()
  m = w.match(/^(\d{1,2})月(\d{1,2})[日号]?$/)
  if (m) {
    let d = `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
    if (d < ref && !keepPast) d = `${y + 1}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
    return validKey(d) ? d : null
  }
  m = w.match(/^(\d{1,2})[日号]$/)
  if (m) {
    const r = fromKey(ref)
    let d = `${y}-${pad(r.getMonth() + 1)}-${pad(Number(m[1]))}`
    if (d < ref && !keepPast) {
      const next = new Date(r.getFullYear(), r.getMonth() + 1, Number(m[1]))
      d = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
    }
    return validKey(d) ? d : null
  }
  return null
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

  // ---- 跨天的说法：「到明早 7 点」「到次日 7 点」统一成「次日」，避免「明天」被当成日期 ----
  s = s.replace(
    new RegExp(`(${SEP})\\s*(?:明天|明日|明早|次日|第二天|隔天)\\s*(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?(?=\\s*\\d)`),
    (m0: string, sep: string, p?: string) => `${sep} 次日${p ?? (/明早/.test(m0) ? '早上' : '')}`
  )

  // ---- 日期 ----
  let date = today
  let dateFound = false
  let allDay = false
  let days = 0
  let start: number | null = null
  let end: number | null = null
  const setDate = (d: string): void => {
    date = d
    dateFound = true
  }
  const pointMin = (mm?: string, half?: string, mm2?: string): number => Number(mm ?? mm2 ?? (half ? 30 : 0))
  /** 「A 到 B」：正在进行的时段（B 还没过）保留今天之前的开始日期，整段都过去了才往后顺延 */
  const rangeOf = (w1: string, w2: string): [string, string] | null => {
    const a = dateWord(w1, today, null, true)
    const b = a && dateWord(w2, today, a)
    if (a && b && b >= today) return [a, b]
    const c = dateWord(w1, today, null)
    const d = c && dateWord(w2, today, c)
    return c && d ? [c, d] : null
  }

  let m: RegExpMatchArray | null
  // 周五晚上 6 点到周日晚上 8 点：跨好几天、带时间
  if ((m = take(new RegExp(`(${DW})\\s*${PERIOD}\\s*${POINT}\\s*${SEP}\\s*(${DW})\\s*${PERIOD}\\s*${POINT}`)))) {
    const [, w1, p1, h1, m1, half1, mm1, w2, p2, h2, m2, half2, mm2] = m
    const r = rangeOf(w1, w2)
    if (r) {
      const [d1, d2] = r
      const hasPeriod = !!(p1 || p2)
      setDate(d1)
      start = toHour(Number(h1), p1, !hasPeriod) * 60 + pointMin(m1, half1, mm1)
      end = dayDiff(d1, d2) * 1440 + toHour(Number(h2), p2, !hasPeriod) * 60 + pointMin(m2, half2, mm2)
    }
  } else if ((m = take(new RegExp(`从?(${DW})\\s*${SEP}\\s*(${DW})`)))) {
    // 周五到周日、9 月 19 日到 21 日：全天、跨好几天
    const r = rangeOf(m[1], m[2])
    if (r) {
      const [d1, d2] = r
      setDate(d1)
      allDay = true
      days = Math.max(0, dayDiff(d1, d2))
    }
  } else if ((m = take(/大后天|后天|明天|明日|今天|今日/))) {
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
    if (validKey(d)) setDate(d)
  } else if ((m = take(/(?<![\d月])(\d{1,2})[号日](?!\d)/))) {
    const t = fromKey(today)
    let d = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Number(m[1]))}`
    if (d < today) {
      const next = new Date(t.getFullYear(), t.getMonth() + 1, Number(m[1]))
      d = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
    }
    setDate(d)
  }

  // 「明天起」「从周五开始」里的「起 / 开始」不算标题
  if (dateFound) s = s.replace(/^\s*从?\s*(?:起|开始)(?=\s)/, ' ')

  // ---- 时间 ----
  if (start === null && !allDay) {
    const range = take(new RegExp(`${PERIOD}\\s*${POINT}\\s*${SEP}\\s*(次日)?\\s*${PERIOD}\\s*${POINT}`))
    if (range) {
      const [, p1, h1, m1, half1, mm1, nextDay, p2, h2, m2, half2, mm2] = range
      const hasPeriod = !!(p1 || p2)
      start = toHour(Number(h1), p1, !hasPeriod) * 60 + pointMin(m1, half1, mm1)
      end = toHour(Number(h2), p2 ?? (nextDay ? undefined : p1), !hasPeriod) * 60 + pointMin(m2, half2, mm2)
      if (nextDay) end += 1440
      else if (end <= start && end + 720 > start) end += 720
      // 结束比开始还早：过了午夜，算到第二天
      if (end <= start) end += 1440
      if (p1 === '今晚' && !dateFound) setDate(today)
    } else {
      const single = take(new RegExp(`${PERIOD}\\s*${POINT}`))
      if (single) {
        const [, p, h, mm, half, mm2] = single
        start = toHour(Number(h), p, true) * 60 + pointMin(mm, half, mm2)
        if (p === '今晚' && !dateFound) setDate(today)
      }
    }
  }
  if (start !== null && (start >= 24 * 60 || (end !== null && (end <= start || end - start > 60 * 1440)))) {
    start = null
    end = null
  }

  // ---- 说不准的开始和结束（不定时间的事才有）----
  let endMode: 'range' | 'open' | undefined
  let startMax = 0
  /** 预计的总天数范围，或者预计结束的日期范围 */
  let length: [number, number] | null = null
  let endPeriod: [string, string] | null = null
  if (start === null && repeat.type === 'none') {
    // 「找到为止」「做完为止」：还没定结束
    if (take(/(?:[做找读写搞弄学看改修练考背装][完到好定会成齐]|完成|结束)为止/)) endMode = 'open'
    // 「预计 10 月初结束」「月底前搞定」
    const ep = take(new RegExp(`(?:预计|大概|估计|争取|最晚)?\\s*在?\\s*(${PERIOD_W})\\s*(?:之?前)?\\s*(?:结束|完成|搞定|做完|完工|弄完|交)`))
    if (ep) endPeriod = periodOf(ep[1], today)
    // 「下个月找个时间开始」「10 月中旬开工」
    const sp = take(new RegExp(`从?\\s*(${PERIOD_W})\\s*(?:找个?时间|找一天|抽空|某天|的时候)?\\s*(?:开始|动工|开工|启动|动手)`))
    const sr = sp && periodOf(sp[1], today)
    if (sr) {
      setDate(sr[0])
      startMax = Math.max(0, dayDiff(sr[0], sr[1]))
    }
    // 「3 到 5 天」「两到三周」
    const rg = take(new RegExp(`(?:大概|大约|预计|估计|差不多|约莫?)?\\s*(?:要|需要|得)?\\s*${NUM}\\s*${SEP}\\s*${NUM}\\s*${UNIT}(?:左右)?`))
    if (rg) {
      const u = unitDays(rg[3])
      const a = Math.round(cnNum(rg[1]) * u)
      const b = Math.round(cnNum(rg[2]) * u)
      if (a > 0 && b > a) length = [a, b]
    }
    // 「大概两周」「预计一个月左右」：前后各留四分之一
    const ab = !length && take(new RegExp(`(?:大概|大约|预计|估计|差不多|约莫?)\\s*(?:要|需要|得)?\\s*${NUM}\\s*${UNIT}(?:左右)?|${NUM}\\s*${UNIT}左右`))
    if (ab) {
      const n = cnNum(ab[1] ?? ab[3])
      const total = Math.round(n * unitDays(ab[2] ?? ab[4]))
      if (total > 0) {
        const d = Math.max(1, Math.round(total / 4))
        length = [Math.max(1, total - d), total + d]
      }
    }
    if (endMode || endPeriod || startMax || length) allDay = true
  }

  // ---- 全天、连续几天 ----
  if (start === null) {
    if (take(/全天|一整天/)) allDay = true
    const n = take(/(?:连续|持续|为期)?\s*(\d{1,3}|[两二三四五六七八九十])\s*天(?![后前内])/) ??
      take(new RegExp(`(?:连续|持续|为期)\\s*${NUM}\\s*${UNIT}`))
    if (n) {
      allDay = true
      days = Math.max(0, Math.round(cnNum(n[1]) * (n[2] ? unitDays(n[2]) : 1)) - 1)
      if (startMax && !length) length = [days + 1, days + 1]
    }
  }

  // 把说不准的部分换成相对开始那天的天数：最早结束不早于最晚开始
  let daysMax = 0
  if (allDay && repeat.type === 'none') {
    if (endPeriod && endPeriod[1] >= date) {
      days = Math.max(startMax, dayDiff(date, endPeriod[0]))
      daysMax = Math.max(days, dayDiff(date, endPeriod[1]))
      endMode = daysMax > days ? 'range' : undefined
    } else if (length) {
      days = Math.max(startMax, length[0] - 1)
      daysMax = Math.max(days, startMax + length[1] - 1)
      endMode = daysMax > days ? 'range' : undefined
    } else if (startMax && !endMode) {
      // 只说了什么时候开始，没说多久：结束先算没定
      endMode = 'open'
    }
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
  if (start !== null && end === null) end = start + Math.min(60 * 1440, duration ?? 60)

  // ---- 组装 ----
  const title = s
    .replace(/\s+/g, ' ')
    .replace(/^[\s，,。、:：]+|[\s，,。、:：]+$/g, '')
    .trim()

  // 结束在开始那天之后的第几天；正好 24:00 结束的仍算当天
  if (start !== null && end !== null && end > 1440) {
    days = Math.floor((end - 1) / 1440)
    end -= days * 1440
  }
  if (allDay && (endMode || startMax)) {
    const sl = (k: number): string => shortLabel(addDays(date, k), today)
    tokens.push({ kind: 'date', label: startMax ? `${sl(0)}–${sl(startMax)} 之间开始` : `${sl(0)}起` })
    tokens.push({
      kind: 'date',
      label:
        endMode === 'open'
          ? '做完为止'
          : endMode === 'range'
            ? `预计 ${sl(days)}–${sl(daysMax)} 结束`
            : `${sl(days)} 结束`
    })
  } else if (allDay) {
    const last = addDays(date, days)
    tokens.push({ kind: 'date', label: days ? `${relLabel(date, today)} – ${relLabel(last, today)} · ${days + 1} 天` : `${relLabel(date, today)} 全天` })
  } else if (dateFound) tokens.push({ kind: 'date', label: repeat.type === 'none' ? relLabel(date, today) : `从${relLabel(date, today)}起` })
  if (start !== null && end !== null) {
    const endLabel = days === 0 ? fromMin(end) : days === 1 ? `次日 ${fromMin(end)}` : `${relLabel(addDays(date, days), today)} ${fromMin(end)}`
    tokens.push({ kind: 'time', label: `${fromMin(start)}–${endLabel}` })
  }
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
    start: allDay || start === null ? null : fromMin(start),
    end: allDay || end === null ? null : fromMin(end),
    allDay,
    days: start === null && !allDay ? 0 : days,
    ...(endMode ? { endMode } : {}),
    ...(endMode === 'range' ? { daysMax } : {}),
    ...(startMax ? { startMax } : {}),
    repeat,
    auto,
    tokens
  }
}
