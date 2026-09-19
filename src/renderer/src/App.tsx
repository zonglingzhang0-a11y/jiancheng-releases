import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDownToLine, Settings2 } from 'lucide-react'
import { api } from './lib/api'
import { addDays, todayKey } from '@shared/schedule'
import { useStore, type Page } from './store'
import { applyLook } from './lib/look'
import { Home } from './home/Home'
import { Sheet } from './editor/Sheet'
import { MonitorPage } from './pages/MonitorPage'
import { SettingsDialog } from './components/SettingsDialog'
import { ShotViewer } from './components/ShotViewer'
import { Toast } from './components/Toast'
import { cx } from './components/ui'

const PAGES: { id: Page; label: string; key: string }[] = [
  { id: 'home', label: '今天', key: 'H' },
  { id: 'monitor', label: '监测', key: 'A' }
]

function TitleBar(): React.JSX.Element {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const monitor = useStore((s) => s.monitor)
  const update = useStore((s) => s.update)
  return (
    <header className="titlebar drag">
      <span className="brand">
        <i className="brand-mark" />
        简程
      </span>
      <nav className="tb-nav no-drag" aria-label="页面">
        {PAGES.map((p) => (
          <button key={p.id} className={cx('tb-tab fx', page === p.id && 'on')} onClick={() => setPage(p.id)} title={`${p.label}（${p.key}）`}>
            {p.label}
            {p.id === 'monitor' && monitor.enabled && monitor.available && <i className="tb-live" />}
          </button>
        ))}
      </nav>
      <span className="tb-sp" />
      {update.state === 'ready' && (
        <button className="tb-update fx no-drag" onClick={() => api().installUpdate()} title="重启简程，换成新版本">
          <ArrowDownToLine size={13} strokeWidth={2.4} />
          {update.next} 已就绪 · 重启更新
        </button>
      )}
      <button className="ic fx no-drag" onClick={() => setSettingsOpen(true)} title="设置与外观（Ctrl + ,）" aria-label="设置">
        <Settings2 size={16} />
      </button>
    </header>
  )
}

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        return s.setSettingsOpen(true)
      }
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        return s.openNew()
      }
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable]') || e.ctrlKey || e.altKey || e.metaKey) return
      if (s.editor || s.settingsOpen || s.viewer) return
      const k = e.key.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        s.focusQuick()
      } else if (k === 'h' || k === 't') {
        s.setPage('home')
        s.setCursor(todayKey())
      } else if (k === 'a') s.setPage('monitor')
      else if (k === 'l') s.setSettingsOpen(true, 'look')
      else if (k === 'w' || k === 'm') {
        s.setPage('home')
        const v = k === 'w' ? 'week' : 'month'
        s.setDrawer(s.drawer === v ? null : v)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        s.setCursor(addDays(s.cursor, e.key === 'ArrowLeft' ? -1 : 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App(): React.JSX.Element {
  const init = useStore((s) => s.init)
  const ready = useStore((s) => s.ready)
  const page = useStore((s) => s.page)
  const look = useStore((s) => s.data.settings.look)
  const fonts = useStore((s) => s.data.settings.fonts)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    applyLook(document.documentElement, look, fonts)
  }, [look, fonts])

  useShortcuts()

  return (
    <div className="shell">
      <TitleBar />
      <main className="shell-main">
        {ready && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              className="page"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {page === 'home' ? <Home /> : <MonitorPage />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      <Sheet />
      <SettingsDialog />
      <ShotViewer />
      <Toast />
    </div>
  )
}
