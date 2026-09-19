import { useEffect } from 'react'
import { useStore } from '../store'
import { api } from '../lib/api'
import { DeskCard } from '../widget/DeskCard'

/** 桌角卡片窗口：窗口四周留出透明边距画阴影 */
export function CardApp(): React.JSX.Element | null {
  const init = useStore((s) => s.init)
  const ready = useStore((s) => s.ready)
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const toggle = useStore((s) => s.toggle)

  useEffect(() => {
    init()
  }, [init])

  if (!ready) return null
  const { card, look, fonts } = data.settings
  return (
    <div className="card-shell" data-size={card.size}>
      <DeskCard
        size={card.size}
        data={data}
        progress={progress}
        look={look}
        fonts={fonts}
        windowed
        fadeAway={card.fadeAway}
        onToggle={(i) => toggle(i.task.id, i.date)}
        onClose={() => api().closeCard()}
        onAction={(a) => {
          if (a.type === 'open') api().showMain({ view: 'today' })
          else if (a.type === 'add') api().showMain({ create: true })
          else api().showMain({ taskId: a.taskId, date: a.date })
        }}
      />
    </div>
  )
}
