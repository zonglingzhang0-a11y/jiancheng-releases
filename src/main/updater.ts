// 自动更新：从 GitHub Releases 检查新版本，后台下载，重启或退出时安装
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

const HOURS = 3600_000

/** 把更新失败的原因翻译成用户看得懂的话 */
function friendly(err: unknown): string {
  const s = String((err as Error)?.message ?? err)
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|net::|socket hang up|timeout/i.test(s)) return '连不上 GitHub，稍后会自动再试'
  if (/404|Cannot find latest|No published versions/i.test(s)) return '还没有可用的新版本'
  if (/sha512|checksum/i.test(s)) return '下载的安装包校验没通过，稍后会重新下载'
  return '检查更新时出了点问题，稍后会自动再试'
}

export class Updater {
  status: UpdateStatus = { state: 'idle', current: app.getVersion() }
  private timer: NodeJS.Timeout | null = null

  constructor(
    private ctx: {
      onStatus: (s: UpdateStatus) => void
      log: (kind: string, detail: unknown) => void
      notify: (title: string, body: string) => void
    }
  ) {}

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch, current: app.getVersion() }
    this.ctx.onStatus(this.status)
  }

  start(): void {
    // 开发模式下没有打包信息，不检查
    if (!app.isPackaged) {
      this.set({ state: 'dev' })
      return
    }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking', message: undefined }))
    autoUpdater.on('update-available', (info) => this.set({ state: 'downloading', next: info.version, percent: 0 }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'latest', checkedAt: Date.now() }))
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => {
      this.set({ state: 'ready', next: info.version, percent: 100 })
      this.ctx.notify(`简程 ${info.version} 已下载好`, '重启简程就能用上新版本；不重启的话，下次退出时会自动安装。')
    })
    autoUpdater.on('error', (err) => {
      this.ctx.log('update-error', String((err as Error)?.stack ?? err))
      // 已经下载好的更新不受后续检查失败的影响
      if (this.status.state !== 'ready') this.set({ state: 'error', message: friendly(err), checkedAt: Date.now() })
    })

    setTimeout(() => this.check(), 15_000)
    this.timer = setInterval(() => this.check(), 4 * HOURS)
  }

  check(): void {
    if (!app.isPackaged) return
    if (this.status.state === 'checking' || this.status.state === 'downloading' || this.status.state === 'ready') return
    autoUpdater.checkForUpdates().catch(() => {
      /* 错误已在 error 事件里处理 */
    })
  }

  /** 立即重启并安装已下载的更新 */
  install(): void {
    if (this.status.state !== 'ready') return
    if (this.timer) clearInterval(this.timer)
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }
}
