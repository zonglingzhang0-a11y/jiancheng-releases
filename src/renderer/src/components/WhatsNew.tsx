// 更新后第一次打开：右下角告诉你这次改了什么，十几秒后自己收起
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sparkles, X } from 'lucide-react'
import { CHANGELOG, newerThan } from '@shared/changelog'
import { useStore } from '../store'
import { isMock } from '../lib/api'

interface Shown {
  version: string
  /** 上次用的版本；以前的版本没记过，不知道时为 null */
  from: string | null
  items: string[]
  /** 没列出来的还有几条 */
  more: number
}

const STAY_SECONDS = 14

export function WhatsNew(): React.JSX.Element {
  const ready = useStore((s) => s.ready)
  const updateSettings = useStore((s) => s.updateSettings)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const [shown, setShown] = useState<Shown | null>(null)
  const hover = useRef(false)

  useEffect(() => {
    if (!ready) return
    const { data } = useStore.getState()
    const cur = __APP_VERSION__
    const last = data.settings.lastVersion || null
    // 网页预览里加 ?whatsnew 可以直接看效果
    const preview = isMock() && location.search.includes('whatsnew')
    if (!preview) {
      if (last === cur) return
      updateSettings({ lastVersion: cur })
    }
    // 1.1.2 以前没记版本号：已经有日程的，说明是从 1.0.0 一路升上来的；全新安装的不提示
    const from = last ?? (data.tasks.length ? '1.0.0' : null)
    const entries = preview ? CHANGELOG.slice(0, 3) : from ? newerThan(from, cur) : []
    if (!entries.length) return
    // 每个新版本先挑最要紧的第一条，再按顺序补满三条
    const items = [...entries.map((e) => e.items[0]), ...entries.flatMap((e) => e.items.slice(1))].slice(0, 3)
    const total = entries.reduce((n, e) => n + e.items.length, 0)
    setShown({ version: preview ? entries[0].version : cur, from: preview ? '1.0.0' : last, items, more: total - items.length })
  }, [ready, updateSettings])

  // 窗口看得见、鼠标没停在上面时才倒数，免得开机后台启动时就悄悄过期
  useEffect(() => {
    if (!shown) return
    let left = STAY_SECONDS
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || hover.current) return
      if (--left <= 0) setShown(null)
    }, 1000)
    return () => clearInterval(t)
  }, [shown])

  return (
    <AnimatePresence>
      {shown && (
        <motion.aside
          className="whatsnew"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          onPointerEnter={() => (hover.current = true)}
          onPointerLeave={() => (hover.current = false)}
        >
          <div className="wn-head">
            <Sparkles size={15} className="wn-ico" />
            <b>已更新到 {shown.version}</b>
            {shown.from && <span className="wn-from tnum">上次用的是 {shown.from}</span>}
            <button className="ic sm fx wn-x" aria-label="关闭" onClick={() => setShown(null)}>
              <X size={14} />
            </button>
          </div>
          <ul className="wn-list">
            {shown.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <button
            className="wn-more fx"
            onClick={() => {
              setShown(null)
              setSettingsOpen(true, 'system')
            }}
          >
            全部更新说明{shown.more > 0 ? `（还有 ${shown.more} 条）` : ''}
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
