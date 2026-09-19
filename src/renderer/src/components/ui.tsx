import { useEffect, useId, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ColorKey } from '@shared/types'
import { api } from '../lib/api'

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ')

/* ---------- 分段控件 ---------- */
export interface SegOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
  title?: string
}

export function Segmented<T extends string>(props: {
  value: T
  options: SegOption<T>[]
  onChange: (v: T) => void
  size?: 'sm'
  block?: boolean
  className?: string
}): React.JSX.Element {
  const id = useId()
  return (
    <div className={cx('segmented', props.size, props.block && 'block', props.className)} role="tablist">
      {props.options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === props.value}
          className={cx('segmented-item', o.value === props.value && 'active')}
          disabled={o.disabled}
          title={o.title}
          onClick={() => props.onChange(o.value)}
        >
          {o.value === props.value && (
            <motion.span layoutId={id} className="segmented-thumb" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- 复选框 ---------- */
export function Check(props: {
  checked: boolean
  onChange: () => void
  tone?: ColorKey
  size?: 'sm'
  title?: string
}): React.JSX.Element {
  return (
    <button
      className={cx('check', props.checked && 'on', props.size, props.tone && `tone-${props.tone}`)}
      role="checkbox"
      aria-checked={props.checked}
      title={props.title ?? (props.checked ? '标记为未完成' : '标记为完成')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        props.onChange()
      }}
    >
      <svg viewBox="0 0 12 12">
        <path d="M2.5 6.3 5 8.6 9.6 3.6" />
      </svg>
    </button>
  )
}

/* ---------- 开关 ---------- */
export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      className={cx('switch', props.checked && 'on')}
      onClick={() => props.onChange(!props.checked)}
    />
  )
}

/* ---------- 应用图标 ---------- */
const iconCache = new Map<string, Promise<string | null>>()
const FALLBACK_TONES: ColorKey[] = ['blue', 'violet', 'emerald', 'orange', 'rose', 'teal', 'amber', 'slate']

export function toneFor(text: string): ColorKey {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_TONES[h % FALLBACK_TONES.length]
}

export function AppIcon(props: { exe: string; name?: string; size?: number }): React.JSX.Element {
  const size = props.size ?? 20
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!props.exe) return
    if (!iconCache.has(props.exe)) iconCache.set(props.exe, api().getAppIcon(props.exe))
    iconCache.get(props.exe)!.then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [props.exe])
  const label = (props.name || props.exe || '?').replace(/\.exe$/i, '')
  return (
    <span
      className={cx('app-icon', src && 'has-img', !src && `tone-${toneFor(props.exe)}`)}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {src ? <img src={src} alt="" draggable={false} /> : label.charAt(0).toUpperCase()}
    </span>
  )
}

/* ---------- 进度条 / 环 ---------- */
export function Bar(props: { value: number; tone?: ColorKey; className?: string }): React.JSX.Element {
  const pct = Math.max(0, Math.min(1, props.value)) * 100
  return (
    <div className={cx('bar', props.tone && `tone-${props.tone}`, props.className)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Ring(props: { value: number; size?: number; stroke?: number; children?: ReactNode }): React.JSX.Element {
  const size = props.size ?? 44
  const stroke = props.stroke ?? 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, props.value))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      <div className="ring-label">{props.children}</div>
    </div>
  )
}

export function Kbd(props: { children: ReactNode }): React.JSX.Element {
  return <kbd className="kbd">{props.children}</kbd>
}

/* ---------- 时钟 ---------- */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
