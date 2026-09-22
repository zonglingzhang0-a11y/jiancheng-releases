// 和简程界面同一套字体与灰度；字体直接用简程随包的 Fontsource 文件
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/noto-serif-sc/wght.css'
import { continueRender, delayRender } from 'remotion'

export const INK = '#17181b'
export const NIGHT = '#121214'
export const PAPER = '#f8f8f7'
export const SANS = '"Noto Sans SC Variable", "Microsoft YaHei", sans-serif'
export const SERIF = '"Noto Serif SC Variable", "SimSun", serif'

/** 等用到的字形都加载好再渲染，避免第一帧用了系统字体 */
export function waitForFonts(text: string): void {
  const handle = delayRender('加载字体')
  Promise.all([document.fonts.load(`700 64px ${SERIF}`, text), document.fonts.load(`500 32px ${SANS}`, text)])
    .catch(() => undefined)
    .finally(() => continueRender(handle))
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const hex = (c: number[]): string => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** 一天里某个时刻（0–24 小时）的明暗：白天近白，日落后渐暗，和首页色带同一个节奏 */
export function dayTone(hour: number, night = [58, 59, 64], day = [244, 244, 243]): string {
  const sm = (t: number): number => {
    const x = Math.max(0, Math.min(1, t))
    return x * x * (3 - 2 * x)
  }
  const rise = 6
  const set = 18.3
  const d = hour < 12 ? sm((hour - (rise - 1)) / 2) : 1 - sm((hour - (set - 1)) / 2)
  return hex([0, 1, 2].map((i) => lerp(night[i], day[i], d)))
}
