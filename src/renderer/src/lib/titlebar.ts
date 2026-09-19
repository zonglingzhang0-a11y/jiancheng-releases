// 右上角的最小化 / 最大化 / 关闭是系统画的，网页的遮罩盖不到它。
// 弹窗、编辑侧栏、截图查看器打开时，通知主进程把它的底色换成和遮罩后的背景一样，看起来是一整片。
import { useEffect } from 'react'
import type { TitleBarTone } from '@shared/types'
import { api } from './api'

// 同时开着几层浮层时，取最深的那一层
const ORDER: TitleBarTone[] = ['light', 'scrim', 'dim', 'dark']
const active = new Map<TitleBarTone, number>()
let current: TitleBarTone = 'light'

function sync(): void {
  let tone: TitleBarTone = 'light'
  for (const t of ORDER) if ((active.get(t) ?? 0) > 0) tone = t
  if (tone === current) return
  current = tone
  api().setTitleBarTone(tone)
}

export function useTitleBarTone(open: boolean, tone: TitleBarTone): void {
  useEffect(() => {
    if (!open || document.documentElement.classList.contains('route-mini')) return
    active.set(tone, (active.get(tone) ?? 0) + 1)
    sync()
    return () => {
      active.set(tone, Math.max(0, (active.get(tone) ?? 0) - 1))
      sync()
    }
  }, [open, tone])
}
