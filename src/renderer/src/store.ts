import { create } from 'zustand'
import { occurrenceKey, todayKey, uid } from '@shared/schedule'
import type { QuickParsed } from '@shared/quickParse'
import {
  DEFAULT_SETTINGS,
  type AppData,
  type AppInfo,
  type AutoProgress,
  type AutoRule,
  type CaptureStatus,
  type HotkeyStatus,
  type LookSettings,
  type MonitorStatus,
  type NavTarget,
  type Settings,
  type Shot,
  type Task,
  type UpdateStatus
} from '@shared/types'
import { api } from './lib/api'

export type SettingsTab = 'general' | 'look' | 'entry' | 'monitor' | 'capture' | 'system'
export type Page = 'home' | 'monitor'

export interface EditorState {
  task: Task
  /** 打开编辑器时所在的发生日期（用于删除单次、勾选子待办） */
  date: string
  isNew: boolean
}

interface Store {
  ready: boolean
  data: AppData
  progress: Record<string, AutoProgress>
  monitor: MonitorStatus
  page: Page
  /** 首页和监测页正在看的日期 */
  cursor: string
  /** 首页底部展开的周 / 月视图 */
  drawer: 'week' | 'month' | null
  /** 早晨规划：色带里显示可以拖进去的空位 */
  planning: boolean
  /** 鼠标停在某条长期事上时，周 / 月视图里高亮它覆盖的那几天 */
  hotSpan: string | null
  editor: EditorState | null
  settingsOpen: boolean
  settingsTab: SettingsTab
  /** 每次递增都会让首页的一句话输入框获得焦点 */
  quickFocus: number
  capture: CaptureStatus
  hotkey: HotkeyStatus
  update: UpdateStatus
  /** 最近使用的应用（一句话添加时用于识别 @应用） */
  recentApps: AppInfo[]
  /** 每次有新截图时递增，用于刷新截图列表 */
  shotVersion: number
  /** 截图查看器：当前列表与索引 */
  viewer: { shots: Shot[]; index: number } | null
  toast: { id: number; text: string; action?: { label: string; run: () => void } } | null

  init(): Promise<void>
  showToast(text: string, action?: { label: string; run: () => void }): void
  /** 添加日程后的统一反馈（含撤销） */
  notifyCreated(task: Task): void
  refreshApps(): Promise<void>
  navigate(nav: NavTarget): void
  setPage(page: Page): void
  setCursor(date: string): void
  setDrawer(drawer: 'week' | 'month' | null): void
  setPlanning(on: boolean): void
  setHotSpan(key: string | null): void
  focusQuick(): void
  openViewer(shots: Shot[], index: number): void
  closeViewer(): void
  bumpShots(): void
  openNew(partial?: Partial<Task>): void
  openTask(task: Task, date: string): void
  closeEditor(): void
  setSettingsOpen(open: boolean, tab?: SettingsTab): void
  saveTask(task: Task): Promise<void>
  deleteTask(id: string, mode: 'all' | 'one', date?: string): Promise<void>
  toggle(taskId: string, date: string): Promise<void>
  toggleSub(task: Task, subId: string, date: string): Promise<void>
  /** 把随时待办排进时间轴；重复的待办只改这一天 */
  scheduleAt(task: Task, fromDate: string, date: string, start: string, end: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  updateLook(patch: Partial<LookSettings>): Promise<void>
}

export const defaultRule = (): AutoRule => ({
  enabled: true,
  kind: 'app',
  apps: [],
  keywords: [],
  minutes: 30,
  scope: 'day',
  countIdle: false,
  path: ''
})

export function newTask(partial: Partial<Task> = {}): Task {
  const now = Date.now()
  return {
    id: uid(),
    title: '',
    notes: '',
    icon: null,
    subtasks: [],
    date: todayKey(),
    start: null,
    end: null,
    color: 'slate',
    repeat: { type: 'none', weekdays: [], until: null },
    auto: null,
    exceptions: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

/** 把一句话识别结果转成日程 */
export function taskFromQuick(parsed: QuickParsed): Task {
  const auto = parsed.auto ? { ...defaultRule(), ...parsed.auto } : null
  return newTask({
    title: parsed.title,
    date: parsed.date,
    start: parsed.start,
    end: parsed.end,
    repeat: parsed.repeat,
    auto
  })
}

let pendingNav: NavTarget | null = null

export const useStore = create<Store>((set, get) => ({
  ready: false,
  data: { version: 1, tasks: [], completions: {}, settings: DEFAULT_SETTINGS },
  progress: {},
  monitor: { enabled: false, available: false, idle: false, current: null, activeSeconds: 0 },
  page: 'home',
  cursor: todayKey(),
  drawer: null,
  planning: false,
  hotSpan: null,
  editor: null,
  settingsOpen: false,
  settingsTab: 'general',
  quickFocus: 0,
  capture: { enabled: false, lastAt: null, nextAt: null, note: null },
  hotkey: { accelerator: '', ok: true },
  update: { state: 'idle', current: '' },
  recentApps: [],
  shotVersion: 0,
  viewer: null,
  toast: null,

  showToast(text, action) {
    const id = Date.now()
    set({ toast: { id, text, action } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 4000)
  },

  notifyCreated(task) {
    const when = [task.date !== todayKey() ? task.date.slice(5).replace('-', '/') : '', task.start ?? '', task.repeat.type !== 'none' ? '重复' : '']
      .filter(Boolean)
      .join(' ')
    get().showToast(`已添加「${task.title}」${when ? ` · ${when}` : ''}`, {
      label: '撤销',
      run: () => get().deleteTask(task.id, 'all')
    })
  },

  async init() {
    const a = api()
    // 先订阅，避免初始化期间错过其他窗口发来的消息
    a.onData((data) => set({ data }))
    a.onProgress((progress) => set({ progress }))
    a.onMonitor((monitor) => set({ monitor }))
    a.onCapture((capture) => set({ capture }))
    a.onHotkeyStatus((hotkey) => set({ hotkey }))
    a.onShot(() => set((s) => ({ shotVersion: s.shotVersion + 1 })))
    a.onNavigate((nav) => get().navigate(nav))
    a.onUpdate((update) => set({ update }))
    a.getUpdate().then((update) => set({ update }))
    const [data, progress, monitor, capture, hotkey, recentApps] = await Promise.all([
      a.getData(),
      a.getProgress(),
      a.getMonitor(),
      a.getCapture(),
      a.getHotkeyStatus(),
      a.getRecentApps()
    ])
    set({ data, progress, monitor, capture, hotkey, recentApps, ready: true })
    if (pendingNav) {
      get().navigate(pendingNav)
      pendingNav = null
    }
  },

  async refreshApps() {
    set({ recentApps: await api().getRecentApps() })
  },

  navigate(nav) {
    // 数据还没加载完时先记下，初始化完成后再跳转
    if (!get().ready) {
      pendingNav = nav
      return
    }
    const s = get()
    set({ viewer: null })
    if (nav.date) s.setCursor(nav.date)
    if (nav.view === 'today') set({ page: 'home', cursor: todayKey() })
    else if (nav.view === 'day') set({ page: 'home' })
    else if (nav.view === 'week' || nav.view === 'month') set({ page: 'home', drawer: nav.view })
    else if (nav.view === 'monitor') set({ page: 'monitor' })
    else if (nav.view === 'look') s.setSettingsOpen(true, 'look')
    if (nav.taskId) {
      const task = get().data.tasks.find((t) => t.id === nav.taskId)
      if (task) {
        set({ page: 'home' })
        s.openTask(task, nav.date ?? get().cursor)
      }
    }
    if (nav.create) {
      set({ page: 'home' })
      s.openNew()
    }
    if (nav.settings) s.setSettingsOpen(true, 'entry')
  },

  setPage(page) {
    set({ page, planning: false })
  },

  setCursor(cursor) {
    set({ cursor, planning: cursor === todayKey() ? get().planning : false })
  },

  setDrawer(drawer) {
    set({ drawer })
  },

  setHotSpan(hotSpan) {
    if (get().hotSpan !== hotSpan) set({ hotSpan })
  },

  setPlanning(planning) {
    set(planning ? { planning, cursor: todayKey(), page: 'home' } : { planning })
  },

  focusQuick() {
    set((s) => ({ quickFocus: s.quickFocus + 1, page: 'home' }))
  },

  openViewer(shots, index) {
    if (shots.length) set({ viewer: { shots, index: Math.max(0, Math.min(index, shots.length - 1)) } })
  },

  closeViewer() {
    set({ viewer: null })
  },

  bumpShots() {
    set((s) => ({ shotVersion: s.shotVersion + 1 }))
  },

  openNew(partial = {}) {
    const date = partial.date ?? get().cursor
    set({ editor: { task: newTask({ date, ...partial }), date, isNew: true } })
  },

  openTask(task, date) {
    set({ editor: { task: structuredClone(task), date, isNew: false } })
  },

  closeEditor() {
    set({ editor: null })
  },

  setSettingsOpen(settingsOpen, tab) {
    set(tab ? { settingsOpen, settingsTab: tab } : { settingsOpen })
  },

  async saveTask(task) {
    // 乐观更新，拖拽和勾选不回弹
    const { data } = get()
    const tasks = data.tasks.some((t) => t.id === task.id) ? data.tasks.map((t) => (t.id === task.id ? task : t)) : [...data.tasks, task]
    set({ data: { ...data, tasks } })
    await api().saveTask(task)
  },

  async deleteTask(id, mode, date) {
    const { data } = get()
    const tasks =
      mode === 'one' && date ? data.tasks.map((t) => (t.id === id ? { ...t, exceptions: [...t.exceptions, date] } : t)) : data.tasks.filter((t) => t.id !== id)
    set({ data: { ...data, tasks } })
    await api().deleteTask(id, mode, date)
  },

  async toggle(taskId, date) {
    const key = occurrenceKey(taskId, date)
    const { data, progress } = get()
    const current = data.completions[key]?.done ?? progress[key]?.done ?? false
    set({ data: { ...data, completions: { ...data.completions, [key]: { done: !current, by: 'manual', at: Date.now() } } } })
    await api().setCompletion(key, !current)
  },

  async toggleSub(task, subId, date) {
    const subtasks = (task.subtasks ?? []).map((s) =>
      s.id === subId ? { ...s, doneOn: s.doneOn.includes(date) ? s.doneOn.filter((d) => d !== date) : [...s.doneOn, date] } : s
    )
    await get().saveTask({ ...task, subtasks, updatedAt: Date.now() })
  },

  async scheduleAt(task, fromDate, date, start, end) {
    if (task.repeat.type === 'none') {
      await get().saveTask({ ...task, date, start, end, updatedAt: Date.now() })
      return
    }
    // 重复的待办：这一天从重复里拿掉，另建一个排好时间的日程
    const copy = newTask({ ...task, id: uid(), date, start, end, repeat: { type: 'none', weekdays: [], until: null }, exceptions: [], subtasks: (task.subtasks ?? []).map((s) => ({ ...s, doneOn: [] })) })
    await get().saveTask({ ...task, exceptions: [...task.exceptions, fromDate], updatedAt: Date.now() })
    await get().saveTask(copy)
  },

  async updateSettings(patch) {
    const { data } = get()
    set({ data: { ...data, settings: { ...data.settings, ...patch } } })
    await api().updateSettings(patch)
  },

  async updateLook(patch) {
    await get().updateSettings({ look: { ...get().data.settings.look, ...patch } })
  }
}))

export function isDone(data: AppData, taskId: string, date: string): boolean {
  return data.completions[occurrenceKey(taskId, date)]?.done ?? false
}
