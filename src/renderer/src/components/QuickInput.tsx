import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CalendarDays, Clock3, CornerDownLeft, Plus, Repeat2, Zap } from 'lucide-react'
import { parseQuick, type QuickParsed, type QuickToken } from '@shared/quickParse'
import { todayKey } from '@shared/schedule'
import type { Task } from '@shared/types'
import { taskFromQuick, useStore } from '../store'
import { AppIcon, cx } from './ui'

const TOKEN_ICON: Record<QuickToken['kind'], React.JSX.Element> = {
  date: <CalendarDays size={12} />,
  time: <Clock3 size={12} />,
  repeat: <Repeat2 size={12} />,
  rule: <Zap size={12} strokeWidth={2.4} />
}

export const EXAMPLES = ['明天下午3点 开会', '每天 背单词 30分钟 @不背单词', '周五 10:00-11:30 看牙医', '工作日 写代码 2小时 @code']

export interface QuickInputHandle {
  focus(): void
}

/**
 * 一句话添加：实时显示识别到的日期、时间、重复与智能规则。
 * 输入 @ 时弹出最近使用的应用。
 */
export const QuickInput = forwardRef<
  QuickInputHandle,
  {
    size?: 'md' | 'lg'
    /** 没写日期时使用的默认日期 */
    date?: string
    placeholder?: string
    autoFocus?: boolean
    showExamples?: boolean
    onCreated?: (task: Task) => void
    /** 提供时显示「详细设置」，把识别结果交给完整编辑器 */
    onDetail?: (task: Task) => void
    onEscape?: () => void
  }
>(function QuickInput(props, ref) {
  const recentApps = useStore((s) => s.recentApps)
  const refreshApps = useStore((s) => s.refreshApps)
  const saveTask = useStore((s) => s.saveTask)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }))

  useEffect(() => {
    if (props.autoFocus) inputRef.current?.focus()
  }, [props.autoFocus])

  const parsed: QuickParsed | null = useMemo(() => {
    if (!text.trim()) return null
    const p = parseQuick(text, { today: todayKey(), apps: recentApps })
    const hasDate = p.tokens.some((t) => t.kind === 'date')
    return hasDate || !props.date ? p : { ...p, date: props.date }
  }, [text, recentApps, props.date])

  // @ 应用补全
  const atMatch = text.match(/[@＠]([^\s@＠]*)$/)
  const suggestions = useMemo(() => {
    if (!atMatch) return []
    const q = atMatch[1].toLowerCase()
    return recentApps.filter((a) => !q || a.name.toLowerCase().includes(q) || a.exe.includes(q)).slice(0, 6)
  }, [atMatch?.[1], recentApps])
  const showSuggest = focused && !!atMatch && suggestions.length > 0

  useEffect(() => setActive(0), [atMatch?.[1]])

  const pickApp = (exe: string): void => {
    setText((t) => t.replace(/[@＠]([^\s@＠]*)$/, `@${exe.replace(/\.exe$/i, '')} `))
    inputRef.current?.focus()
  }

  const submit = async (): Promise<void> => {
    if (!parsed?.title) return
    const task = taskFromQuick(parsed)
    await saveTask(task)
    setText('')
    props.onCreated?.(task)
  }

  return (
    <div className={cx('qi', `qi-${props.size ?? 'md'}`, focused && 'focus')}>
      <div className="qi-box">
        <Plus size={props.size === 'lg' ? 18 : 16} className="qi-icon" />
        <input
          ref={inputRef}
          value={text}
          placeholder={props.placeholder ?? '一句话添加，如「明天下午3点 开会」'}
          onFocus={() => {
            setFocused(true)
            refreshApps()
          }}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (showSuggest) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                return setActive((i) => (i + 1) % suggestions.length)
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                return setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                return pickApp(suggestions[active].exe)
              }
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (e.shiftKey && props.onDetail && parsed) props.onDetail(taskFromQuick(parsed))
              else submit()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              if (text) setText('')
              else props.onEscape?.()
            }
          }}
        />
        {parsed?.title ? (
          <button className="qi-submit" onMouseDown={(e) => e.preventDefault()} onClick={submit} title="添加 (Enter)">
            <CornerDownLeft size={14} />
          </button>
        ) : null}
      </div>

      {parsed && (parsed.tokens.length > 0 || props.onDetail) && (
        <div className="qi-preview">
          {parsed.tokens.map((t, i) => (
            <span key={i} className={cx('qi-token', `qi-${t.kind}`)}>
              {TOKEN_ICON[t.kind]}
              {t.label}
            </span>
          ))}
          {parsed.title && <span className="qi-title">「{parsed.title}」</span>}
          {props.onDetail && (
            <button className="qi-detail" onMouseDown={(e) => e.preventDefault()} onClick={() => props.onDetail!(taskFromQuick(parsed))}>
              详细设置 <kbd className="kbd">Shift ↵</kbd>
            </button>
          )}
        </div>
      )}

      {props.showExamples && !text && (
        <div className="qi-examples">
          <span>试试：</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="qi-example"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText(ex)
                inputRef.current?.focus()
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {showSuggest && (
        <div className="qi-suggest">
          <div className="menu-label">选择要监测的应用</div>
          {suggestions.map((a, i) => (
            <button
              key={a.exe}
              className={cx('menu-item', i === active && 'hover')}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pickApp(a.exe)}
            >
              <AppIcon exe={a.exe} name={a.name} size={18} />
              <span>{a.name}</span>
              <span className="menu-meta">{a.exe}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
