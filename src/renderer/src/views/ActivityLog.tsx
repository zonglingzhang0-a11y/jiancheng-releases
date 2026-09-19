import { useEffect, useMemo, useState } from 'react'
import { Camera, CameraOff, History, Images, Loader2 } from 'lucide-react'
import { buildSessions } from '@shared/activity'
import { formatDuration, pad, todayKey } from '@shared/schedule'
import type { ColorKey, Segment, Shot, UsageItem } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { AppIcon, cx, Segmented } from '../components/ui'

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 读取某天的截图；有新截图或删除时自动刷新 */
export function useShots(date: string): Shot[] {
  const version = useStore((s) => s.shotVersion)
  const [shots, setShots] = useState<Shot[]>([])
  useEffect(() => {
    let alive = true
    api()
      .getShots(date)
      .then((list) => alive && setShots(list))
    return () => {
      alive = false
    }
  }, [date, version])
  return shots
}

function CaptureLine(): React.JSX.Element {
  const capture = useStore((s) => s.capture)
  const settings = useStore((s) => s.data.settings)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  if (!settings.shotEnabled) {
    return (
      <div className="capture-line off">
        <CameraOff size={13} />
        <span>本地截屏未开启，只记录应用与窗口标题</span>
        <button className="link-btn" onClick={() => setSettingsOpen(true, 'capture')}>
          开启
        </button>
      </div>
    )
  }
  const scope = settings.shotScope === 'tasks' ? '仅智能任务相关应用' : '所有应用'
  return (
    <div className="capture-line">
      <span className="capture-dot" />
      <span>
        每 {settings.shotInterval} 分钟截取{settings.shotTarget === 'window' ? '当前窗口' : '整个屏幕'} · {scope}
        {capture.note && <em> · {capture.note}</em>}
      </span>
      <button className="link-btn" onClick={() => setSettingsOpen(true, 'capture')}>
        设置
      </button>
    </div>
  )
}

export function ActivityLog(props: {
  date: string
  segments: Segment[]
  usage: UsageItem[]
  shots: Shot[]
  colorOf: (exe: string) => ColorKey
}): React.JSX.Element {
  const openViewer = useStore((s) => s.openViewer)
  const [filter, setFilter] = useState<'all' | 'shots'>('all')
  const [limit, setLimit] = useState(12)
  const [capturing, setCapturing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const isToday = props.date === todayKey()

  useEffect(() => setLimit(12), [props.date, filter])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const sessions = useMemo(() => buildSessions(props.segments, props.shots).reverse(), [props.segments, props.shots])
  const visible = filter === 'shots' ? sessions.filter((s) => s.shots.length) : sessions
  const nameOf = (exe: string): string => props.usage.find((u) => u.exe === exe)?.name ?? exe.replace(/\.exe$/i, '')
  const allShots = props.shots

  const captureNow = async (): Promise<void> => {
    setCapturing(true)
    const res = await api().captureNow()
    setCapturing(false)
    setToast(res.ok ? '已截取当前窗口' : res.reason)
  }

  return (
    <div className="card log-card">
      <div className="card-head">
        <div className="card-title">
          <History size={15} />
          活动记录
          <span className="card-meta tnum">
            {sessions.length} 段 · {allShots.length} 张截图
          </span>
        </div>
        <div className="log-actions">
          {toast && <span className="log-toast">{toast}</span>}
          <Segmented<'all' | 'shots'>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '全部' },
              { value: 'shots', label: '有截图' }
            ]}
          />
          {allShots.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => openViewer(allShots, allShots.length - 1)} title="浏览当天所有截图">
              <Images size={14} />
              浏览
            </button>
          )}
          {isToday && (
            <button className="btn btn-outline btn-sm" onClick={captureNow} disabled={capturing} title="立即截取当前窗口">
              {capturing ? <Loader2 size={14} className="spin" /> : <Camera size={14} />}
              截一张
            </button>
          )}
        </div>
      </div>

      <CaptureLine />

      {visible.length === 0 ? (
        <div className="empty">
          {filter === 'shots' ? <Images size={26} strokeWidth={1.5} /> : <History size={26} strokeWidth={1.5} />}
          <div>{filter === 'shots' ? '这一天还没有截图' : '暂无活动记录'}</div>
          <div className="empty-sub">使用超过 1 分钟的应用会按时段出现在这里</div>
        </div>
      ) : (
        <div className="log-list">
          {visible.slice(0, limit).map((s) => {
            const main = s.titles[0]
            const shotIndex = (shot: Shot): number => allShots.findIndex((x) => x.file === shot.file)
            return (
              <div key={`${s.exe}-${s.s}`} className={cx('log-row', `tone-${props.colorOf(s.exe)}`)}>
                <div className="log-time tnum">
                  <span>{clock(s.s)}</span>
                  <span className="log-time-end">{clock(s.e)}</span>
                </div>
                <div className="log-rail">
                  <i />
                </div>
                <div className="log-main">
                  <div className="log-head">
                    <AppIcon exe={s.exe} name={nameOf(s.exe)} size={18} />
                    <span className="log-app">{nameOf(s.exe)}</span>
                    <span className="log-dur tnum">{formatDuration(s.seconds, true)}</span>
                  </div>
                  {main && (
                    <div className="log-title" title={s.titles.map((t) => t.title).join('\n')}>
                      {main.title}
                      {s.titles.length > 1 && <span className="log-more"> 等 {s.titles.length} 个窗口</span>}
                    </div>
                  )}
                  {s.shots.length > 0 && (
                    <div className="log-shots">
                      {s.shots.slice(0, 6).map((shot) => (
                        <button key={shot.file} className="log-shot" onClick={() => openViewer(allShots, shotIndex(shot))} title={clock(shot.t)}>
                          <img src={shot.thumbUrl} alt="" loading="lazy" draggable={false} />
                          <span className="tnum">{clock(shot.t)}</span>
                        </button>
                      ))}
                      {s.shots.length > 6 && (
                        <button className="log-shot more" onClick={() => openViewer(allShots, shotIndex(s.shots[6]))}>
                          +{s.shots.length - 6}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {visible.length > limit && (
            <button className="log-expand" onClick={() => setLimit((l) => l + 20)}>
              显示更早的 {Math.min(20, visible.length - limit)} 段
            </button>
          )}
        </div>
      )}
    </div>
  )
}
