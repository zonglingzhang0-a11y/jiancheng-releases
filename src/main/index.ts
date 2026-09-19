import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, net, Notification, protocol, shell, Tray } from 'electron'
import { execFile } from 'child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { occurrenceKey, todayKey, uid } from '@shared/schedule'
import type { AppData, CardSettings, HotkeyStatus, ImportedFont, NavTarget, Settings, Shot, Task, TitleBarTone } from '@shared/types'
import { dataFolder, flushData, loadData, saveData } from './store'
import { Monitor } from './monitor'
import { RuleEngine } from './rules'
import { Capturer } from './capture'
import { broadcast, DeskCard, loadRoute, QuickPanel, registerHotkey } from './windows'
import { Updater } from './updater'

const APP_ID = 'com.zzl.tempo'
const SHOT_SCHEME = 'jc-shot'
const startHidden = process.argv.includes('--hidden')

// 开发版与安装版共用同一个数据目录
app.setPath('userData', join(app.getPath('appData'), 'Jiancheng'))

// 本地截图通过自定义协议提供给界面，避免直接暴露 file:// 路径
protocol.registerSchemesAsPrivileged([
  { scheme: SHOT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// 未打包时 Windows 通知需要以 exe 路径作为 AppUserModelId 才能弹出
app.setAppUserModelId(app.isPackaged ? APP_ID : process.execPath)

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let trayHintShown = false
let cardHintShown = false
let data: AppData = { version: 1, tasks: [], completions: {}, settings: {} as Settings }
let monitor: Monitor
let rules: RuleEngine
let capturer: Capturer
let hotkey: HotkeyStatus = { accelerator: '', ok: true }
const panel = new QuickPanel()
let deskCard: DeskCard
let updater: Updater

const shotView = (shot: Shot): Shot => ({
  ...shot,
  url: `${SHOT_SCHEME}://img/${shot.file}`,
  thumbUrl: `${SHOT_SCHEME}://img/${shot.thumb}`
})

const resource = (name: string): string => {
  const packaged = join(process.resourcesPath, name)
  return app.isPackaged && existsSync(packaged) ? packaged : join(app.getAppPath(), 'resources', name)
}

// 只有浅色：标题栏按钮与页面底色一致
const TITLE_BAR = { color: '#f8f8f7', symbolColor: '#17181b', height: 44 }
// 浮层打开时系统按钮的底色：取遮罩叠在标题栏上之后的颜色，不在角落留一块亮色
const TITLE_BAR_TONES: Record<TitleBarTone, { color: string; symbolColor: string; height: number }> = {
  light: TITLE_BAR,
  scrim: { color: '#dddddc', symbolColor: '#3d3e43', height: 44 },
  dim: { color: '#bcbcbd', symbolColor: '#55565b', height: 44 },
  dark: { color: '#1a1a1e', symbolColor: '#e8e8ea', height: 44 }
}
const fontsDir = (): string => join(dataFolder(), 'fonts')

function commit(): void {
  saveData(data)
  broadcast('data', data)
  rules?.evaluate()
}

function updateSettings(patch: Partial<Settings>): void {
  const prev = data.settings
  data.settings = { ...data.settings, ...patch }
  applySettings(prev)
  commit()
}

function applySettings(prev?: Settings): void {
  const s = data.settings
  nativeTheme.themeSource = 'light'
  if (app.isPackaged && prev?.launchAtLogin !== s.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: ['--hidden'] })
  }
  if (!prev || prev.hotkey !== s.hotkey) {
    hotkey = registerHotkey(s.hotkey, () => panel.toggle('center'))
    broadcast('hotkey', hotkey)
  }
  const cardKey = (c: CardSettings): string => JSON.stringify([c.enabled, c.size, c.layer, c.hideFullscreen])
  if (!prev || cardKey(prev.card) !== cardKey(s.card)) deskCard?.apply()
  updateTray()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '简程',
    icon: resource('icon.png'),
    backgroundColor: TITLE_BAR.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => {
    if (!startHidden) win?.show()
  })

  win.on('close', (e) => {
    if (quitting) return
    if (data.settings.closeToTray) {
      e.preventDefault()
      win?.hide()
      if (!trayHintShown && Notification.isSupported()) {
        trayHintShown = true
        const keys = hotkey.ok && hotkey.accelerator ? `按 ${hotkey.accelerator} 或` : ''
        new Notification({ title: '简程仍在后台运行', body: `${keys}单击托盘图标打开快捷面板，双击打开主窗口。`, silent: true }).show()
      }
    } else {
      // 快捷面板和桌角卡片仍存在，需主动退出
      quitting = true
      app.quit()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  loadRoute(win, 'main')
}

function showWindow(nav?: NavTarget): void {
  if (!win || win.isDestroyed()) createWindow()
  const w = win!
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
  if (nav) {
    const sendNav = (): void => w.webContents.send('navigate', nav)
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => setTimeout(sendNav, 300))
    else sendNav()
  }
}

function updateTray(): void {
  if (!tray) return
  const s = data.settings
  tray.setToolTip(`简程${s.monitorEnabled ? ' · 智能监测中' : ' · 监测已暂停'}${hotkey.ok && hotkey.accelerator ? `\n${hotkey.accelerator} 打开快捷面板` : ''}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(updater?.status.state === 'ready'
        ? [{ label: `重启并更新到 ${updater.status.next}`, click: () => updater.install() }, { type: 'separator' as const }]
        : []),
      { label: '打开简程', click: () => showWindow() },
      { label: '快捷面板', accelerator: hotkey.ok ? hotkey.accelerator || undefined : undefined, click: () => panel.toggle('tray', tray) },
      {
        label: '桌角卡片',
        submenu: [
          { label: '显示', type: 'checkbox', checked: s.card.enabled, click: () => setCard({ enabled: !s.card.enabled }) },
          { type: 'separator' },
          { label: '小卡', type: 'radio', checked: s.card.size === 's', click: () => setCard({ enabled: true, size: 's' }) },
          { label: '中卡', type: 'radio', checked: s.card.size === 'm', click: () => setCard({ enabled: true, size: 'm' }) },
          { label: '侧栏', type: 'radio', checked: s.card.size === 'side', click: () => setCard({ enabled: true, size: 'side' }) },
          { type: 'separator' },
          { label: '置顶', type: 'radio', checked: s.card.layer === 'top', click: () => setCard({ layer: 'top' }) },
          { label: '贴在桌面', type: 'radio', checked: s.card.layer === 'desktop', click: () => setCard({ layer: 'desktop' }) }
        ]
      },
      { type: 'separator' },
      { label: s.monitorEnabled ? '暂停智能监测' : '恢复智能监测', click: () => updateSettings({ monitorEnabled: !s.monitorEnabled }) },
      { label: s.shotEnabled ? '暂停本地截屏' : '开启本地截屏', click: () => updateSettings({ shotEnabled: !s.shotEnabled }) },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function setCard(patch: Partial<CardSettings>): void {
  updateSettings({ card: { ...data.settings.card, ...patch } })
}

/** 常见中文字体的中文名，系统返回的是英文字族名 */
const CN_FONT_NAMES: Record<string, string> = {
  'Microsoft YaHei': '微软雅黑',
  'Microsoft YaHei UI': '微软雅黑 UI',
  'Microsoft YaHei Light': '微软雅黑 Light',
  'Microsoft JhengHei': '微软正黑体',
  SimSun: '宋体',
  NSimSun: '新宋体',
  SimHei: '黑体',
  KaiTi: '楷体',
  KaiTi_GB2312: '楷体_GB2312',
  FangSong: '仿宋',
  FangSong_GB2312: '仿宋_GB2312',
  DengXian: '等线',
  'DengXian Light': '等线 Light',
  YouYuan: '幼圆',
  LiSu: '隶书',
  STXingkai: '华文行楷',
  STKaiti: '华文楷体',
  STSong: '华文宋体',
  STZhongsong: '华文中宋',
  STFangsong: '华文仿宋',
  STXihei: '华文细黑',
  STLiti: '华文隶书',
  STHupo: '华文琥珀',
  STCaiyun: '华文彩云',
  STXinwei: '华文新魏',
  FZShuTi: '方正舒体',
  FZYaoTi: '方正姚体',
  MingLiU: '细明体',
  PMingLiU: '新细明体'
}

/** 本机已安装的字体（用 .NET 读取）。PowerShell 用完整路径调用：有些电脑的 PATH 里没有它 */
let systemFonts: Promise<{ family: string; label: string }[]> | null = null
function listSystemFonts(): Promise<{ family: string; label: string }[]> {
  if (systemFonts) return systemFonts
  systemFonts = new Promise((resolve) => {
    const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const script =
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; ' +
      '(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
    execFile(ps, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20000, maxBuffer: 4 << 20 }, (err, stdout) => {
      if (err) {
        console.error('[fonts] 读取本机字体失败', err)
        systemFonts = null
        return resolve([])
      }
      const names = [...new Set(String(stdout).split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('@')))]
      const list = names.map((family) => ({ family, label: CN_FONT_NAMES[family] ?? family }))
      // 中文字体排在前面，其余按名称排序
      const cn = (f: { family: string }): number => (CN_FONT_NAMES[f.family] ? 0 : 1)
      resolve(list.sort((a, b) => cn(a) - cn(b) || a.label.localeCompare(b.label, 'zh-CN')))
    })
  })
  return systemFonts
}

function createTray(): void {
  // 同目录下的 tray@2x.png 会被自动用于高分屏
  tray = new Tray(nativeImage.createFromPath(resource('tray.png')))
  tray.on('click', () => panel.toggle('tray', tray))
  tray.on('double-click', () => showWindow())
  updateTray()
}

function registerIpc(): void {
  ipcMain.handle('data:get', () => data)

  ipcMain.handle('task:save', (_e, task: Task) => {
    const idx = data.tasks.findIndex((t) => t.id === task.id)
    const prev = idx >= 0 ? data.tasks[idx] : null
    const next = { ...task, updatedAt: Date.now() }
    if (idx >= 0) data.tasks[idx] = next
    else data.tasks.push(next)
    // 规则或时间发生变化时，清除今天由规则自动完成的记录，让它重新判定
    const shape = (t: Task): string => JSON.stringify([t.auto, t.start, t.end, t.allDay ?? false, t.days ?? 0])
    if (prev && shape(prev) !== shape(next)) {
      const key = occurrenceKey(task.id, todayKey())
      if (data.completions[key]?.by === 'auto') delete data.completions[key]
    }
    commit()
  })

  ipcMain.handle('task:delete', (_e, id: string, mode: 'all' | 'one', date?: string) => {
    if (mode === 'one' && date) {
      const task = data.tasks.find((t) => t.id === id)
      if (task) task.exceptions = [...new Set([...task.exceptions, date])]
      delete data.completions[occurrenceKey(id, date)]
    } else {
      data.tasks = data.tasks.filter((t) => t.id !== id)
      for (const key of Object.keys(data.completions)) if (key.startsWith(`${id}@`)) delete data.completions[key]
    }
    commit()
  })

  ipcMain.handle('completion:set', (_e, key: string, done: boolean) => {
    const progress = rules.getProgress()[key]
    if (!done && progress && progress.seconds < progress.required) {
      // 规则尚未达成：取消勾选即恢复为自动判定
      delete data.completions[key]
    } else {
      data.completions[key] = { done, by: 'manual', at: Date.now() }
    }
    commit()
  })

  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const prev = data.settings
    updateSettings(patch)
    if (Object.keys(patch).some((k) => k.startsWith('shot') || k === 'monitorEnabled')) broadcast('capture', capturer.status())
    if (patch.shotRetention !== undefined && patch.shotRetention !== prev.shotRetention) capturer.prune()
  })

  ipcMain.handle('usage:get', (_e, date: string) => monitor.getUsage(date))
  ipcMain.handle('segments:get', (_e, date: string) => monitor.getSegments(date))
  ipcMain.handle('apps:recent', () => monitor.recentApps())
  ipcMain.handle('progress:get', () => rules.getProgress())
  ipcMain.handle('monitor:get', () => monitor.getStatus())

  const iconCache = new Map<string, string | null>()
  ipcMain.handle('apps:icon', async (_e, exe: string) => {
    if (iconCache.has(exe)) return iconCache.get(exe)
    const info = monitor.appInfo(exe)
    let url: string | null = null
    if (info.path && existsSync(info.path)) {
      try {
        const img = await app.getFileIcon(info.path, { size: 'large' })
        url = img.isEmpty() ? null : img.toDataURL()
      } catch {
        url = null
      }
    }
    iconCache.set(exe, url)
    return url
  })

  ipcMain.handle('path:pick', async (e, kind: 'file' | 'folder') => {
    const owner = BrowserWindow.fromWebContents(e.sender) ?? win!
    const res = await dialog.showOpenDialog(owner, {
      title: kind === 'file' ? '选择要监测的文件' : '选择要监测的文件夹',
      properties: kind === 'file' ? ['openFile'] : ['openDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('data:openFolder', () => shell.openPath(dataFolder()))

  ipcMain.handle('shots:list', (_e, date: string) => capturer.list(date).map(shotView))
  ipcMain.handle('shots:capture', async () => {
    const res = await capturer.capture(true)
    return res.ok ? { ok: true, shot: shotView(res.shot) } : res
  })
  ipcMain.handle('shots:delete', (_e, file: string) => capturer.remove(file))
  ipcMain.handle('shots:clear', () => capturer.clear())
  ipcMain.handle('shots:stats', () => capturer.stats())
  ipcMain.handle('shots:reveal', (_e, file: string) => {
    const abs = capturer.resolve(file)
    if (abs && existsSync(abs)) shell.showItemInFolder(abs)
  })
  ipcMain.handle('shots:openFolder', () => {
    const dir = join(dataFolder(), 'screenshots')
    mkdirSync(dir, { recursive: true })
    return shell.openPath(dir)
  })
  ipcMain.handle('capture:get', () => capturer.status())

  ipcMain.handle('app:showMain', (_e, nav?: NavTarget) => {
    panel.hide()
    showWindow(nav)
  })
  ipcMain.handle('panel:hide', () => panel.hide())
  ipcMain.handle('titlebar:tone', (e, tone: TitleBarTone) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w && w === win && !w.isDestroyed()) w.setTitleBarOverlay(TITLE_BAR_TONES[tone] ?? TITLE_BAR)
  })
  ipcMain.handle('update:get', () => updater.status)
  ipcMain.handle('update:check', () => updater.check())
  ipcMain.handle('update:install', () => updater.install())
  ipcMain.handle('card:set', (_e, patch: Partial<CardSettings>) => setCard(patch))
  ipcMain.handle('card:close', () => {
    setCard({ enabled: false })
    if (!cardHintShown && Notification.isSupported()) {
      cardHintShown = true
      new Notification({ title: '桌角卡片已收起', body: '想再打开时：右键托盘里的简程图标 → 桌角卡片 → 显示，或在设置 → 外观里打开。', silent: true }).show()
    }
  })

  ipcMain.handle('fonts:system', () => listSystemFonts())
  ipcMain.handle('fonts:import', async (e) => {
    const owner = BrowserWindow.fromWebContents(e.sender) ?? win!
    const res = await dialog.showOpenDialog(owner, {
      title: '选择字体文件',
      filters: [{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
      properties: ['openFile']
    })
    const src = res.canceled ? null : res.filePaths[0]
    if (!src) return null
    const id = uid()
    const font: ImportedFont = { id, name: basename(src, extname(src)).slice(0, 60), file: `${id}${extname(src).toLowerCase()}` }
    mkdirSync(fontsDir(), { recursive: true })
    copyFileSync(src, join(fontsDir(), font.file))
    updateSettings({ fonts: [...data.settings.fonts, font] })
    return font
  })
  ipcMain.handle('fonts:read', (_e, id: string) => {
    const font = data.settings.fonts.find((f) => f.id === id)
    if (!font) return null
    try {
      return new Uint8Array(readFileSync(join(fontsDir(), font.file)))
    } catch {
      return null
    }
  })
  ipcMain.handle('fonts:remove', (_e, id: string) => {
    const font = data.settings.fonts.find((f) => f.id === id)
    if (!font) return
    try {
      unlinkSync(join(fontsDir(), font.file))
    } catch {
      /* 文件已不在 */
    }
    updateSettings({ fonts: data.settings.fonts.filter((f) => f.id !== id) })
  })
  ipcMain.handle('hotkey:get', () => hotkey)
}

/** 窗口崩溃等异常写进数据目录的 logs/，方便用户反馈问题时附上 */
function logIssue(kind: string, detail: unknown): void {
  try {
    const dir = join(dataFolder(), 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'issues.log'), `${new Date().toISOString()} [${app.getVersion()}] ${kind} ${JSON.stringify(detail)}\n`)
  } catch {
    /* 写不了日志也不影响使用 */
  }
}

app.on('render-process-gone', (_e, wc, details) => {
  logIssue('render-process-gone', { url: wc.getURL().replace(/^.*index\.html/, ''), ...details })
  // 桌角卡片和快捷面板崩溃后自动重新加载
  if (!wc.isDestroyed() && details.reason !== 'clean-exit') setTimeout(() => !wc.isDestroyed() && wc.reload(), 1000)
})
app.on('child-process-gone', (_e, details) => logIssue('child-process-gone', details))
process.on('uncaughtException', (err) => logIssue('uncaughtException', String(err?.stack ?? err)))

app.on('second-instance', () => showWindow())

app.whenReady().then(() => {
  data = loadData()
  nativeTheme.themeSource = 'light'

  monitor = new Monitor(() => data.settings)
  rules = new RuleEngine({
    getData: () => data,
    getSegments: (date) => monitor.getSegments(date),
    appName: (exe) => monitor.appInfo(exe).name,
    complete: (task, date, detail) => {
      data.completions[occurrenceKey(task.id, date)] = { done: true, by: 'auto', at: Date.now() }
      saveData(data)
      broadcast('data', data)
      if (data.settings.notify && Notification.isSupported()) {
        const n = new Notification({ title: `已自动完成 · ${task.title}`, body: detail, silent: false })
        n.on('click', () => showWindow({ view: 'today' }))
        n.show()
      }
    }
  })

  capturer = new Capturer(join(dataFolder(), 'screenshots'), {
    getSettings: () => data.settings,
    getData: () => data,
    monitor
  })

  deskCard = new DeskCard({
    getSettings: () => data.settings,
    savePos: (pos) => {
      data.settings = { ...data.settings, card: { ...data.settings.card, pos } }
      saveData(data)
    }
  })

  protocol.handle(SHOT_SCHEME, (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '')
    const abs = capturer.resolve(rel)
    if (!abs || !/\.jpe?g$/i.test(abs) || !existsSync(abs)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(abs).toString())
  })

  monitor.on('status', (s) => broadcast('monitor', s))
  rules.on('progress', (p) => broadcast('progress', p))
  capturer.on('status', (s) => broadcast('capture', s))
  capturer.on('shot', (shot: Shot) => broadcast('shot', shotView(shot)))

  updater = new Updater({
    onStatus: (s) => {
      broadcast('update', s)
      updateTray()
    },
    log: logIssue,
    notify: (title, body) => {
      if (!Notification.isSupported()) return
      const n = new Notification({ title, body, silent: true })
      n.on('click', () => showWindow())
      n.show()
    }
  })

  registerIpc()
  createWindow()
  createTray()
  panel.create()
  applySettings()
  monitor.start()
  rules.start()
  capturer.start()
  updater.start()

})

app.on('before-quit', () => {
  quitting = true
  monitor?.flush()
  flushData()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  // 开启「最小化到托盘」时保持后台运行，由托盘菜单退出
  if (!data.settings.closeToTray) app.quit()
})
