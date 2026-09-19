import type { Segment, Shot } from './types'

export interface Session {
  exe: string
  s: number
  e: number
  /** 活跃秒数（不含空闲） */
  seconds: number
  /** 按停留时长排序的窗口标题 */
  titles: { title: string; seconds: number }[]
  shots: Shot[]
}

/**
 * 把零碎的活动片段整理成「使用时段」：
 * 忽略空闲和极短的切换（如 Alt+Tab 路过），同一应用间隔不超过 gapMs 的片段合并。
 */
export function buildSessions(segments: Segment[], shots: Shot[] = [], opts = { minSegMs: 20_000, gapMs: 120_000, minSessionMs: 60_000 }): Session[] {
  const sessions: (Session & { titleMap: Map<string, number> })[] = []
  for (const seg of segments) {
    if (seg.i || seg.e - seg.s < opts.minSegMs) continue
    const last = sessions[sessions.length - 1]
    const dur = seg.e - seg.s
    if (last && last.exe === seg.p && seg.s - last.e <= opts.gapMs) {
      last.e = Math.max(last.e, seg.e)
      last.seconds += dur / 1000
      last.titleMap.set(seg.t, (last.titleMap.get(seg.t) ?? 0) + dur / 1000)
    } else {
      sessions.push({ exe: seg.p, s: seg.s, e: seg.e, seconds: dur / 1000, titles: [], shots: [], titleMap: new Map([[seg.t, dur / 1000]]) })
    }
  }
  const sorted = [...shots].sort((a, b) => a.t - b.t)
  return sessions
    .filter((x) => x.e - x.s >= opts.minSessionMs)
    .map(({ titleMap, ...x }) => ({
      ...x,
      seconds: Math.round(x.seconds),
      titles: [...titleMap.entries()]
        .filter(([t]) => t.trim())
        .map(([title, seconds]) => ({ title, seconds: Math.round(seconds) }))
        .sort((a, b) => b.seconds - a.seconds),
      // 截图按时间归入所在时段（允许 60 秒误差）
      shots: sorted.filter((sh) => sh.t >= x.s - 60_000 && sh.t <= x.e + 60_000 && sh.exe === x.exe)
    }))
}
