// 截屏相关的纯函数（不依赖 Electron，便于测试）
import { isAbsolute, relative, resolve } from 'path'
import type { Rect } from './win32'

export interface PhysicalDisplay {
  id: string
  /** 物理像素边界 */
  bounds: Rect
}

/** 找到包含窗口中心点的显示器；都不包含时取重叠面积最大的 */
export function pickDisplay(rect: Rect, displays: PhysicalDisplay[]): PhysicalDisplay | null {
  if (!displays.length) return null
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const hit = displays.find((d) => cx >= d.bounds.x && cx < d.bounds.x + d.bounds.w && cy >= d.bounds.y && cy < d.bounds.y + d.bounds.h)
  if (hit) return hit
  let best = displays[0]
  let bestArea = -1
  for (const d of displays) {
    const area = intersect(rect, d.bounds)
    const a = area ? area.w * area.h : 0
    if (a > bestArea) {
      best = d
      bestArea = a
    }
  }
  return best
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.w, b.x + b.w)
  const btm = Math.min(a.y + a.h, b.y + b.h)
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : null
}

/**
 * 把窗口的物理坐标换算为显示器截图上的裁剪区域。
 * 截图尺寸可能与显示器物理尺寸略有差异，按比例换算。
 */
export function cropRect(win: Rect, display: Rect, image: { width: number; height: number }): Rect | null {
  const visible = intersect(win, display)
  if (!visible) return null
  const sx = image.width / display.w
  const sy = image.height / display.h
  const x = Math.round((visible.x - display.x) * sx)
  const y = Math.round((visible.y - display.y) * sy)
  const w = Math.min(image.width - x, Math.round(visible.w * sx))
  const h = Math.min(image.height - y, Math.round(visible.h * sy))
  return w >= 16 && h >= 16 ? { x, y, w, h } : null
}

/** 差值哈希：输入 9×8 的 BGRA 位图，输出 64 位指纹 */
export function dhash(bitmap: Uint8Array, width = 9, height = 8): bigint {
  let hash = 0n
  const gray = (x: number, y: number): number => {
    const i = (y * width + x) * 4
    return bitmap[i + 2] * 0.299 + bitmap[i + 1] * 0.587 + bitmap[i] * 0.114
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      hash = (hash << 1n) | (gray(x, y) > gray(x + 1, y) ? 1n : 0n)
    }
  }
  return hash
}

export function hamming(a: bigint, b: bigint): number {
  let v = a ^ b
  let n = 0
  while (v) {
    n += Number(v & 1n)
    v >>= 1n
  }
  return n
}

/** 解析截图相对路径，拒绝越出截图目录的路径 */
export function resolveInside(root: string, rel: string): string | null {
  if (!rel || isAbsolute(rel) || rel.includes('\0')) return null
  const abs = resolve(root, rel)
  const r = relative(root, abs)
  if (!r || r.startsWith('..') || isAbsolute(r)) return null
  return abs
}

/** 超出保留天数的日期目录 */
export function expiredDirs(dirs: string[], today: string, retentionDays: number): string[] {
  const t = new Date(`${today}T00:00:00`)
  t.setDate(t.getDate() - Math.max(1, retentionDays) + 1)
  const cutoff = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  return dirs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff)
}

const PRIVATE_TITLE = /InPrivate|Incognito|Private Browsing|无痕|隐身|隐私浏览/i

export function isPrivateTitle(title: string): boolean {
  return PRIVATE_TITLE.test(title)
}
