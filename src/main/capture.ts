// 本地截屏：按间隔截取前台窗口，缩小后保存为 JPEG，仅存于本机
import { EventEmitter } from 'events'
import { desktopCapturer, screen, type NativeImage } from 'electron'
import { promises as fs, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { pad, ruleMatches, ruleWindow, tasksOn, todayKey, toKey } from '@shared/schedule'
import type { AppData, CaptureResult, CaptureStatus, Settings, Shot, ShotStats } from '@shared/types'
import { cropRect, dhash, expiredDirs, hamming, isPrivateTitle, pickDisplay, resolveInside, type PhysicalDisplay } from './capture-utils'
import type { Monitor } from './monitor'
import { win32 } from './win32'

const FULL_WIDTH = 1600
const THUMB_WIDTH = 360
/** 指纹差异不超过该值视为画面未变化 */
const SAME_THRESHOLD = 3

export class Capturer extends EventEmitter {
  private lastHash: bigint | null = null
  private lastAt: number | null = null
  private note: string | null = null
  private busy = false
  private indexCache = new Map<string, Shot[]>()

  constructor(
    private root: string,
    private ctx: { getSettings: () => Settings; getData: () => AppData; monitor: Monitor }
  ) {
    super()
  }

  start(): void {
    setInterval(() => this.tick(), 15_000)
    this.prune()
    setInterval(() => this.prune(), 3600_000)
  }

  status(): CaptureStatus {
    const s = this.ctx.getSettings()
    const enabled = s.shotEnabled && s.monitorEnabled && !!win32
    return {
      enabled,
      lastAt: this.lastAt,
      nextAt: enabled ? (this.lastAt ?? Date.now()) + s.shotInterval * 60_000 : null,
      note: enabled ? this.note : null
    }
  }

  private setNote(note: string | null): void {
    if (note === this.note) return
    this.note = note
    this.emit('status', this.status())
  }

  private async tick(): Promise<void> {
    const s = this.ctx.getSettings()
    if (!s.shotEnabled || !s.monitorEnabled || this.busy) return
    if (this.lastAt && Date.now() - this.lastAt < s.shotInterval * 60_000 - 5000) return
    await this.capture(false)
  }

  /** 截屏；manual 为手动触发（忽略间隔、范围与去重，但仍遵守隐私名单） */
  async capture(manual: boolean): Promise<CaptureResult> {
    if (this.busy) return { ok: false, reason: '正在截屏' }
    this.busy = true
    try {
      const result = await this.doCapture(manual)
      if (!result.ok) this.setNote(result.reason)
      return result
    } catch (err) {
      console.error('[capture] 截屏失败', err)
      this.setNote('截屏失败')
      return { ok: false, reason: '截屏失败' }
    } finally {
      this.busy = false
    }
  }

  private async doCapture(manual: boolean): Promise<CaptureResult> {
    const s = this.ctx.getSettings()
    if (!win32) return { ok: false, reason: '当前系统不支持' }
    const { fg, idle } = this.ctx.monitor.snapshot()
    if (!fg) return { ok: false, reason: '没有前台窗口' }
    if (fg.path === process.execPath) return { ok: false, reason: '简程自身窗口不截屏' }
    if (!manual && idle) return { ok: false, reason: '空闲中，暂停截屏' }
    if (s.shotBlocklist.includes(fg.exe)) return { ok: false, reason: `${fg.exe} 在不截屏名单中` }
    if (isPrivateTitle(fg.title)) return { ok: false, reason: '无痕 / 隐私窗口不截屏' }

    const now = Date.now()
    const taskIds = this.matchingTasks(fg.exe, fg.title, now)
    if (!manual && s.shotScope === 'tasks' && !taskIds.length) return { ok: false, reason: '当前应用与智能任务无关' }

    const image = await this.grab(s.shotTarget)
    if (!image || image.isEmpty()) return { ok: false, reason: '截屏失败' }

    const size = image.getSize()
    const full = size.width > FULL_WIDTH ? image.resize({ width: FULL_WIDTH, quality: 'good' }) : image
    const thumb = image.resize({ width: THUMB_WIDTH, quality: 'good' })
    const hash = dhash(thumb.resize({ width: 9, height: 8, quality: 'good' }).toBitmap())
    if (!manual && this.lastHash !== null && hamming(hash, this.lastHash) <= SAME_THRESHOLD) {
      this.lastAt = now
      return { ok: false, reason: '画面没有变化，已跳过' }
    }

    const date = toKey(new Date(now))
    const d = new Date(now)
    const stamp = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const base = `${stamp}-${fg.exe.replace(/\.exe$/i, '').replace(/[^\w.-]/g, '_').slice(0, 32)}`
    const dir = join(this.root, date)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, `${base}.jpg`), full.toJPEG(82))
    await fs.writeFile(join(dir, `${base}.thumb.jpg`), thumb.toJPEG(72))

    const fullSize = full.getSize()
    const shot: Shot = {
      file: `${date}/${base}.jpg`,
      thumb: `${date}/${base}.thumb.jpg`,
      t: now,
      exe: fg.exe,
      title: fg.title.slice(0, 200),
      w: fullSize.width,
      h: fullSize.height,
      taskIds
    }
    const list = this.readIndex(date)
    list.push(shot)
    await this.writeIndex(date, list)

    this.lastHash = hash
    this.lastAt = now
    this.note = null
    this.emit('shot', shot)
    this.emit('status', this.status())
    return { ok: true, shot }
  }

  private matchingTasks(exe: string, title: string, now: number): string[] {
    const date = todayKey()
    return tasksOn(this.ctx.getData().tasks, date)
      .filter((t) => {
        const rule = t.auto
        if (!rule?.enabled || rule.kind === 'file') return false
        const [from, to] = ruleWindow(t, date)
        if (now < from || now >= to) return false
        return ruleMatches({ ...rule, countIdle: true }, { s: now, e: now, p: exe, t: title })
      })
      .map((t) => t.id)
  }

  /** 截取包含前台窗口的显示器，按需裁剪到窗口区域 */
  private async grab(target: Settings['shotTarget']): Promise<NativeImage | null> {
    const rect = win32?.foregroundRect()
    const displays: (PhysicalDisplay & { scale: number })[] = screen.getAllDisplays().map((d) => ({
      id: String(d.id),
      bounds: (() => {
        const r = screen.dipToScreenRect(null, d.bounds)
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      })(),
      scale: d.scaleFactor
    }))
    const display = rect ? pickDisplay(rect, displays) : displays.find((d) => d.id === String(screen.getPrimaryDisplay().id))
    if (!display) return null

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: display.bounds.w, height: display.bounds.h },
      fetchWindowIcons: false
    })
    const source = sources.find((src) => src.display_id === display.id) ?? (sources.length === 1 ? sources[0] : null)
    if (!source || source.thumbnail.isEmpty()) return null
    const img = source.thumbnail
    if (target === 'screen' || !rect) return img
    const crop = cropRect(rect, display.bounds, img.getSize())
    return crop ? img.crop({ x: crop.x, y: crop.y, width: crop.w, height: crop.h }) : img
  }

  private indexFile(date: string): string {
    return join(this.root, date, 'index.json')
  }

  private readIndex(date: string): Shot[] {
    const cached = this.indexCache.get(date)
    if (cached) return cached
    let list: Shot[] = []
    try {
      if (existsSync(this.indexFile(date))) list = JSON.parse(readFileSync(this.indexFile(date), 'utf8'))
    } catch {
      list = []
    }
    this.indexCache.set(date, list)
    if (this.indexCache.size > 10) this.indexCache.delete(this.indexCache.keys().next().value!)
    return list
  }

  private async writeIndex(date: string, list: Shot[]): Promise<void> {
    await fs.mkdir(join(this.root, date), { recursive: true })
    const file = this.indexFile(date)
    await fs.writeFile(`${file}.tmp`, JSON.stringify(list))
    await fs.rename(`${file}.tmp`, file)
  }

  list(date: string): Shot[] {
    return this.readIndex(date).filter((s) => existsSync(join(this.root, s.file)))
  }

  async remove(file: string): Promise<void> {
    const date = file.split('/')[0]
    const list = this.readIndex(date)
    const shot = list.find((s) => s.file === file)
    if (!shot) return
    for (const rel of [shot.file, shot.thumb]) {
      const abs = resolveInside(this.root, rel)
      if (abs) await fs.rm(abs, { force: true })
    }
    await this.writeIndex(
      date,
      list.filter((s) => s.file !== file)
    )
  }

  async clear(): Promise<void> {
    this.indexCache.clear()
    this.lastHash = null
    await fs.rm(this.root, { recursive: true, force: true })
  }

  async stats(): Promise<ShotStats> {
    let count = 0
    let bytes = 0
    if (!existsSync(this.root)) return { count, bytes }
    for (const dir of await fs.readdir(this.root)) {
      const full = join(this.root, dir)
      const st = await fs.stat(full).catch(() => null)
      if (!st?.isDirectory()) continue
      for (const f of await fs.readdir(full)) {
        const fst = await fs.stat(join(full, f)).catch(() => null)
        if (!fst?.isFile()) continue
        bytes += fst.size
        if (f.endsWith('.jpg') && !f.endsWith('.thumb.jpg')) count++
      }
    }
    return { count, bytes }
  }

  resolve(rel: string): string | null {
    return resolveInside(this.root, rel)
  }

  async prune(): Promise<void> {
    try {
      if (!existsSync(this.root)) return
      const dirs = await fs.readdir(this.root)
      for (const d of expiredDirs(dirs, todayKey(), this.ctx.getSettings().shotRetention)) {
        this.indexCache.delete(d)
        await fs.rm(join(this.root, d), { recursive: true, force: true })
      }
    } catch (err) {
      console.error('[capture] 清理过期截图失败', err)
    }
  }
}
