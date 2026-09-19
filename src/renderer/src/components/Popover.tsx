import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check as CheckIcon, ChevronDown } from 'lucide-react'
import { cx } from './ui'

export function Popover(props: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  children: ReactNode
  align?: 'start' | 'end' | 'center'
  offset?: number
  width?: number | string
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const { anchor, open, onClose } = props
  const offset = props.offset ?? 6

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPos(null)
      return
    }
    const place = (): void => {
      const r = anchor.getBoundingClientRect()
      const el = ref.current
      const h = el?.offsetHeight ?? 0
      const w = el?.offsetWidth ?? 0
      let top = r.bottom + offset
      let up = false
      if (top + h > window.innerHeight - 10 && r.top - offset - h > 10) {
        top = r.top - offset - h
        up = true
      }
      top = Math.max(10, Math.min(top, window.innerHeight - h - 10))
      let left = props.align === 'end' ? r.right - w : props.align === 'center' ? r.left + r.width / 2 - w / 2 : r.left
      left = Math.max(10, Math.min(left, window.innerWidth - w - 10))
      setPos({ top, left, up })
    }
    place()
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, offset, props.align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchor, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={cx('popover', props.className)}
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: props.width,
            transformOrigin: pos?.up ? 'bottom center' : 'top center'
          }}
          initial={{ opacity: 0, scale: 0.97, y: -3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {props.children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** 带锚点的浮层状态 */
export function useAnchor<T extends HTMLElement = HTMLButtonElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  return {
    ref: setEl,
    el,
    open,
    toggle: () => setOpen((o) => !o),
    show: () => setOpen(true),
    close: () => setOpen(false)
  }
}

export interface SelectOption<T> {
  value: T
  label: string
  icon?: ReactNode
  meta?: string
}

export function Select<T extends string | number>(props: {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  icon?: ReactNode
  width?: number
  disabled?: boolean
  display?: string
}): React.JSX.Element {
  const a = useAnchor()
  const current = props.options.find((o) => o.value === props.value)
  return (
    <>
      <button ref={a.ref} className={cx('field-btn', a.open && 'open')} onClick={a.toggle} disabled={props.disabled}>
        {props.icon ?? current?.icon}
        <span>{props.display ?? current?.label}</span>
        <ChevronDown size={14} className="chev" />
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={props.width}>
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            className={cx('menu-item', o.value === props.value && 'selected')}
            onClick={() => {
              props.onChange(o.value)
              a.close()
            }}
          >
            {o.icon}
            <span>{o.label}</span>
            {o.meta && <span className="menu-meta">{o.meta}</span>}
            {o.value === props.value && <CheckIcon size={15} className="menu-check" />}
          </button>
        ))}
      </Popover>
    </>
  )
}
