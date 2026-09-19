import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import {
  addDays,
  formatDuration,
  matchedSeconds,
  occurrenceDates,
  occurrenceKey,
  occurrencesOn,
  pad,
  requiredSeconds,
  ruleWindow,
  todayKey
} from '@shared/schedule'
import type { AppData, AutoProgress, Segment, Task } from '@shared/types'

interface FileHit {
  name: string
  mtime: number
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '__pycache__', '.venv', 'dist', 'build', '.obsidian'])

/** 在时间窗口内查找最近被修改的文件（限制深度与数量） */
async function findModified(path: string, from: number, to: number): Promise<FileHit | null> {
  let budget = 4000
  let best: FileHit | null = null
  const visit = async (p: string, depth: number): Promise<void> => {
    if (budget-- <= 0) return
    let st
    try {
      st = await fs.stat(p)
    } catch {
      return
    }
    if (st.isFile()) {
      const m = st.mtimeMs
      if (m >= from && m < to && (!best || m > best.mtime)) best = { name: basename(p), mtime: m }
      return
    }
    if (!st.isDirectory() || depth > 4) return
    let entries
    try {
      entries = await fs.readdir(p, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (budget <= 0) return
      if (ent.isDirectory() && (SKIP_DIRS.has(ent.name) || ent.name.startsWith('$'))) continue
      await visit(join(p, ent.name), depth + 1)
    }
  }
  await visit(path, 0)
  return best
}

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export class RuleEngine extends EventEmitter {
  private progress: Record<string, AutoProgress> = {}
  private fileHits = new Map<string, { checkedAt: number; hit: FileHit | null; sig: string }>()
  private scanning = new Set<string>()
  /** 以前的日子的活动记录不会再变，读一次就缓存起来（跨天日程要用到） */
  private past = new Map<string, Segment[]>()

  constructor(
    private ctx: {
      getData: () => AppData
      getSegments: (date: string) => Segment[]
      appName: (exe: string) => string
      complete: (task: Task, date: string, detail: string) => void
    }
  ) {
    super()
  }

  start(): void {
    setInterval(() => this.evaluate(), 5000)
    this.evaluate()
  }

  getProgress(): Record<string, AutoProgress> {
    return this.progress
  }

  describe(task: Task): string {
    const rule = task.auto
    if (!rule) return ''
    const names = rule.apps.map((a) => this.ctx.appName(a)).join('、')
    if (rule.kind === 'app') return `${names} 累计 ${formatDuration(rule.minutes * 60)}`
    if (rule.kind === 'title') return `「${rule.keywords.join('/')}」累计 ${formatDuration(rule.minutes * 60)}`
    return `${basename(rule.path) || rule.path} 有更新`
  }

  private scanFile(task: Task, key: string, date: string): void {
    const rule = task.auto!
    const [from, to] = ruleWindow(task, date)
    const sig = `${rule.path}|${from}|${to}`
    const cached = this.fileHits.get(key)
    const now = Date.now()
    if (this.scanning.has(key)) return
    if (cached && cached.sig === sig && (cached.hit || now - cached.checkedAt < 30_000)) return
    if (!rule.path) return
    this.scanning.add(key)
    findModified(rule.path, from, Math.min(to, now + 60_000))
      .then((hit) => {
        this.fileHits.set(key, { checkedAt: Date.now(), hit, sig })
        if (hit) this.evaluate()
      })
      .finally(() => this.scanning.delete(key))
  }

  private segmentsOf(date: string, today: string): Segment[] {
    // 今天和昨天的可能还在写入（刚过午夜时），不缓存
    if (date >= addDays(today, -1)) return this.ctx.getSegments(date)
    let segs = this.past.get(date)
    if (!segs) {
      if (this.past.size > 60) this.past.clear()
      segs = this.ctx.getSegments(date)
      this.past.set(date, segs)
    }
    return segs
  }

  evaluate(): void {
    const data = this.ctx.getData()
    const today = todayKey()
    const next: Record<string, AutoProgress> = {}

    // 今天在进行的每一次发生，包括前几天开始、延续到今天的跨天日程
    for (const { task, date } of occurrencesOn(data.tasks, today)) {
      const rule = task.auto
      if (!rule?.enabled) continue
      const segments = occurrenceDates(task, date)
        .filter((d) => d <= today)
        .flatMap((d) => this.segmentsOf(d, today))
      const key = occurrenceKey(task.id, date)
      const completion = data.completions[key]
      const required = requiredSeconds(rule)
      let seconds = 0
      let detail = ''

      if (rule.kind === 'file') {
        this.scanFile(task, key, date)
        const hit = this.fileHits.get(key)?.hit
        seconds = hit ? 1 : 0
        detail = hit ? `${hit.name} · ${clock(hit.mtime)} 更新` : '等待文件更新'
      } else {
        seconds = matchedSeconds(task, date, segments)
        detail = `${formatDuration(seconds, true)} / ${formatDuration(required, true)}`
      }

      const reached = seconds >= required
      if (reached && !completion) {
        this.ctx.complete(task, date, rule.kind === 'file' ? detail : `${this.describe(task)}`)
      }
      next[key] = {
        key,
        taskId: task.id,
        date,
        seconds: Math.min(seconds, required),
        required,
        done: completion ? completion.done : reached,
        detail
      }
    }

    if (JSON.stringify(next) !== JSON.stringify(this.progress)) {
      this.progress = next
      this.emit('progress', next)
    }
  }
}
