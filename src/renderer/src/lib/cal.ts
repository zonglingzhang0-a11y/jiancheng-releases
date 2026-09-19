// 农历、节气、日出日落
import { fromKey, pad } from '@shared/schedule'

const CN_DAY = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']
const CN_MON = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']

let lunarFmt: Intl.DateTimeFormat | null = null
try {
  lunarFmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' })
} catch {
  lunarFmt = null
}

/** 农历八月初八 */
export function lunar(d: Date): string {
  if (!lunarFmt) return ''
  try {
    const parts = lunarFmt.formatToParts(d)
    let mon = parts.find((p) => p.type === 'month')?.value ?? ''
    let day = parts.find((p) => p.type === 'day')?.value ?? ''
    if (/\d/.test(mon)) {
      const leap = /闰/.test(mon)
      mon = `${leap ? '闰' : ''}${CN_MON[parseInt(mon.replace(/\D/g, ''), 10) - 1]}月`
    }
    if (/^\d+$/.test(day)) day = CN_DAY[parseInt(day, 10) - 1]
    return `农历${mon}${day}`
  } catch {
    return ''
  }
}

const TERMS = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至']
const TC = [5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37, 7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94]

/** 当前所处节气及第几天（21 世纪通式，误差不超过 1 天） */
export function termOf(d: Date): { name: string; days: number } {
  const y = d.getFullYear()
  const Y = y % 100
  let best: { name: string; date: Date } | null = null
  for (let i = 0; i < 24; i++) {
    const L = i < 4 ? Math.floor((Y - 1) / 4) : Math.floor(Y / 4)
    const td = new Date(y, Math.floor(i / 2), Math.floor(Y * 0.2422 + TC[i]) - L)
    if (td <= d) best = { name: TERMS[i], date: td }
  }
  if (!best) return { name: '冬至', days: Math.round((d.getTime() - new Date(y - 1, 11, 22).getTime()) / 86400000) }
  return { name: best.name, days: Math.round((d.getTime() - best.date.getTime()) / 86400000) }
}

export function termLabel(d: Date): string {
  const t = termOf(d)
  return t.days === 0 ? `今日${t.name}` : `${t.name}第 ${t.days + 1} 天`
}

/** 日出日落（分钟）。默认按北京的经纬度估算，用于色带明暗和太阳轨迹 */
export function sunTimes(d: Date, lat = 39.9, lon = 116.4, tz = 8): { rise: number; set: number } {
  const n = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000)
  const g = ((2 * Math.PI) / 365) * (n - 1)
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const r = Math.PI / 180
  const cos = Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(decl)) - Math.tan(lat * r) * Math.tan(decl)
  const ha = Math.acos(Math.max(-1, Math.min(1, cos))) / r
  return { rise: 720 - 4 * (lon + ha) - eq + tz * 60, set: 720 - 4 * (lon - ha) - eq + tz * 60 }
}

export const sunOf = (key: string): { rise: number; set: number } => sunTimes(fromKey(key))

/** 分钟 → HH:mm */
export const hm = (m: number): string => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m % 60))}`

/** 1 小时 05 分 / 25 分钟 */
export function longDur(min: number): string {
  if (min < 60) return `${Math.max(1, Math.ceil(min))} 分钟`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

/** 1:05 / 25 分 */
export function shortDur(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)}:${pad(Math.floor(min % 60))}` : `${Math.max(1, Math.ceil(min))} 分`
}
