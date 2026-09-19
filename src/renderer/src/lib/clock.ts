import { useEffect, useState } from 'react'
import { todayKey } from '@shared/schedule'

export const nowSec = (): number => {
  const d = new Date()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000
}

/** 每秒（或指定间隔）刷新一次的当前时刻，单位秒 */
export function useNowSec(interval = 1000): number {
  const [s, setS] = useState(nowSec)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const tick = (): void => {
      setS(nowSec())
      // 对齐到整秒，秒针不会忽快忽慢
      t = setTimeout(tick, interval - (Date.now() % Math.min(interval, 1000)))
    }
    t = setTimeout(tick, interval - (Date.now() % Math.min(interval, 1000)))
    return () => clearTimeout(t)
  }, [interval])
  return s
}

/** 分钟精度的当前时刻；跨过零点时 today 也会更新 */
export function useNowMin(): { min: number; today: string } {
  const s = useNowSec(15_000)
  return { min: s / 60, today: todayKey() }
}
