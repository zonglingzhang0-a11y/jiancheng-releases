import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Maximize2, Minimize2, Plus, X, Zap } from 'lucide-react'
import { fromKey, fromMin, tasksOn, toMin, uid } from '@shared/schedule'
import type { RepeatType, Task } from '@shared/types'
import { defaultRule, useStore, type EditorState } from '../store'
import { WEEKDAY, WEEKDAY_SHORT } from '../lib/dates'
import { guessIcon, iconOf, TASK_ICONS, TaskIcon } from '../lib/icons'
import { burstAt } from '../lib/fx'
import { DatePicker, TimeSelect } from '../components/Pickers'
import { Popover, Select, useAnchor } from '../components/Popover'
import { cx, Kbd, Segmented, Switch } from '../components/ui'
import { Check } from '../home/Tree'
import { DeleteButton, RuleEditor } from './RuleEditor'
import { useTitleBarTone } from '../lib/titlebar'

function IconPicker(props: { task: Task; onChange: (icon: string | null) => void }): React.JSX.Element {
  const a = useAnchor()
  const current = iconOf(props.task)
  return (
    <>
      <button ref={a.ref} className={cx('icon-pick fx', a.open && 'open')} onClick={a.toggle} title="选择图标" aria-label="选择图标">
        <TaskIcon name={current} size={20} />
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={292}>
        <div className="icon-grid">
          <button
            className={cx('icon-auto fx', !props.task.icon && 'on')}
            onClick={() => {
              props.onChange(null)
              a.close()
            }}
          >
            按标题自动选
            <span>
              <TaskIcon name={guessIcon(props.task.title)} size={14} />
            </span>
          </button>
          {Object.keys(TASK_ICONS).map((name) => (
            <button
              key={name}
              className={cx('icon-cell fx', props.task.icon === name && 'on')}
              onClick={() => {
                props.onChange(name)
                a.close()
              }}
              aria-label={name}
            >
              <TaskIcon name={name} size={16} />
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}

const partOfDay = (task: Task): string => {
  if (!task.start) return '随时'
  const m = toMin(task.start)
  if (m < 300 || m >= 1200) return '夜'
  if (m < 660) return '晨'
  if (m < 1020) return '昼'
  return '暮'
}

export function Sheet(): React.JSX.Element {
  const editor = useStore((s) => s.editor)
  const closeEditor = useStore((s) => s.closeEditor)
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!editor) setFull(false)
  }, [editor])
  useTitleBarTone(!!editor, 'scrim')
  return createPortal(
    <AnimatePresence>
      {editor && (
        <>
          <motion.div key="scrim" className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onMouseDown={closeEditor} />
          <motion.aside
            key="sheet"
            className={cx('sheet', full && 'full')}
            role="dialog"
            aria-label={editor.isNew ? '新建日程' : '编辑日程'}
            initial={{ x: '104%' }}
            animate={{ x: 0 }}
            exit={{ x: '104%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <SheetBody key={editor.task.id} editor={editor} full={full} setFull={setFull} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

function SheetBody({ editor, full, setFull }: { editor: EditorState; full: boolean; setFull: (v: boolean) => void }): React.JSX.Element {
  const data = useStore((s) => s.data)
  const weekStart = data.settings.weekStart
  const closeEditor = useStore((s) => s.closeEditor)
  const saveTask = useStore((s) => s.saveTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const notifyCreated = useStore((s) => s.notifyCreated)
  const [task, setTask] = useState<Task>(() => ({ ...editor.task, subtasks: editor.task.subtasks ?? [] }))
  const [shake, setShake] = useState(0)
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [newSub, setNewSub] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Task>): void => {
    setTask((t) => ({ ...t, ...patch }))
    if ('auto' in patch) setRuleError(null)
  }

  useEffect(() => {
    if (editor.isNew) setTimeout(() => titleRef.current?.focus(), 240)
  }, [editor.isNew])

  const save = (): void => {
    if (!task.title.trim()) {
      setShake((n) => n + 1)
      titleRef.current?.focus()
      return
    }
    const rule = task.auto
    if (rule?.enabled) {
      const missing =
        rule.kind === 'app' && !rule.apps.length
          ? '请选择至少一个要监测的应用'
          : rule.kind === 'title' && !rule.keywords.length
            ? '请添加至少一个标题关键词'
            : rule.kind === 'file' && !rule.path.trim()
              ? '请填写要监测的文件或文件夹路径'
              : null
      if (missing) {
        setRuleError(missing)
        return
      }
    }
    let auto = task.auto
    if (auto && auto.scope === 'slot' && !(task.start && task.end)) auto = { ...auto, scope: 'day' }
    const pending = newSub.trim() ? [...(task.subtasks ?? []), { id: uid(), title: newSub.trim(), doneOn: [] }] : task.subtasks
    const next = { ...task, title: task.title.trim(), auto, subtasks: pending, updatedAt: Date.now() }
    saveTask(next)
    if (editor.isNew) notifyCreated(next)
    closeEditor()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        save()
      } else if (e.key === 'Escape' && !document.querySelector('.popover')) closeEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const timed = !!task.start
  const setTimed = (on: boolean): void => {
    if (on) {
      const now = new Date()
      const start = Math.min(22 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30)
      set({ start: fromMin(start), end: fromMin(start + 60) })
    } else set({ start: null, end: null })
  }
  const setStart = (start: string): void => {
    const dur = task.start && task.end ? toMin(task.end) - toMin(task.start) : 60
    set({ start, end: fromMin(Math.min(24 * 60, toMin(start) + Math.max(15, dur))) })
  }
  const repeatType = task.repeat.type
  const setRepeat = (type: RepeatType): void => {
    const weekdays = type === 'weekly' && !task.repeat.weekdays.length ? [fromKey(task.date).getDay()] : task.repeat.weekdays
    set({ repeat: { ...task.repeat, type, weekdays } })
  }
  const autoOn = !!task.auto?.enabled
  const subs = task.subtasks ?? []
  const addSub = (): void => {
    if (!newSub.trim()) return
    set({ subtasks: [...subs, { id: uid(), title: newSub.trim(), doneOn: [] }] })
    setNewSub('')
  }

  // 整页模式左侧：当天的时间线
  const dayList = useMemo(() => tasksOn(data.tasks, editor.date).filter((t) => t.start), [data.tasks, editor.date])
  const d = fromKey(editor.date)

  return (
    <>
      <div className="sh-top">
        <span className="chip-soft">{partOfDay(task)}</span>
        {!editor.isNew && task.repeat.type !== 'none' && <span className="chip-soft">重复日程 · 正在编辑全部</span>}
        <span className="sp" />
        <button className="ic fx" onClick={() => setFull(!full)} title={full ? '收起成侧栏' : '展开为整页'} aria-label={full ? '收起成侧栏' : '展开为整页'}>
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button className="ic fx" onClick={closeEditor} title="关闭（Esc）" aria-label="关闭">
          <X size={17} />
        </button>
      </div>
      <div className="sh-body">
        {full && (
          <div className="sh-day">
            <div className="sh-day-h">
              {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAY[d.getDay()]}
            </div>
            {dayList.length === 0 && <div className="sh-day-empty">这一天还没有定时间的日程</div>}
            {dayList.map((t) => (
              <div key={t.id} className={cx('ln', t.id === task.id && 'on')}>
                <span className="tnum">{t.start}</span>
                {t.id === task.id ? task.title || '（这一项）' : t.title}
              </div>
            ))}
          </div>
        )}
        <div className="sh-main">
          <motion.div key={shake} className="sh-title-row" animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : undefined} transition={{ duration: 0.35 }}>
            <IconPicker task={task} onChange={(icon) => set({ icon })} />
            <input
              ref={titleRef}
              className="sh-title"
              placeholder={editor.isNew ? '要做什么' : '日程标题'}
              value={task.title}
              onChange={(e) => set({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey && !e.nativeEvent.isComposing) save()
              }}
              aria-label="标题"
            />
          </motion.div>

          <div className="field">
            <label>时间</label>
            <div className="fline">
              <DatePicker value={task.date} onChange={(date) => set({ date })} weekStart={weekStart} prefix={repeatType !== 'none' ? '起始' : undefined} />
              <Segmented<'any' | 'timed'>
                size="sm"
                value={timed ? 'timed' : 'any'}
                onChange={(v) => setTimed(v === 'timed')}
                options={[
                  { value: 'any', label: '随时' },
                  { value: 'timed', label: '定时间' }
                ]}
              />
              {timed && (
                <span className="time-range">
                  <TimeSelect value={task.start!} onChange={setStart} />
                  <span className="time-sep">–</span>
                  <TimeSelect value={task.end!} after={task.start!} onChange={(end) => set({ end })} />
                </span>
              )}
            </div>
            {!timed && <div className="field-hint">没定时间的待办会漂在色带里，随时可以拖进空档</div>}
          </div>

          <div className="field">
            <label>重复</label>
            <div className="fline">
              <Select<RepeatType>
                value={repeatType}
                onChange={setRepeat}
                width={170}
                options={[
                  { value: 'none', label: '不重复' },
                  { value: 'daily', label: '每天' },
                  { value: 'weekdays', label: '工作日', meta: '周一至周五' },
                  { value: 'weekly', label: '每周指定日' }
                ]}
              />
              {repeatType === 'weekly' && (
                <div className="weekday-picks">
                  {Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7).map((wd) => {
                    const on = task.repeat.weekdays.includes(wd)
                    return (
                      <button
                        key={wd}
                        className={cx('weekday-pick fx', on && 'on')}
                        onClick={() => {
                          const next = on ? task.repeat.weekdays.filter((x) => x !== wd) : [...task.repeat.weekdays, wd]
                          if (next.length) set({ repeat: { ...task.repeat, weekdays: next.sort() } })
                        }}
                      >
                        {WEEKDAY_SHORT[wd]}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="field">
            <label>子待办{subs.length > 0 && <em className="tnum"> · {subs.filter((s) => s.doneOn.includes(editor.date)).length}/{subs.length}</em>}</label>
            <div className="subedit">
              {subs.map((s) => {
                const done = s.doneOn.includes(editor.date)
                return (
                  <div key={s.id} className={cx('sub-row', done && 'done')}>
                    <Check
                      small
                      on={done}
                      label="完成子待办"
                      onToggle={(e) => {
                        if (!done) burstAt(e)
                        set({ subtasks: subs.map((x) => (x.id === s.id ? { ...x, doneOn: done ? x.doneOn.filter((v) => v !== editor.date) : [...x.doneOn, editor.date] } : x)) })
                      }}
                    />
                    <input value={s.title} onChange={(e) => set({ subtasks: subs.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} aria-label="子待办" />
                    <button className="ic sm fx" onClick={() => set({ subtasks: subs.filter((x) => x.id !== s.id) })} aria-label="删除子待办">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
              <div className="sub-row add">
                <Plus size={14} />
                <input
                  value={newSub}
                  placeholder="添加子待办，回车确认"
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      e.stopPropagation()
                      addSub()
                    }
                  }}
                  aria-label="添加子待办"
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="sh-notes">备注</label>
            <textarea id="sh-notes" className="notes" rows={3} placeholder="写点什么" value={task.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>

          <div className={cx('auto-box', autoOn && 'on')}>
            <div className="auto-head">
              <span className="auto-ic">
                <Zap size={15} strokeWidth={2.4} />
              </span>
              <div className="auto-txt">
                <b>智能完成</b>
                <span>用够了某个应用、打开过某类网页或保存过文件，就自动打勾</span>
              </div>
              <Switch
                checked={autoOn}
                onChange={(on) => set({ auto: on ? { ...(task.auto ?? defaultRule()), enabled: true } : task.auto ? { ...task.auto, enabled: false } : null })}
              />
            </div>
            <AnimatePresence initial={false}>
              {autoOn && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <RuleEditor task={task} error={ruleError} onChange={(auto) => set({ auto })} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div className="sh-foot">
        {!editor.isNew && (
          <DeleteButton
            task={task}
            onDelete={(mode) => {
              deleteTask(task.id, mode, editor.date)
              closeEditor()
            }}
          />
        )}
        <span className="sp" />
        <button className="btn ghost fx" onClick={closeEditor}>
          取消
        </button>
        <button className="btn primary fx" onClick={save}>
          {editor.isNew ? '创建' : '保存'}
          <Kbd>Ctrl ↵</Kbd>
        </button>
      </div>
    </>
  )
}
