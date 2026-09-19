import { AnimatePresence, motion } from 'motion/react'
import { CircleCheck } from 'lucide-react'
import { useStore } from '../store'

export function Toast({ placement = 'bottom' }: { placement?: 'bottom' | 'top' }): React.JSX.Element {
  const toast = useStore((s) => s.toast)
  return (
    <div className={`toast-host ${placement}`}>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            initial={{ opacity: 0, y: placement === 'bottom' ? 12 : -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'bottom' ? 8 : -8, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          >
            <CircleCheck size={15} className="toast-icon" />
            <span className="toast-text">{toast.text}</span>
            {toast.action && (
              <button
                className="toast-action"
                onClick={() => {
                  toast.action!.run()
                  useStore.setState({ toast: null })
                }}
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
