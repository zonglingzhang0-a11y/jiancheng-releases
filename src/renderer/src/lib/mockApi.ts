// 浏览器预览模式下的模拟 API：示例日程 + 伪造的应用活动数据
import {
  addDays,
  formatDuration,
  fromKey,
  matchedSeconds,
  occurrenceKey,
  requiredSeconds,
  ruleMatches,
  ruleWindow,
  tasksOn,
  todayKey,
  uid
} from '@shared/schedule'
import {
  DEFAULT_SETTINGS,
  type Api,
  type AppData,
  type AppInfo,
  type AutoProgress,
  type CaptureStatus,
  type MonitorStatus,
  type NavTarget,
  type Segment,
  type Shot,
  type Task
} from '@shared/types'

const APPS: AppInfo[] = [
  { exe: 'code.exe', name: 'Visual Studio Code', path: '' },
  { exe: 'chrome.exe', name: 'Google Chrome', path: '' },
  { exe: 'weixin.exe', name: '微信', path: '' },
  { exe: 'obsidian.exe', name: 'Obsidian', path: '' },
  { exe: 'windowsterminal.exe', name: 'Windows 终端', path: '' },
  { exe: 'cloudmusic.exe', name: '网易云音乐', path: '' },
  { exe: 'explorer.exe', name: '文件资源管理器', path: '' },
  { exe: 'feishu.exe', name: '飞书', path: '' }
]

const TITLES: Record<string, string[]> = {
  'code.exe': ['TimeGrid.tsx - Schedule Plan - Visual Studio Code', 'store.ts - Schedule Plan - Visual Studio Code'],
  'chrome.exe': ['掘金 - 代码不止 - Google Chrome', 'LeetCode - 两数之和 - Google Chrome', 'GitHub - Google Chrome', '少数派 - Google Chrome'],
  'weixin.exe': ['微信'],
  'obsidian.exe': ['2026-09-15 - Diary - Obsidian'],
  'windowsterminal.exe': ['PowerShell'],
  'cloudmusic.exe': ['网易云音乐'],
  'explorer.exe': ['文件资源管理器'],
  'feishu.exe': ['飞书 - 产品周会']
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function fakeSegments(date: string): Segment[] {
  const today = todayKey()
  if (date > today) return []
  const rand = rng(Number(date.replace(/-/g, '')))
  const base = fromKey(date).getTime()
  const end = date === today ? Date.now() : base + 22.5 * 3600_000
  const plan: [string, number][] = [
    ['weixin.exe', 8],
    ['chrome.exe', 18],
    ['code.exe', 55],
    ['windowsterminal.exe', 6],
    ['code.exe', 40],
    ['weixin.exe', 6],
    ['chrome.exe', 22],
    ['feishu.exe', 12],
    ['code.exe', 35],
    ['explorer.exe', 4],
    ['obsidian.exe', 14],
    ['cloudmusic.exe', 5],
    ['chrome.exe', 30],
    ['code.exe', 50],
    ['weixin.exe', 10]
  ]
  const segs: Segment[] = []
  let t = base + 8.6 * 3600_000
  let i = 0
  while (t < end) {
    const [exe, mins] = plan[i % plan.length]
    const titles = TITLES[exe]
    const dur = mins * (0.6 + rand() * 0.8) * 60_000
    const s = t
    const e = Math.min(end, t + dur)
    const idle = rand() < 0.08
    segs.push({ s, e, p: exe, t: titles[Math.floor(rand() * titles.length)], ...(idle ? { i: 1 as const } : {}) })
    t = e + rand() * 4 * 60_000
    // 午饭与晚饭
    if (t > base + 12.2 * 3600_000 && t < base + 13.3 * 3600_000) t = base + 13.4 * 3600_000
    if (t > base + 18.3 * 3600_000 && t < base + 19.4 * 3600_000) t = base + 19.5 * 3600_000
    i++
  }
  return segs
}

/** 生成一张示意性的「窗口截图」SVG（仅用于浏览器预览） */
function fakeShotImage(exe: string, title: string, seed: number): string {
  const rand = rng(seed)
  const W = 1600
  const H = 1000
  const lines = (x: number, y: number, n: number, gap: number, colors: string[], maxW: number, indent = false): string =>
    Array.from({ length: n }, (_, i) => {
      const w = 80 + rand() * maxW
      const ind = indent ? Math.floor(rand() * 4) * 36 : 0
      return `<rect x="${x + ind}" y="${y + i * gap}" width="${w}" height="12" rx="6" fill="${colors[i % colors.length]}"/>`
    }).join('')
  let body = ''
  let bar = '#f3f3f3'
  let barText = '#333'
  if (exe === 'code.exe') {
    bar = '#1f1f28'
    barText = '#ccc'
    body = `<rect y="44" width="${W}" height="${H - 44}" fill="#1e1e2e"/><rect y="44" width="260" height="${H - 44}" fill="#181825"/>${lines(30, 90, 18, 34, ['#45475a', '#585b70'], 150)}${lines(320, 90, 24, 34, ['#89b4fa', '#f5c2e7', '#a6e3a1', '#cdd6f4', '#fab387'], 620, true)}`
  } else if (exe === 'windowsterminal.exe') {
    bar = '#202020'
    barText = '#ccc'
    body = `<rect y="44" width="${W}" height="${H - 44}" fill="#0c0c0c"/>${lines(40, 90, 22, 36, ['#4ade80', '#d4d4d4', '#d4d4d4', '#60a5fa'], 900)}`
  } else if (exe === 'obsidian.exe') {
    bar = '#262626'
    barText = '#ccc'
    body = `<rect y="44" width="${W}" height="${H - 44}" fill="#1e1e1e"/><rect x="480" y="120" width="420" height="26" rx="8" fill="#a78bfa"/>${lines(480, 190, 16, 40, ['#d4d4d4', '#a3a3a3'], 560)}`
  } else if (exe === 'feishu.exe' || exe === 'weixin.exe') {
    body = `<rect y="44" width="${W}" height="${H - 44}" fill="#f5f6f7"/><rect y="44" width="340" height="${H - 44}" fill="#fff"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="60" cy="${110 + i * 90}" r="26" fill="${['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][i % 4]}"/><rect x="100" y="${96 + i * 90}" width="${120 + rand() * 90}" height="12" rx="6" fill="#d4d4d8"/><rect x="100" y="${118 + i * 90}" width="${80 + rand() * 120}" height="10" rx="5" fill="#e4e4e7"/>`).join('')}${Array.from({ length: 6 }, (_, i) => `<rect x="${i % 2 ? 900 : 420}" y="${120 + i * 130}" width="${260 + rand() * 260}" height="70" rx="16" fill="${i % 2 ? '#3b82f6' : '#fff'}"/>`).join('')}`
  } else {
    body = `<rect y="44" width="${W}" height="${H - 44}" fill="#ffffff"/><rect y="44" width="${W}" height="56" fill="#f1f3f4"/><rect x="200" y="58" width="900" height="28" rx="14" fill="#fff"/><rect x="220" y="160" width="620" height="34" rx="8" fill="#1e293b"/>${lines(220, 240, 12, 38, ['#94a3b8', '#cbd5e1'], 820)}<rect x="1120" y="160" width="300" height="420" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>${lines(1150, 200, 8, 40, ['#f97316', '#cbd5e1'], 180)}`
  }
  const safe = title.replace(/[<>&"]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="44" fill="${bar}"/><text x="20" y="28" font-family="Segoe UI, Microsoft YaHei" font-size="16" fill="${barText}">${safe}</text><g fill="${barText}" opacity=".6"><rect x="1470" y="21" width="14" height="2"/><rect x="1516" y="15" width="12" height="12" fill="none" stroke="${barText}"/><path d="M1560 15l12 12M1572 15l-12 12" stroke="${barText}"/></g>${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function sampleTasks(): Task[] {
  const today = todayKey()
  const now = Date.now()
  const mk = (p: Partial<Task>): Task => ({
    id: uid(),
    title: '',
    notes: '',
    date: addDays(today, -14),
    start: null,
    end: null,
    color: 'blue',
    repeat: { type: 'none', weekdays: [], until: null },
    auto: null,
    exceptions: [],
    createdAt: now,
    updatedAt: now,
    ...p
  })
  const rule = { enabled: true, apps: [], keywords: [], minutes: 30, scope: 'day' as const, countIdle: false, path: '' }
  const dow = fromKey(today).getDay()
  return [
    mk({ title: '晨间规划', start: '08:30', end: '09:00', color: 'slate', icon: 'Sunrise', repeat: { type: 'daily', weekdays: [], until: null } }),
    mk({
      title: '深度工作 · 写代码',
      start: '09:30',
      end: '11:45',
      color: 'blue',
      repeat: { type: 'weekdays', weekdays: [], until: null },
      auto: { ...rule, kind: 'app', apps: ['code.exe'], minutes: 90 },
      subtasks: [
        { id: 's1', title: '拆分登录模块', doneOn: [today] },
        { id: 's2', title: '补单元测试', doneOn: [] },
        { id: 's3', title: '代码评审', doneOn: [] }
      ]
    }),
    mk({ title: '午休', start: '12:30', end: '13:30', color: 'teal', repeat: { type: 'daily', weekdays: [], until: null } }),
    mk({
      title: '产品周会',
      start: '14:00',
      end: '15:00',
      color: 'violet',
      repeat: { type: 'weekly', weekdays: [1, 3, 5], until: null },
      auto: { ...rule, kind: 'app', apps: ['feishu.exe'], minutes: 10, scope: 'slot' },
      subtasks: [
        { id: 's4', title: '准备迭代数据', doneOn: [] },
        { id: 's5', title: '整理问题清单', doneOn: [] }
      ]
    }),
    mk({
      title: '刷一道算法题',
      color: 'orange',
      repeat: { type: 'daily', weekdays: [], until: null },
      auto: { ...rule, kind: 'title', keywords: ['LeetCode', '力扣'], minutes: 20 }
    }),
    mk({
      title: '写日记',
      color: 'rose',
      repeat: { type: 'daily', weekdays: [], until: null },
      auto: { ...rule, kind: 'file', path: 'D:\\Notes\\Diary' }
    }),
    mk({
      title: '回复消息',
      color: 'amber',
      repeat: { type: 'weekdays', weekdays: [], until: null },
      auto: { ...rule, kind: 'app', apps: ['weixin.exe', 'feishu.exe'], minutes: 15 }
    }),
    mk({ title: '健身 · 力量训练', start: '19:30', end: '20:30', color: 'emerald', repeat: { type: 'weekly', weekdays: [2, 4, 6], until: null } }),
    mk({ title: '阅读《设计中的设计》', start: '21:30', end: '22:15', color: 'violet', repeat: { type: 'daily', weekdays: [], until: null } }),
    mk({ title: '提交季度报告', date: addDays(today, 1), start: '16:00', end: '17:00', color: 'rose' }),
    mk({ title: '看牙医', date: addDays(today, 3), start: '10:00', end: '11:00', color: 'slate' }),
    mk({ title: '周末徒步', date: addDays(today, (6 - dow + 7) % 7 || 7), start: '08:00', end: '12:00', color: 'emerald' }),
    mk({ title: '整理下周计划', date: addDays(today, (7 - dow) % 7), color: 'blue' }),
    mk({ title: '买咖啡豆', date: today }),
    mk({ title: '给家里打电话', date: today }),
    mk({ title: '取快递', date: today, icon: 'Package' }),
    mk({ title: '回复设计稿意见', date: addDays(today, -1), icon: 'PenTool' })
  ]
}

export function createMockApi(): Api {
  const STORAGE = 'jc.mock.data.v2'
  let data: AppData
  try {
    data = JSON.parse(localStorage.getItem(STORAGE) ?? '') as AppData
  } catch {
    data = { version: 1, tasks: sampleTasks(), completions: {}, settings: { ...DEFAULT_SETTINGS } }
    const today = todayKey()
    for (const title of ['晨间规划', '取快递']) {
      const t = data.tasks.find((x) => x.title === title)
      if (t) data.completions[occurrenceKey(t.id, today)] = { done: true, by: 'manual', at: Date.now() }
    }
  }

  const D = DEFAULT_SETTINGS
  const rs = data.settings ?? D
  data.settings = { ...D, ...rs, card: { ...D.card, ...rs.card }, look: { ...D.look, ...rs.look, roles: { ...D.look.roles, ...rs.look?.roles } }, fonts: rs.fonts ?? [] }
  const listeners = {
    data: new Set<(d: AppData) => void>(),
    progress: new Set<(p: Record<string, AutoProgress>) => void>(),
    monitor: new Set<(m: MonitorStatus) => void>(),
    capture: new Set<(s: CaptureStatus) => void>(),
    shot: new Set<(s: Shot) => void>(),
    navigate: new Set<(n: NavTarget) => void>()
  }
  const deletedShots = new Set<string>()
  const extraShots: Shot[] = []
  const matchTasks = (date: string, exe: string, title: string, t: number): string[] =>
    tasksOn(data.tasks, date)
      .filter((task) => {
        const rule = task.auto
        if (!rule?.enabled || rule.kind === 'file') return false
        const [from, to] = ruleWindow(task, date)
        return t >= from && t < to && ruleMatches({ ...rule, countIdle: true }, { s: t, e: t, p: exe, t: title })
      })
      .map((task) => task.id)
  const shots = (date: string): Shot[] => {
    const list: Shot[] = []
    let next = 0
    for (const seg of segments(date)) {
      if (seg.i) continue
      for (let t = Math.max(seg.s + 60_000, next); t < seg.e; t += 6 * 60_000) {
        const d = new Date(t)
        const file = `${date}/${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}-${seg.p.replace('.exe', '')}.jpg`
        next = t + 6 * 60_000
        if (deletedShots.has(file)) continue
        const url = fakeShotImage(seg.p, seg.t, t % 100000)
        list.push({ file, thumb: file.replace('.jpg', '.thumb.jpg'), t, exe: seg.p, title: seg.t, w: 1600, h: 1000, taskIds: matchTasks(date, seg.p, seg.t, t), url, thumbUrl: url })
      }
    }
    return [...list, ...extraShots.filter((s) => s.file.startsWith(date) && !deletedShots.has(s.file))].sort((a, b) => a.t - b.t)
  }
  const captureStatus = (): CaptureStatus => ({
    enabled: data.settings.shotEnabled && data.settings.monitorEnabled,
    lastAt: null,
    nextAt: data.settings.shotEnabled ? Date.now() + data.settings.shotInterval * 60_000 : null,
    note: null
  })
  const segCache = new Map<string, Segment[]>()
  const segments = (date: string): Segment[] => {
    if (date === todayKey()) return fakeSegments(date)
    if (!segCache.has(date)) segCache.set(date, fakeSegments(date))
    return segCache.get(date)!
  }

  let progress: Record<string, AutoProgress> = {}

  const persist = (): void => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }

  const evaluate = (): void => {
    const date = todayKey()
    const segs = segments(date)
    const next: Record<string, AutoProgress> = {}
    for (const task of tasksOn(data.tasks, date)) {
      const rule = task.auto
      if (!rule?.enabled) continue
      const key = occurrenceKey(task.id, date)
      const required = requiredSeconds(rule)
      const seconds = rule.kind === 'file' ? 0 : matchedSeconds(task, date, segs)
      const reached = seconds >= required
      if (reached && !data.completions[key]) data.completions[key] = { done: true, by: 'auto', at: Date.now() }
      next[key] = {
        key,
        taskId: task.id,
        date,
        seconds: Math.min(seconds, required),
        required,
        done: data.completions[key]?.done ?? reached,
        detail: rule.kind === 'file' ? '等待文件更新' : `${formatDuration(seconds, true)} / ${formatDuration(required, true)}`
      }
    }
    progress = next
    listeners.progress.forEach((cb) => cb(progress))
  }

  const status = (): MonitorStatus => {
    const segs = segments(todayKey())
    const last = segs[segs.length - 1]
    const app = APPS.find((a) => a.exe === last?.p)
    return {
      enabled: data.settings.monitorEnabled,
      available: true,
      idle: false,
      current: app ? { exe: app.exe, name: app.name, title: last.t } : null,
      activeSeconds: Math.floor(segs.filter((s) => !s.i).reduce((a, s) => a + s.e - s.s, 0) / 1000)
    }
  }

  const commit = (): void => {
    persist()
    evaluate()
    listeners.data.forEach((cb) => cb(structuredClone(data)))
  }

  evaluate()
  persist()

  return {
    __mock: true,
    getData: async () => structuredClone(data),
    saveTask: async (task) => {
      const idx = data.tasks.findIndex((t) => t.id === task.id)
      if (idx >= 0) data.tasks[idx] = task
      else data.tasks.push(task)
      commit()
    },
    deleteTask: async (id, mode, date) => {
      if (mode === 'one' && date) {
        const t = data.tasks.find((x) => x.id === id)
        if (t) t.exceptions.push(date)
      } else data.tasks = data.tasks.filter((t) => t.id !== id)
      commit()
    },
    setCompletion: async (key, done) => {
      const p = progress[key]
      if (!done && p && p.seconds < p.required) delete data.completions[key]
      else data.completions[key] = { done, by: 'manual', at: Date.now() }
      commit()
    },
    updateSettings: async (patch) => {
      data.settings = { ...data.settings, ...patch }
      commit()
      listeners.monitor.forEach((cb) => cb(status()))
      listeners.capture.forEach((cb) => cb(captureStatus()))
    },
    showMain: async (nav) => {
      // 预览模式：主窗口与小窗在同一浏览器中，直接跳转到主界面
      sessionStorage.setItem('jc.nav', JSON.stringify(nav ?? {}))
      if (location.hash) location.hash = ''
      listeners.navigate.forEach((cb) => cb(nav ?? {}))
    },
    hidePanel: async () => undefined,
    setTitleBarTone: async () => undefined,
    getUpdate: async () => ({ state: 'latest', current: __APP_VERSION__, checkedAt: Date.now() }),
    checkUpdate: async () => undefined,
    installUpdate: async () => undefined,
    onUpdate: () => () => undefined,
    closeCard: async () => {
      data.settings = { ...data.settings, card: { ...data.settings.card, enabled: false } }
      commit()
    },
    setCard: async (patch) => {
      data.settings = { ...data.settings, card: { ...data.settings.card, ...patch } }
      commit()
    },
    getSystemFonts: async () => [
      { family: 'Microsoft YaHei', label: '微软雅黑' },
      { family: 'DengXian', label: '等线' },
      { family: 'KaiTi', label: '楷体' },
      { family: 'FangSong', label: '仿宋' },
      { family: 'SimSun', label: '宋体' },
      { family: 'Segoe UI', label: 'Segoe UI' },
      { family: 'Bahnschrift', label: 'Bahnschrift' },
      { family: 'Georgia', label: 'Georgia' },
      { family: 'Consolas', label: 'Consolas' }
    ],
    importFont: async () => null,
    readFont: async () => null,
    removeFont: async (id) => {
      data.settings = { ...data.settings, fonts: data.settings.fonts.filter((f) => f.id !== id) }
      commit()
    },
    getHotkeyStatus: async () => ({ accelerator: data.settings.hotkey, ok: true }),
    onHotkeyStatus: () => () => undefined,
    onNavigate: (cb) => {
      listeners.navigate.add(cb)
      return () => listeners.navigate.delete(cb)
    },
    onPanelShown: () => () => undefined,
    getShots: async (date) => shots(date),
    captureNow: async () => {
      const st = status()
      if (!st.current) return { ok: false, reason: '没有前台窗口' }
      const t = Date.now()
      const date = todayKey()
      const url = fakeShotImage(st.current.exe, st.current.title, t % 100000)
      const shot: Shot = {
        file: `${date}/manual-${t}.jpg`,
        thumb: `${date}/manual-${t}.thumb.jpg`,
        t,
        exe: st.current.exe,
        title: st.current.title,
        w: 1600,
        h: 1000,
        taskIds: matchTasks(date, st.current.exe, st.current.title, t),
        url,
        thumbUrl: url
      }
      extraShots.push(shot)
      listeners.shot.forEach((cb) => cb(shot))
      return { ok: true, shot }
    },
    deleteShot: async (file) => {
      deletedShots.add(file)
    },
    clearShots: async () => {
      for (let i = 0; i < 30; i++) for (const s of shots(addDays(todayKey(), -i))) deletedShots.add(s.file)
    },
    getShotStats: async () => {
      let count = 0
      for (let i = 0; i < data.settings.shotRetention; i++) count += shots(addDays(todayKey(), -i)).length
      return { count, bytes: count * 186_000 }
    },
    revealShot: async () => undefined,
    openShotsFolder: async () => undefined,
    getCapture: async () => captureStatus(),
    onCapture: (cb) => {
      listeners.capture.add(cb)
      return () => listeners.capture.delete(cb)
    },
    onShot: (cb) => {
      listeners.shot.add(cb)
      return () => listeners.shot.delete(cb)
    },
    getUsage: async (date) => {
      const totals = new Map<string, number>()
      for (const s of segments(date)) if (!s.i) totals.set(s.p, (totals.get(s.p) ?? 0) + s.e - s.s)
      return [...totals.entries()]
        .map(([exe, ms]) => ({ ...(APPS.find((a) => a.exe === exe) ?? { exe, name: exe, path: '' }), seconds: Math.floor(ms / 1000) }))
        .sort((a, b) => b.seconds - a.seconds)
    },
    getSegments: async (date) => segments(date),
    getRecentApps: async () => APPS,
    getAppIcon: async () => null,
    getProgress: async () => progress,
    getMonitor: async () => status(),
    pickPath: async () => null,
    openDataFolder: async () => undefined,
    onData: (cb) => {
      listeners.data.add(cb)
      return () => listeners.data.delete(cb)
    },
    onProgress: (cb) => {
      listeners.progress.add(cb)
      return () => listeners.progress.delete(cb)
    },
    onMonitor: (cb) => {
      listeners.monitor.add(cb)
      const t = setInterval(() => cb(status()), 10_000)
      return () => {
        clearInterval(t)
        listeners.monitor.delete(cb)
      }
    }
  }
}
