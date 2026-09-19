import { useEffect, useState } from 'react'
import { Keyboard, RotateCcw } from 'lucide-react'
import { DEFAULT_SETTINGS } from '@shared/types'
import { cx } from './ui'

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert'
}

/** 把键盘事件转换为 Electron Accelerator，如 Ctrl+Alt+Space；不合法时返回 null */
export function toAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  let key: string | null = null
  if (KEY_NAMES[e.key]) key = KEY_NAMES[e.key]
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (e.code === 'Backquote') key = '`'
  if (!key) return null
  // 必须带 Ctrl / Alt / Win 之一（F 键除外），避免抢占普通输入
  if (!/^F\d+$/.test(key) && !mods.some((m) => m === 'Ctrl' || m === 'Alt' || m === 'Super')) return null
  return [...mods, key].join('+')
}

export function HotkeyRecorder(props: { value: string; ok: boolean; onChange: (acc: string) => void }): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(false)
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return setHint('继续按下字母、数字或空格…')
      const acc = toAccelerator(e)
      if (!acc) return setHint('需要搭配 Ctrl、Alt 或 Win 键')
      props.onChange(acc)
      setRecording(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, props])

  useEffect(() => {
    if (recording) setHint(null)
  }, [recording])

  return (
    <div className="hotkey">
      <button className={cx('hotkey-box', recording && 'recording', !props.ok && !recording && 'bad')} onClick={() => setRecording((r) => !r)}>
        <Keyboard size={14} />
        {recording ? (
          <span className="hotkey-wait">{hint ?? '请按下新的快捷键…'}</span>
        ) : props.value ? (
          props.value.split('+').map((k) => (
            <kbd key={k} className="kbd">
              {k === 'Super' ? 'Win' : k}
            </kbd>
          ))
        ) : (
          <span className="hotkey-wait">未设置</span>
        )}
      </button>
      {props.value !== DEFAULT_SETTINGS.hotkey && !recording && (
        <button className="icon-btn sm" title="恢复默认" onClick={() => props.onChange(DEFAULT_SETTINGS.hotkey)}>
          <RotateCcw size={13} />
        </button>
      )}
    </div>
  )
}
