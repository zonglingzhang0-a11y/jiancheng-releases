// 窗口管理：主窗口、快捷面板（托盘 / 全局快捷键呼出）、桌角卡片
import { BrowserWindow, globalShortcut, screen, type Rectangle, type Tray } from 'electron'
import { join } from 'path'
import type { CardSettings, CardSize, HotkeyStatus, Settings } from '@shared/types'
import { win32 } from './win32'

type Route = 'main' | 'panel' | 'card'

const PRELOAD = (): string => join(__dirname, '../preload/index.js')

/** 窗口尺寸包含四周 10px 的透明留白，用于绘制阴影 */
export const PANEL_SIZE = { width: 400, height: 600 }

export function loadRoute(win: BrowserWindow, route: Route): void {
  const hash = route === 'main' ? '' : `/${route}`
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

export function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function miniWindow(size: { width: number; height: number }, extra: Electron.BrowserWindowConstructorOptions = {}): BrowserWindow {
  return new BrowserWindow({
    ...size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload: PRELOAD(), sandbox: false, spellcheck: false, backgroundThrottling: false },
    ...extra
  })
}

/* ================= 快捷面板 ================= */

export class QuickPanel {
  private win: BrowserWindow | null = null
  private hiddenAt = 0

  create(): void {
    if (this.win && !this.win.isDestroyed()) return
    const win = miniWindow(PANEL_SIZE, { movable: false })
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.on('blur', () => this.hide())
    loadRoute(win, 'panel')
    this.win = win
  }

  get visible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible()
  }

  hide(): void {
    if (!this.visible) return
    this.win!.hide()
    this.hiddenAt = Date.now()
  }

  /** anchor=tray：贴着任务栏托盘弹出；center：在鼠标所在屏幕的上方居中弹出 */
  toggle(anchor: 'tray' | 'center', tray?: Tray | null): void {
    this.create()
    if (this.visible) return this.hide()
    // 面板打开时点击托盘图标：先触发失焦隐藏，再触发点击，此时不应重新打开
    if (anchor === 'tray' && Date.now() - this.hiddenAt < 300) return
    const win = this.win!
    const { width: W, height: H } = PANEL_SIZE
    let x: number
    let y: number
    const tb = anchor === 'tray' ? tray?.getBounds() : undefined
    if (tb && tb.width > 0) {
      const display = screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 })
      const wa = display.workArea
      const b = display.bounds
      x = clamp(tb.x + tb.width / 2 - W / 2, wa.x, wa.x + wa.width - W)
      if (wa.y > b.y) y = wa.y // 任务栏在顶部
      else if (wa.x > b.x) {
        x = wa.x // 左侧
        y = clamp(tb.y - H / 2, wa.y, wa.y + wa.height - H)
      } else if (wa.width < b.width) {
        x = wa.x + wa.width - W // 右侧
        y = clamp(tb.y - H / 2, wa.y, wa.y + wa.height - H)
      } else y = wa.y + wa.height - H // 底部
    } else {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      const wa = display.workArea
      if (anchor === 'tray') {
        x = wa.x + wa.width - W
        y = wa.y + wa.height - H
      } else {
        x = wa.x + Math.round((wa.width - W) / 2)
        y = wa.y + Math.round(wa.height * 0.14)
      }
    }
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: H })
    win.show()
    win.focus()
    win.webContents.send('panel:shown')
  }
}

/* ================= 桌角卡片 ================= */

/** 卡片本身的尺寸；窗口四周各多留 SHADOW 像素透明边距画阴影 */
export const CARD_INNER = { s: { width: 264, height: 116 }, m: { width: 320, height: 240 } }
export const SIDE_WIDTH = 360
const SHADOW = 12

export class DeskCard {
  private win: BrowserWindow | null = null
  private hiddenForFullscreen = false
  private watcher: NodeJS.Timeout | null = null
  private lastSize: CardSize | null = null

  constructor(
    private ctx: {
      getSettings: () => Settings
      savePos: (pos: { x: number; y: number }) => void
    }
  ) {}

  private get card(): CardSettings {
    return this.ctx.getSettings().card
  }

  /** 按尺寸算窗口位置：侧栏贴屏幕左右边、占满高度；小卡中卡默认在右下角 */
  private bounds(c: CardSettings, prev?: Rectangle): Rectangle {
    const primary = screen.getPrimaryDisplay().workArea
    if (c.size === 'side') {
      const wa = (prev ? screen.getDisplayMatching(prev) : c.pos ? screen.getDisplayNearestPoint(c.pos) : screen.getPrimaryDisplay()).workArea
      const width = SIDE_WIDTH + SHADOW * 2
      const ref = prev ?? (c.pos ? { ...c.pos, width, height: 1 } : null)
      const left = !!ref && ref.x + ref.width / 2 < wa.x + wa.width / 2
      return { x: left ? wa.x : wa.x + wa.width - width, y: wa.y, width, height: wa.height }
    }
    const inner = CARD_INNER[c.size]
    const width = inner.width + SHADOW * 2
    const height = inner.height + SHADOW * 2
    if (prev) {
      // 换尺寸时保持离屏幕边最近的那个角不动
      const wa = screen.getDisplayMatching(prev).workArea
      const right = prev.x + prev.width / 2 > wa.x + wa.width / 2
      const bottom = prev.y + prev.height / 2 > wa.y + wa.height / 2
      const x = right ? Math.min(prev.x + prev.width, wa.x + wa.width) - width : prev.x
      const y = bottom ? Math.min(prev.y + prev.height, wa.y + wa.height) - height : prev.y
      return { x: clamp(x, wa.x, wa.x + wa.width - width), y: clamp(y, wa.y, wa.y + wa.height - height), width, height }
    }
    const pos = c.pos ?? { x: primary.x + primary.width - width, y: primary.y + primary.height - height }
    const wa = screen.getDisplayMatching({ ...pos, width, height }).workArea
    return { x: clamp(pos.x, wa.x, wa.x + wa.width - width), y: clamp(pos.y, wa.y, wa.y + wa.height - height), width, height }
  }

  /** 按设置显示 / 隐藏 / 调整尺寸和层级 */
  apply(): void {
    const c = this.card
    if (!c.enabled) {
      if (this.win && !this.win.isDestroyed()) this.win.destroy()
      this.win = null
      this.lastSize = null
      this.stopWatch()
      return
    }
    if (!this.win || this.win.isDestroyed()) this.create(c)
    else {
      if (this.lastSize !== c.size) {
        const b = this.bounds(c, this.win.getBounds())
        this.win.setResizable(true)
        this.win.setBounds(b)
        this.win.setResizable(false)
        this.lastSize = c.size
        this.ctx.savePos({ x: b.x, y: b.y })
      }
      this.applyLayer()
    }
    this.startWatch()
  }

  private create(c: CardSettings): void {
    const b = this.bounds(c)
    const win = miniWindow({ width: b.width, height: b.height }, { x: b.x, y: b.y, alwaysOnTop: c.layer === 'top' })
    win.on('moved', () => this.snap())
    // 贴在桌面：点过卡片后，焦点一离开就退回到其他窗口下面
    win.on('blur', () => {
      if (this.card.layer === 'desktop') this.toBottom()
    })
    win.once('ready-to-show', () => {
      if (!this.hiddenForFullscreen) win.showInactive()
      this.applyLayer()
    })
    loadRoute(win, 'card')
    this.win = win
    this.lastSize = c.size
  }

  private applyLayer(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    if (this.card.layer === 'top') win.setAlwaysOnTop(true, 'floating')
    else {
      win.setAlwaysOnTop(false)
      this.toBottom()
    }
  }

  private toBottom(): void {
    const win = this.win
    if (win && !win.isDestroyed() && win32) win32.sendToBottom(win.getNativeWindowHandle())
  }

  /** 拖动结束后吸附：侧栏吸到左右边并占满高度，小卡中卡吸到附近的屏幕边缘 */
  private snap(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    const b = win.getBounds()
    const wa = screen.getDisplayMatching(b).workArea
    if (this.card.size === 'side') {
      const nb = this.bounds(this.card, b)
      if (nb.x !== b.x || nb.y !== b.y || nb.height !== b.height) {
        win.setResizable(true)
        win.setBounds(nb)
        win.setResizable(false)
      }
      this.ctx.savePos({ x: nb.x, y: nb.y })
      return
    }
    const M = 28
    let { x, y } = b
    if (x - wa.x < M) x = wa.x
    if (wa.x + wa.width - (x + b.width) < M) x = wa.x + wa.width - b.width
    if (y - wa.y < M) y = wa.y
    if (wa.y + wa.height - (y + b.height) < M) y = wa.y + wa.height - b.height
    x = clamp(x, wa.x, wa.x + wa.width - b.width)
    y = clamp(y, wa.y, wa.y + wa.height - b.height)
    if (x !== b.x || y !== b.y) win.setPosition(x, y)
    this.ctx.savePos({ x, y })
  }

  private startWatch(): void {
    if (this.watcher) return
    this.watcher = setInterval(() => this.checkFullscreen(), 1500)
  }

  private stopWatch(): void {
    if (this.watcher) clearInterval(this.watcher)
    this.watcher = null
    this.hiddenForFullscreen = false
  }

  /** 置顶时，前台是全屏应用（视频、游戏、演示）且与卡片在同一块屏幕就先隐藏 */
  private checkFullscreen(): void {
    const win = this.win
    if (!win || win.isDestroyed() || !win32) return
    const c = this.card
    let full = false
    if (c.hideFullscreen && c.layer === 'top') {
      const fg = win32.foreground()
      // 桌面本身（explorer）和简程自己的窗口不算
      if (!fg || fg.path === process.execPath || fg.exe === 'explorer.exe') return
      const rect = win32.foregroundRect()
      if (rect) {
        const display = screen.getDisplayMatching(win.getBounds())
        const phys: Rectangle = screen.dipToScreenRect(null, display.bounds)
        full = rect.x <= phys.x + 1 && rect.y <= phys.y + 1 && rect.x + rect.w >= phys.x + phys.width - 1 && rect.y + rect.h >= phys.y + phys.height - 1
      }
    }
    if (full === this.hiddenForFullscreen) return
    this.hiddenForFullscreen = full
    if (full) win.hide()
    else {
      win.showInactive()
      this.applyLayer()
    }
  }
}

/* ================= 全局快捷键 ================= */

export function registerHotkey(accelerator: string, onPress: () => void): HotkeyStatus {
  globalShortcut.unregisterAll()
  if (!accelerator) return { accelerator: '', ok: true }
  try {
    return { accelerator, ok: globalShortcut.register(accelerator, onPress) }
  } catch {
    return { accelerator, ok: false }
  }
}
