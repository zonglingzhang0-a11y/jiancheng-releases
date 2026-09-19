import { EventEmitter } from 'events'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { prettyExe, todayKey, fromKey } from '@shared/schedule'
import type { AppInfo, MonitorStatus, Segment, Settings, UsageItem } from '@shared/types'
import { win32, type Foreground } from './win32'
import { loadSegments, saveSegments } from './store'

/** 常见应用的友好名称（优先于 exe 文件描述） */
const KNOWN_NAMES: Record<string, string> = {
  'code.exe': 'Visual Studio Code',
  'explorer.exe': '文件资源管理器',
  'chrome.exe': 'Google Chrome',
  'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Firefox',
  'weixin.exe': '微信',
  'wechat.exe': '微信',
  'qq.exe': 'QQ',
  'windowsterminal.exe': 'Windows 终端',
  'winword.exe': 'Word',
  'excel.exe': 'Excel',
  'powerpnt.exe': 'PowerPoint',
  'onenote.exe': 'OneNote',
  'obsidian.exe': 'Obsidian',
  'notion.exe': 'Notion',
  'idea64.exe': 'IntelliJ IDEA',
  'pycharm64.exe': 'PyCharm',
  'devenv.exe': 'Visual Studio',
  'cursor.exe': 'Cursor',
  'claude.exe': 'Claude',
  'feishu.exe': '飞书',
  'dingtalk.exe': '钉钉',
  'wps.exe': 'WPS Office',
  'cloudmusic.exe': '网易云音乐',
  'bilibili.exe': '哔哩哔哩'
}

/** 不计入统计的系统进程 */
const IGNORED = new Set(['lockapp.exe', 'searchhost.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe'])

export class Monitor extends EventEmitter {
  private date = todayKey()
  private segments: Segment[] = []
  private lastTick = Date.now()
  private wasIdle = false
  private dirty = false
  private apps = new Map<string, AppInfo & { lastSeen: number }>()
  private appsDirty = false
  private status: MonitorStatus
  private lastEmitKey = ''
  private activeCache = { at: 0, seconds: 0 }
  private lastFg: Foreground | null = null

  constructor(private getSettings: () => Settings) {
    super()
    this.segments = loadSegments(this.date)
    this.loadApps()
    this.status = { enabled: false, available: !!win32, idle: false, current: null, activeSeconds: 0 }
  }

  start(): void {
    setInterval(() => this.tick(), 1000)
    setInterval(() => this.flush(), 30_000)
  }

  private appsFile(): string {
    return join(app.getPath('userData'), 'apps.json')
  }

  private loadApps(): void {
    try {
      if (!existsSync(this.appsFile())) return
      const list = JSON.parse(readFileSync(this.appsFile(), 'utf8')) as (AppInfo & { lastSeen: number })[]
      for (const a of list) this.apps.set(a.exe, a)
    } catch {
      /* ignore */
    }
  }

  private register(fg: Foreground): void {
    const existing = this.apps.get(fg.exe)
    const now = Date.now()
    if (existing && existing.path === fg.path) {
      existing.lastSeen = now
      return
    }
    const name = KNOWN_NAMES[fg.exe] ?? win32?.describe(fg.path) ?? prettyExe(fg.exe)
    this.apps.set(fg.exe, { exe: fg.exe, name, path: fg.path, lastSeen: now })
    this.appsDirty = true
  }

  appInfo(exe: string): AppInfo {
    const a = this.apps.get(exe)
    return a ? { exe: a.exe, name: a.name, path: a.path } : { exe, name: KNOWN_NAMES[exe] ?? prettyExe(exe), path: '' }
  }

  recentApps(): AppInfo[] {
    return [...this.apps.values()]
      .filter((a) => !IGNORED.has(a.exe) && a.exe !== 'electron.exe')
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 40)
      .map(({ exe, name, path }) => ({ exe, name, path }))
  }

  private tick(): void {
    const now = Date.now()
    let from = this.lastTick
    this.lastTick = now
    const settings = this.getSettings()

    const key = todayKey()
    if (key !== this.date) {
      this.flush()
      this.date = key
      this.segments = []
      this.activeCache.at = 0
      from = Math.max(from, fromKey(key).getTime())
    }
    // 睡眠/卡顿导致的长间隔不计入
    if (now - from > 5000) from = now - 1000

    if (!win32 || !settings.monitorEnabled) {
      this.updateStatus({ enabled: !!settings.monitorEnabled, available: !!win32, idle: false, current: null })
      return
    }

    let fg: Foreground | null = null
    let idleMs = 0
    try {
      fg = win32.foreground()
      idleMs = win32.idleMs()
    } catch (err) {
      console.error('[monitor] 采样失败', err)
    }

    const idle = settings.idleMinutes > 0 && idleMs >= settings.idleMinutes * 60_000
    if (idle && !this.wasIdle) this.markIdleSince(now - idleMs)
    this.wasIdle = idle
    this.lastFg = fg && !IGNORED.has(fg.exe) ? fg : null

    if (fg && !IGNORED.has(fg.exe)) {
      this.register(fg)
      this.append(from, now, fg, idle)
    }

    const current = fg && !IGNORED.has(fg.exe) ? { exe: fg.exe, name: this.appInfo(fg.exe).name, title: fg.title } : null
    this.updateStatus({ enabled: true, available: true, idle, current })
  }

  private append(from: number, to: number, fg: Foreground, idle: boolean): void {
    const title = fg.title.slice(0, 200)
    const last = this.segments[this.segments.length - 1]
    const contiguous = last && Math.abs(last.e - from) < 1500 && !!last.i === idle && last.p === fg.exe
    if (contiguous && last.t === title) {
      last.e = to
    } else if (contiguous && last.e - last.s < 3000) {
      // 标题在极短时间内变化（如播放进度），合并为最新标题，避免碎片化
      last.t = title
      last.e = to
    } else {
      const seg: Segment = { s: from, e: to, p: fg.exe, t: title }
      if (idle) seg.i = 1
      this.segments.push(seg)
    }
    this.dirty = true
  }

  /** 进入空闲时，把最后一次输入之后的时间回溯标记为空闲 */
  private markIdleSince(ts: number): void {
    for (let idx = this.segments.length - 1; idx >= 0; idx--) {
      const seg = this.segments[idx]
      if (seg.e <= ts) break
      if (seg.i) continue
      if (seg.s >= ts) {
        seg.i = 1
      } else {
        this.segments.splice(idx + 1, 0, { ...seg, s: ts, i: 1 })
        seg.e = ts
        break
      }
    }
    this.activeCache.at = 0
    this.dirty = true
  }

  private activeSeconds(): number {
    const now = Date.now()
    if (now - this.activeCache.at > 5000) {
      let ms = 0
      for (const s of this.segments) if (!s.i) ms += s.e - s.s
      this.activeCache = { at: now, seconds: Math.floor(ms / 1000) }
    }
    return this.activeCache.seconds
  }

  private updateStatus(partial: Omit<MonitorStatus, 'activeSeconds'>): void {
    this.status = { ...partial, activeSeconds: this.activeSeconds() }
    const emitKey = JSON.stringify([partial, Math.floor(this.status.activeSeconds / 30)])
    if (emitKey !== this.lastEmitKey) {
      this.lastEmitKey = emitKey
      this.emit('status', this.status)
    }
  }

  getStatus(): MonitorStatus {
    return this.status
  }

  /** 最近一次采样到的前台窗口（含路径） */
  snapshot(): { fg: Foreground | null; idle: boolean } {
    return { fg: this.lastFg, idle: this.wasIdle }
  }

  getSegments(date: string): Segment[] {
    return date === this.date ? this.segments : loadSegments(date)
  }

  getUsage(date: string): UsageItem[] {
    const totals = new Map<string, number>()
    for (const s of this.getSegments(date)) {
      if (s.i) continue
      totals.set(s.p, (totals.get(s.p) ?? 0) + (s.e - s.s))
    }
    return [...totals.entries()]
      .map(([exe, ms]) => ({ ...this.appInfo(exe), seconds: Math.floor(ms / 1000) }))
      .filter((u) => u.seconds >= 30)
      .sort((a, b) => b.seconds - a.seconds)
  }

  flush(): void {
    if (this.dirty) {
      saveSegments(this.date, this.segments)
      this.dirty = false
    }
    if (this.appsDirty) {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(this.appsFile(), JSON.stringify([...this.apps.values()]), 'utf8')
      this.appsDirty = false
    }
  }
}
