import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, FolderOpen, Trash2, X } from 'lucide-react'
import { pad } from '@shared/schedule'
import { useStore } from '../store'
import { api, isMock } from '../lib/api'
import { dayTitle, WEEKDAY } from '../lib/dates'
import { AppIcon, cx } from './ui'
import { useTitleBarTone } from '../lib/titlebar'

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 全屏截图查看器：左右切换、底部胶片栏、删除与在文件夹中显示 */
export function ShotViewer(): React.JSX.Element {
  const viewer = useStore((s) => s.viewer)
  const closeViewer = useStore((s) => s.closeViewer)
  const openViewer = useStore((s) => s.openViewer)
  const bumpShots = useStore((s) => s.bumpShots)
  const tasks = useStore((s) => s.data.tasks)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)

  const shot = viewer ? viewer.shots[viewer.index] : null
  const go = (delta: number): void => {
    // 读取最新状态，避免连续按键时基于旧索引计算
    const current = useStore.getState().viewer
    if (!current) return
    const next = current.index + delta
    if (next >= 0 && next < current.shots.length) openViewer(current.shots, next)
  }

  const remove = async (): Promise<void> => {
    if (!viewer || !shot) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await api().deleteShot(shot.file)
    const rest = viewer.shots.filter((s) => s.file !== shot.file)
    bumpShots()
    setConfirmDelete(false)
    if (rest.length) openViewer(rest, Math.min(viewer.index, rest.length - 1))
    else closeViewer()
  }

  useEffect(() => {
    setConfirmDelete(false)
    const el = stripRef.current?.querySelector<HTMLElement>('.viewer-thumb.on')
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [viewer?.index, shot?.file])

  // 查看器是深色全屏，打开时让右上角的系统按钮也变深
  useTitleBarTone(!!viewer, 'dark')

  useEffect(() => {
    if (!viewer) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeViewer()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'Delete') remove()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const date = shot ? new Date(shot.t) : null
  const related = shot ? tasks.filter((t) => shot.taskIds.includes(t.id)) : []

  return createPortal(
    <AnimatePresence>
      {viewer && shot && date && (
        <motion.div
          className="viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className="viewer-head">
            <AppIcon exe={shot.exe} size={22} />
            <div className="viewer-meta">
              <div className="viewer-title" title={shot.title}>
                {shot.title || shot.exe}
              </div>
              <div className="viewer-sub tnum">
                {dayTitle(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`)} {WEEKDAY[date.getDay()]} · {clock(shot.t)} · {shot.exe}
              </div>
            </div>
            {related.length > 0 && (
              <div className="viewer-tasks">
                {related.map((t) => (
                  <span key={t.id} className={cx('viewer-task', `tone-${t.color}`)}>
                    <i />
                    {t.title}
                  </span>
                ))}
              </div>
            )}
            <div className="viewer-spacer" />
            <span className="viewer-count tnum">
              {viewer.index + 1} / {viewer.shots.length}
            </span>
            <button className="viewer-btn" onClick={() => api().revealShot(shot.file)} title="在文件夹中显示" disabled={isMock()}>
              <FolderOpen size={17} />
            </button>
            <button className={cx('viewer-btn', confirmDelete && 'danger')} onClick={remove} title="删除这张截图 (Delete)">
              <Trash2 size={17} />
              {confirmDelete && <span>确认删除</span>}
            </button>
            <button className="viewer-btn" onClick={closeViewer} title="关闭 (Esc)">
              <X size={19} />
            </button>
          </header>

          <div className="viewer-stage" onMouseDown={(e) => e.target === e.currentTarget && closeViewer()}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={shot.file}
                src={shot.url}
                alt=""
                draggable={false}
                className="viewer-img"
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </AnimatePresence>
            <button className="viewer-nav left" onClick={() => go(-1)} disabled={viewer.index === 0} aria-label="上一张">
              <ChevronLeft size={24} />
            </button>
            <button className="viewer-nav right" onClick={() => go(1)} disabled={viewer.index === viewer.shots.length - 1} aria-label="下一张">
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="viewer-strip" ref={stripRef}>
            {viewer.shots.map((s, i) => (
              <button key={s.file} className={cx('viewer-thumb', i === viewer.index && 'on')} onClick={() => openViewer(viewer.shots, i)}>
                <img src={s.thumbUrl} alt="" draggable={false} loading="lazy" />
                <span className="tnum">{clock(s.t).slice(0, 5)}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
