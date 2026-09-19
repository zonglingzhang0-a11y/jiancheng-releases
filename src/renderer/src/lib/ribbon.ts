// 色带：一天的时间刻度（夜里 0–6 点压缩）与黑白明暗（白天近白、夜里浅灰）

export const NIGHT = 360
export const NF = 0.07

/** 分钟 → 0–1 的横向位置 */
export const xOf = (m: number): number => (m <= NIGHT ? (m / NIGHT) * NF : NF + ((m - NIGHT) / (1440 - NIGHT)) * (1 - NF))
export const invX = (f: number): number => (f <= NF ? (f / NF) * NIGHT : NIGHT + ((f - NF) / (1 - NF)) * (1440 - NIGHT))

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
export const smooth = (x: number): number => {
  x = clamp(x, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export interface Sun {
  rise: number
  set: number
}

/** 0 = 夜，1 = 白天；日出日落前后各约一小时柔和过渡 */
export function dayness(m: number, sun: Sun): number {
  const w = 55
  return Math.min(smooth((m - sun.rise + w) / (2 * w)), 1 - smooth((m - sun.set + w) / (2 * w)))
}

export function ribbonRGB(m: number, sun: Sun, night: number): [number, number, number] {
  const v = 251 - 19 * night * (1 - dayness(m, sun))
  return [v, v, v - 0.6]
}

export const rgbStr = (rgb: number[], a = 1): string =>
  a === 1 ? `rgb(${rgb.map(Math.round).join(',')})` : `rgba(${rgb.map(Math.round).join(',')},${a})`

/** 按压缩刻度取样的 CSS 渐变，用于迷你色带 */
export function ribbonGradient(dir: string, count: number, sun: Sun, night: number): string {
  const stops: string[] = []
  for (let i = 0; i <= count; i++) {
    const f = i / count
    stops.push(`${rgbStr(ribbonRGB(invX(f), sun, night))} ${(f * 100).toFixed(1)}%`)
  }
  return `linear-gradient(${dir}, ${stops.join(',')})`
}

/** 按真实时间线性取样的竖向渐变（侧栏时间轴） */
export function linearGradient(dir: string, m0: number, m1: number, count: number, sun: Sun, night: number): string {
  const stops: string[] = []
  for (let i = 0; i <= count; i++) {
    const m = m0 + ((m1 - m0) * i) / count
    stops.push(`${rgbStr(ribbonRGB(((m % 1440) + 1440) % 1440, sun, night))} ${((i / count) * 100).toFixed(1)}%`)
  }
  return `linear-gradient(${dir}, ${stops.join(',')})`
}

/** 在画布上逐像素画色带，叠一层极淡的噪点，避免浅色渐变出现色阶 */
export function paintRibbon(canvas: HTMLCanvasElement, cssW: number, cssH: number, sun: Sun, night: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = Math.max(1, Math.round(cssW * dpr))
  const H = Math.max(1, Math.round((cssH * dpr) / 2))
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(W, H)
  const col: [number, number, number][] = new Array(W)
  for (let x = 0; x < W; x++) col[x] = ribbonRGB(invX((x + 0.5) / W), sun, night)
  let seed = 7
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let y = 0; y < H; y++) {
    const shade = 1 - (y / H) * 0.012
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const c = col[x]
      const n = rnd() - 0.5
      img.data[i] = clamp(c[0] * shade + n, 0, 255)
      img.data[i + 1] = clamp(c[1] * shade + n, 0, 255)
      img.data[i + 2] = clamp(c[2] * shade + n, 0, 255)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

const relLum = (c: number[]): number => {
  const f = (v: number): number => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

/** WCAG 对比度 */
export const contrast = (a: number[], b: number[]): number => {
  const x = relLum(a)
  const y = relLum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
