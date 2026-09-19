import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SETTINGS, type AppData, type Segment, type Settings } from '@shared/types'

const root = (): string => app.getPath('userData')
const dataFile = (): string => join(root(), 'data.json')
const activityDir = (): string => join(root(), 'activity')

function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (err) {
    console.error('[store] 读取失败', file, err)
    return null
  }
}

export function loadData(): AppData {
  const raw = readJson<Partial<AppData>>(dataFile())
  const rs = (raw?.settings ?? {}) as Partial<Settings>
  const D = DEFAULT_SETTINGS
  return {
    version: 1,
    tasks: (raw?.tasks ?? []).map((t) => ({ ...t, exceptions: t.exceptions ?? [], notes: t.notes ?? '', subtasks: t.subtasks ?? [] })),
    completions: raw?.completions ?? {},
    settings: {
      ...D,
      ...rs,
      // 早期测试版有浅色 / 深色主题，现在固定浅色
      theme: 'light',
      // 早期测试版的悬浮窗开关迁移为桌角卡片
      card: { ...D.card, ...(rs.card ?? (rs.floatEnabled !== undefined ? { enabled: rs.floatEnabled } : {})) },
      look: { ...D.look, ...(rs.look ?? {}), roles: { ...D.look.roles, ...(rs.look?.roles ?? {}) } },
      fonts: rs.fonts ?? []
    }
  }
}

let saveTimer: NodeJS.Timeout | null = null
let pending: AppData | null = null

export function saveData(data: AppData, immediate = false): void {
  pending = data
  if (saveTimer) clearTimeout(saveTimer)
  const flush = (): void => {
    saveTimer = null
    if (!pending) return
    mkdirSync(root(), { recursive: true })
    writeAtomic(dataFile(), JSON.stringify(pending, null, 2))
    pending = null
  }
  if (immediate) flush()
  else saveTimer = setTimeout(flush, 400)
}

export function flushData(): void {
  if (pending) saveData(pending, true)
}

export function loadSegments(date: string): Segment[] {
  return readJson<Segment[]>(join(activityDir(), `${date}.json`)) ?? []
}

export function saveSegments(date: string, segments: Segment[]): void {
  mkdirSync(activityDir(), { recursive: true })
  writeAtomic(join(activityDir(), `${date}.json`), JSON.stringify(segments))
}

export function dataFolder(): string {
  return root()
}
