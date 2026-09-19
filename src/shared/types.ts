export type ColorKey = 'blue' | 'violet' | 'rose' | 'orange' | 'amber' | 'emerald' | 'teal' | 'slate'

export const COLOR_KEYS: ColorKey[] = ['blue', 'violet', 'rose', 'orange', 'amber', 'emerald', 'teal', 'slate']

export type RepeatType = 'none' | 'daily' | 'weekdays' | 'weekly'

export interface Repeat {
  type: RepeatType
  /** weekly 时的星期几，0 = 周日 … 6 = 周六 */
  weekdays: number[]
  /** 截止日期（含），为空表示一直重复 */
  until: string | null
}

/** app：应用使用时长 · title：窗口标题包含关键词 · file：文件/文件夹有更新 */
export type AutoKind = 'app' | 'title' | 'file'

export interface AutoRule {
  enabled: boolean
  kind: AutoKind
  /** 进程名（小写，如 code.exe）。title 规则下为可选的应用过滤 */
  apps: string[]
  /** 窗口标题关键词，命中任意一个即可 */
  keywords: string[]
  /** 需要累计的分钟数（app / title） */
  minutes: number
  /** 统计范围：全天 / 仅计划时段 */
  scope: 'day' | 'slot'
  /** 无键鼠操作时是否仍计时（看视频、听课等） */
  countIdle: boolean
  /** file 规则监测的路径 */
  path: string
}

/** 子待办：doneOn 记录在哪些日期完成（重复日程每次单独勾选） */
export interface Subtask {
  id: string
  title: string
  doneOn: string[]
}

export interface Task {
  id: string
  title: string
  notes: string
  /** lucide 图标名，为空时按标题自动选 */
  icon?: string | null
  subtasks?: Subtask[]
  /** 首次发生日期 YYYY-MM-DD */
  date: string
  /** HH:mm，为空表示不限时间的待办 */
  start: string | null
  end: string | null
  /** 全天 / 多天的日程：不看 start、end，从 date 起占满 days + 1 天 */
  allDay?: boolean
  /** 跨天：结束在开始那天之后的第几天（0 = 当天结束，1 = 次日结束……） */
  days?: number
  color: ColorKey
  repeat: Repeat
  auto: AutoRule | null
  /** 重复任务中被单独删除的日期 */
  exceptions: string[]
  createdAt: number
  updatedAt: number
}

export interface Completion {
  done: boolean
  by: 'manual' | 'auto'
  at: number
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  weekStart: 0 | 1
  /** 无操作多少分钟后视为空闲，0 表示不检测 */
  idleMinutes: number
  monitorEnabled: boolean
  notify: boolean
  closeToTray: boolean
  launchAtLogin: boolean
  /** 时间轴默认滚动到的小时 */
  dayStartHour: number
  /** 本地截屏 */
  shotEnabled: boolean
  /** 截屏间隔（分钟） */
  shotInterval: number
  /** tasks：仅在智能任务相关的应用中截屏 · all：所有应用 */
  shotScope: 'tasks' | 'all'
  /** window：当前窗口 · screen：整个屏幕 */
  shotTarget: 'window' | 'screen'
  /** 截图保留天数 */
  shotRetention: number
  /** 不截屏的应用（进程名） */
  shotBlocklist: string[]
  /** 呼出快捷面板的全局快捷键（Electron Accelerator 格式），空字符串表示不使用 */
  hotkey: string
  /** 悬浮窗 */
  floatEnabled: boolean
  floatCollapsed: boolean
  floatPos: { x: number; y: number } | null
  /** 全屏应用（视频、游戏）在前台时隐藏悬浮窗 */
  floatHideFullscreen: boolean
  /** 已忽略的「设为每日任务」建议（进程名） */
  dismissedSuggestions: string[]
  /** 桌角卡片 */
  card: CardSettings
  /** 外观：字体、时钟、色带、首页显示项 */
  look: LookSettings
  /** 用户导入的字体 */
  fonts: ImportedFont[]
}

export type CardSize = 's' | 'm' | 'side'

/** 自动更新的状态 */
export interface UpdateStatus {
  /** dev：开发模式不检查 · latest：已是最新 · downloading：正在下载 · ready：已下载，等重启 */
  state: 'dev' | 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error'
  current: string
  next?: string
  percent?: number
  message?: string
  checkedAt?: number
}

/** light：平常 · scrim：编辑侧栏的浅遮罩 · dim：设置等弹窗的遮罩 · dark：截图查看器 */
export type TitleBarTone = 'light' | 'scrim' | 'dim' | 'dark'

export interface CardSettings {
  enabled: boolean
  size: CardSize
  /** top：置顶 · desktop：贴在桌面（其他窗口之下） */
  layer: 'top' | 'desktop'
  /** 鼠标移开时变淡、漂浮停下 */
  fadeAway: boolean
  /** 全屏应用在前台时隐藏 */
  hideFullscreen: boolean
  pos: { x: number; y: number } | null
}

export type FontRole = 'num' | 'title' | 'body' | 'time'

export interface RoleFont {
  family: string
  weight: number
  scale: number
}

export type ClockStyle = 'round' | 'serif' | 'neon' | 'hand' | 'flip' | 'seg'

export interface LookSettings {
  /** 字体搭配的 key，自定义时为 custom */
  preset: string
  roles: Record<FontRole, RoleFont>
  /** 色带夜间灰度 0–2 */
  night: number
  clock: ClockStyle
  seconds: boolean
  /** 漂浮速度倍数 0–2.5 */
  floatSpeed: number
  /** 首页显示项 */
  gaps: boolean
  sun: boolean
  icons: boolean
  ring: boolean
  /** 完成的待办沉到色带底部 */
  gravity: boolean
}

export interface ImportedFont {
  id: string
  /** 显示名（文件名） */
  name: string
  /** 保存在数据目录 fonts/ 下的文件名 */
  file: string
}

export type NavView = 'today' | 'day' | 'week' | 'month' | 'monitor' | 'look'

/** 从小窗跳转到主窗口时携带的目标 */
export interface NavTarget {
  view?: NavView
  date?: string
  /** 打开该日程的编辑器 */
  taskId?: string
  /** 打开「新建日程」 */
  create?: boolean
  settings?: boolean
}

export interface HotkeyStatus {
  accelerator: string
  ok: boolean
}

export interface AppData {
  version: 1
  tasks: Task[]
  /** key = `${taskId}@${date}` */
  completions: Record<string, Completion>
  settings: Settings
}

/** 一段前台活动：开始/结束时间戳、进程名、窗口标题、是否空闲 */
export interface Segment {
  s: number
  e: number
  p: string
  t: string
  i?: 1
}

export interface AppInfo {
  exe: string
  name: string
  path: string
}

export interface UsageItem extends AppInfo {
  seconds: number
}

export interface AutoProgress {
  key: string
  taskId: string
  date: string
  seconds: number
  required: number
  done: boolean
  detail: string
}

export interface MonitorStatus {
  enabled: boolean
  available: boolean
  idle: boolean
  current: { exe: string; name: string; title: string } | null
  activeSeconds: number
}

/** 一张本地截图（file 为相对截图目录的路径，同时作为 id） */
export interface Shot {
  file: string
  thumb: string
  t: number
  exe: string
  title: string
  w: number
  h: number
  /** 截屏时正在匹配规则的智能任务 */
  taskIds: string[]
  /** 返回给界面时附带的可访问地址 */
  url?: string
  thumbUrl?: string
}

export type CaptureResult = { ok: true; shot: Shot } | { ok: false; reason: string }

export interface CaptureStatus {
  enabled: boolean
  lastAt: number | null
  nextAt: number | null
  /** 最近一次跳过的原因 */
  note: string | null
}

export interface ShotStats {
  count: number
  bytes: number
}

export interface Api {
  getData(): Promise<AppData>
  saveTask(task: Task): Promise<void>
  deleteTask(id: string, mode: 'all' | 'one', date?: string): Promise<void>
  setCompletion(key: string, done: boolean): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  getUsage(date: string): Promise<UsageItem[]>
  getSegments(date: string): Promise<Segment[]>
  getRecentApps(): Promise<AppInfo[]>
  getAppIcon(exe: string): Promise<string | null>
  getProgress(): Promise<Record<string, AutoProgress>>
  getMonitor(): Promise<MonitorStatus>
  pickPath(kind: 'file' | 'folder'): Promise<string | null>
  openDataFolder(): Promise<void>
  onData(cb: (data: AppData) => void): () => void
  onProgress(cb: (p: Record<string, AutoProgress>) => void): () => void
  onMonitor(cb: (m: MonitorStatus) => void): () => void
  getShots(date: string): Promise<Shot[]>
  captureNow(): Promise<CaptureResult>
  deleteShot(file: string): Promise<void>
  clearShots(): Promise<void>
  getShotStats(): Promise<ShotStats>
  revealShot(file: string): Promise<void>
  openShotsFolder(): Promise<void>
  getCapture(): Promise<CaptureStatus>
  onCapture(cb: (s: CaptureStatus) => void): () => void
  onShot(cb: (shot: Shot) => void): () => void
  /** 显示主窗口并跳转 */
  showMain(nav?: NavTarget): Promise<void>
  hidePanel(): Promise<void>
  setCard(patch: Partial<CardSettings>): Promise<void>
  getUpdate(): Promise<UpdateStatus>
  checkUpdate(): Promise<void>
  /** 立即重启并安装已下载的新版本 */
  installUpdate(): Promise<void>
  onUpdate(cb: (s: UpdateStatus) => void): () => void
  /** 主窗口右上角系统按钮的底色，跟着浮层的遮罩变化 */
  setTitleBarTone(tone: TitleBarTone): Promise<void>
  /** 从桌角卡片上点关闭：收起卡片，第一次时提示在哪里重新打开 */
  closeCard(): Promise<void>
  /** 本机已安装的字体（字族名，按显示名排序） */
  getSystemFonts(): Promise<{ family: string; label: string }[]>
  /** 选择字体文件并导入到数据目录，取消时返回 null */
  importFont(): Promise<ImportedFont | null>
  readFont(id: string): Promise<Uint8Array | null>
  removeFont(id: string): Promise<void>
  getHotkeyStatus(): Promise<HotkeyStatus>
  onHotkeyStatus(cb: (s: HotkeyStatus) => void): () => void
  onNavigate(cb: (nav: NavTarget) => void): () => void
  /** 快捷面板每次弹出时触发 */
  onPanelShown(cb: () => void): () => void
  /** 浏览器预览模式下的模拟实现 */
  __mock?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStart: 1,
  idleMinutes: 5,
  monitorEnabled: true,
  notify: true,
  closeToTray: true,
  launchAtLogin: false,
  dayStartHour: 8,
  shotEnabled: false,
  shotInterval: 5,
  shotScope: 'tasks',
  shotTarget: 'window',
  shotRetention: 7,
  shotBlocklist: ['keepass.exe', 'keepassxc.exe', '1password.exe', 'bitwarden.exe'],
  hotkey: 'Ctrl+Alt+Space',
  floatEnabled: false,
  floatCollapsed: false,
  floatPos: null,
  floatHideFullscreen: true,
  dismissedSuggestions: [],
  card: { enabled: true, size: 'm', layer: 'top', fadeAway: false, hideFullscreen: true, pos: null },
  look: {
    preset: 'round',
    roles: {
      num: { family: 'Fredoka', weight: 600, scale: 1 },
      title: { family: 'Noto Sans SC', weight: 600, scale: 1 },
      body: { family: 'Noto Sans SC', weight: 400, scale: 1 },
      time: { family: 'IBM Plex Mono', weight: 500, scale: 1 }
    },
    night: 1,
    clock: 'round',
    seconds: true,
    floatSpeed: 1,
    gaps: true,
    sun: true,
    icons: true,
    ring: true,
    gravity: true
  },
  fonts: []
}
