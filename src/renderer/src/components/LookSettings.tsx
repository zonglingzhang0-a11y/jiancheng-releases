import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, RotateCcw, Trash2, Upload } from 'lucide-react'
import type { CardSettings, ClockStyle, FontRole, ImportedFont, LookSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { useStore } from '../store'
import { api, isMock } from '../lib/api'
import { useNowSec } from '../lib/clock'
import {
  BUILTIN_FAMILIES,
  checkRole,
  COMMON_HAN,
  DIGITS,
  FAMILY_LABEL,
  familyLabel,
  familyStack,
  loadFamily,
  missingGlyphs,
  PRESETS,
  presetRoles,
  probeFamily,
  registerImported,
  ROLE_KEYS,
  ROLE_NAMES,
  SINGLE_WEIGHT
} from '../lib/look'
import { DeskCard } from '../widget/DeskCard'
import { Clock } from '../home/ClockBox'
import { cx, Segmented, Switch } from './ui'

let systemFontsCache: Promise<{ family: string; label: string }[]> | null = null
const systemFonts = (): Promise<{ family: string; label: string }[]> => (systemFontsCache ??= api().getSystemFonts().catch(() => []))

function Section(props: { title: string; meta?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <section className="lk-sec">
      <div className="lk-h">
        {props.title}
        {props.meta && <span>{props.meta}</span>}
      </div>
      {props.children}
    </section>
  )
}

function Row(props: { label: string; hint?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="row2">
      <span>
        {props.label}
        {props.hint && <em>{props.hint}</em>}
      </span>
      {props.children}
    </div>
  )
}

/* ---------- 预览：首页时钟 + 三种桌角卡片 ---------- */
export function LookPreview(): React.JSX.Element {
  const data = useStore((s) => s.data)
  const progress = useStore((s) => s.progress)
  const toggle = useStore((s) => s.toggle)
  const pvRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const { look, fonts } = data.settings
  const sec = useNowSec(1000)

  useLayoutEffect(() => {
    const pv = pvRef.current
    const stg = stageRef.current
    if (!pv || !stg) return
    const fit = (): void => setScale(Math.max(0.35, Math.min(1, (pv.clientWidth - 48) / stg.offsetWidth, (pv.clientHeight - 48) / stg.offsetHeight)))
    const ro = new ResizeObserver(fit)
    ro.observe(pv)
    fit()
    return () => ro.disconnect()
  }, [])

  const common = { data, progress, look, fonts, onAction: () => undefined, onToggle: (i: { task: { id: string }; date: string }) => toggle(i.task.id, i.date) }
  return (
    <div className="pv" ref={pvRef}>
      <div className="pv-stage" ref={stageRef} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="pv-col">
          <span className="pv-label">首页时钟</span>
          <div className="pv-clock">
            <Clock sec={sec} style={look.clock} seconds={look.seconds} />
          </div>
          <span className="pv-label">小卡</span>
          <DeskCard size="s" {...common} />
          <span className="pv-label">中卡</span>
          <DeskCard size="m" {...common} />
        </div>
        <div className="pv-col">
          <span className="pv-label">侧栏</span>
          <div className="pv-side">
            <DeskCard size="side" {...common} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 按位置自定义 ---------- */
function RoleRow(props: { role: FontRole; look: LookSettings; imported: ImportedFont[]; system: { family: string; label: string }[]; onChange: (patch: Partial<LookSettings['roles'][FontRole]>) => void }): React.JSX.Element {
  const r = props.look.roles[props.role]
  const [note, setNote] = useState('')
  useEffect(() => {
    let alive = true
    setNote('')
    checkRole(r.family, props.role, r.weight).then((msg) => alive && setNote(msg))
    return () => {
      alive = false
    }
  }, [r.family, r.weight, props.role])
  const known = BUILTIN_FAMILIES.includes(r.family) || props.system.some((f) => f.family === r.family) || props.imported.some((f) => `imported:${f.id}` === r.family) || r.family === 'KaiTi'
  return (
    <div className="role">
      <label htmlFor={`rf-${props.role}`}>{ROLE_NAMES[props.role]}</label>
      <select
        id={`rf-${props.role}`}
        value={r.family}
        onChange={(e) => {
          const family = e.target.value
          const single = SINGLE_WEIGHT.has(family) || family.startsWith('imported:')
          props.onChange({ family, weight: single ? 400 : props.role === 'body' ? 400 : props.role === 'time' ? 500 : 600 })
        }}
      >
        {!known && <option value={r.family}>{familyLabel(r.family, props.imported)}（不可用）</option>}
        <optgroup label="随应用提供">
          {BUILTIN_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {FAMILY_LABEL[f] ?? f}
            </option>
          ))}
        </optgroup>
        {props.imported.length > 0 && (
          <optgroup label="已导入">
            {props.imported.map((f) => (
              <option key={f.id} value={`imported:${f.id}`}>
                {f.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={props.system.length ? '本机字体' : '本机字体（读取中）'}>
          {!props.system.some((f) => f.family === 'KaiTi' || f.family === '楷体') && <option value="KaiTi">楷体</option>}
          {props.system.map((f) => (
            <option key={f.family} value={f.family}>
              {f.label}
            </option>
          ))}
        </optgroup>
      </select>
      <div className="rk">
        <input type="range" min={0.8} max={1.4} step={0.02} value={r.scale} onChange={(e) => props.onChange({ scale: Number(e.target.value) })} aria-label={`${ROLE_NAMES[props.role]}字号`} />
        <b className="tnum">{Math.round(r.scale * 100)}%</b>
      </div>
      {note && <span className="note">{note}</span>}
    </div>
  )
}

/* ---------- 导入的字体 ---------- */
function ImportedRow(props: { font: ImportedFont; inUse: boolean; onRemove: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    registerImported(props.font).then((ok) => {
      if (!alive) return
      if (!ok) return setInfo('读不出这个文件，删掉后换一个 ttf、otf 或 woff2 试试')
      const css = probeFamily(`imported:${props.font.id}`)
      const han = missingGlyphs(css, COMMON_HAN)
      const dig = missingGlyphs(css, DIGITS)
      const hanOk = COMMON_HAN.length - han.length
      const use = han.length === COMMON_HAN.length ? '适合数字和时间' : han.length ? '缺的字会用思源黑体补上' : '四个位置都能用'
      setInfo(`常用简体字 ${hanOk} / ${COMMON_HAN.length}${han.length && han.length < COMMON_HAN.length ? ` · 缺「${han.slice(0, 6).join('')}」` : ''} · 数字${dig.length ? '不全' : '齐全'} · ${use}`)
    })
    return () => {
      alive = false
    }
  }, [props.font])
  return (
    <div className="imp-row">
      <b style={{ fontFamily: familyStack(`imported:${props.font.id}`, 'title') }}>{props.font.name}</b>
      <span>{info ?? '读取中'}</span>
      <button className="ic sm fx" onClick={props.onRemove} title={props.inUse ? '正在使用，删除后这些位置会换回默认字体' : '删除'} aria-label="删除字体">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

const CLOCKS: { id: ClockStyle; label: string }[] = [
  { id: 'round', label: '圆润' },
  { id: 'serif', label: '软衬线' },
  { id: 'neon', label: '霓虹线' },
  { id: 'hand', label: '手写' },
  { id: 'flip', label: '翻页钟' },
  { id: 'seg', label: '数码管' }
]

/** 设置 → 外观：左边调节，右边预览 */
export function LookSettings(): React.JSX.Element {
  const settings = useStore((s) => s.data.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const updateLook = useStore((s) => s.updateLook)
  const showToast = useStore((s) => s.showToast)
  const { look, card, fonts } = settings
  const [system, setSystem] = useState<{ family: string; label: string }[]>([])
  const [custom, setCustom] = useState(look.preset === 'custom')

  useEffect(() => {
    systemFonts().then(setSystem)
    // 预先加载各套搭配里的字体，切换时不闪
    for (const p of PRESETS) for (const k of ROLE_KEYS) loadFamily(p[k][0])
  }, [])

  const setCard = (patch: Partial<CardSettings>): void => {
    updateSettings({ card: { ...card, ...patch } })
  }
  const setRole = (role: FontRole, patch: Partial<LookSettings['roles'][FontRole]>): void => {
    updateLook({ preset: 'custom', roles: { ...look.roles, [role]: { ...look.roles[role], ...patch } } })
  }
  const importFont = async (): Promise<void> => {
    if (isMock()) return showToast('浏览器预览里不能导入字体，请在桌面版里试')
    const font = await api().importFont()
    if (!font) return
    setCustom(true)
    showToast(`已导入「${font.name}」，可以在「按位置自定义」里选用`)
  }
  const removeFont = async (font: ImportedFont): Promise<void> => {
    const key = `imported:${font.id}`
    const used = ROLE_KEYS.filter((k) => look.roles[k].family === key)
    if (used.length) {
      const defaults = DEFAULT_SETTINGS.look.roles
      updateLook({ roles: { ...look.roles, ...Object.fromEntries(used.map((k) => [k, defaults[k]])) } })
    }
    await api().removeFont(font.id)
  }

  return (
    <div className="look-split">
      <div className="look-panel">
        <Section title="字体搭配" meta={look.preset === 'custom' ? '当前：自定义' : `${PRESETS.length} 套`}>
          <div className="pairs">
            {PRESETS.map((p) => (
              <button key={p.key} className={cx('pair fx', look.preset === p.key && 'on')} onClick={() => updateLook({ preset: p.key, roles: presetRoles(p) })}>
                <span className="pn tnum" style={{ fontFamily: familyStack(p.num[0], 'num'), fontWeight: p.num[1], fontSize: Math.round(26 * p.num[2]) }}>
                  10:42
                </span>
                <span className="pt" style={{ fontFamily: familyStack(p.title[0], 'title'), fontWeight: p.title[1], fontSize: +(15 * p.title[2]).toFixed(1) }}>
                  深度工作 · 写代码
                </span>
                <span className="pm">
                  <b>{p.name}</b>
                  <span className="tag">{p.src === 'sys' ? '系统字体' : '内置'}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        <section className="lk-sec">
          <button className={cx('lk-more-h fx', custom && 'open')} onClick={() => setCustom(!custom)} aria-expanded={custom}>
            <ChevronRight size={14} className="chev" />
            按位置自定义
            <span>数字 · 标题 · 正文 · 时间</span>
          </button>
          {custom && (
            <div className="roles">
              {ROLE_KEYS.map((k) => (
                <RoleRow key={k} role={k} look={look} imported={fonts} system={system} onChange={(patch) => setRole(k, patch)} />
              ))}
            </div>
          )}
        </section>

        <Section title="导入字体" meta="ttf · otf · woff2">
          <button className="btn soft fx lk-file" onClick={importFont}>
            <Upload size={14} />
            选择字体文件
          </button>
          <div className="imp-list">
            {fonts.length === 0 && <span className="imp-empty">还没有导入的字体。导入后会复制到简程的数据文件夹里，换电脑时一起备份。</span>}
            {fonts.map((f) => (
              <ImportedRow key={f.id} font={f} inUse={ROLE_KEYS.some((k) => look.roles[k].family === `imported:${f.id}`)} onRemove={() => removeFont(f)} />
            ))}
          </div>
        </Section>

        <Section title="桌角卡片">
          <Row label="显示卡片">
            <Switch checked={card.enabled} onChange={(v) => setCard({ enabled: v })} />
          </Row>
          <Row label="尺寸">
            <Segmented<CardSettings['size']>
              size="sm"
              value={card.size}
              onChange={(size) => setCard({ size, enabled: true })}
              options={[
                { value: 's', label: '小卡' },
                { value: 'm', label: '中卡' },
                { value: 'side', label: '侧栏' }
              ]}
            />
          </Row>
          <Row label="层级" hint={card.layer === 'top' ? '始终在其他窗口上面' : '在其他窗口下面，挪开窗口就能看到'}>
            <Segmented<CardSettings['layer']>
              size="sm"
              value={card.layer}
              onChange={(layer) => setCard({ layer })}
              options={[
                { value: 'top', label: '置顶' },
                { value: 'desktop', label: '贴在桌面' }
              ]}
            />
          </Row>
          <Row label="鼠标移开时变淡" hint="漂浮也会停下，不打扰眼角">
            <Switch checked={card.fadeAway} onChange={(v) => setCard({ fadeAway: v })} />
          </Row>
          <Row label="全屏时隐藏" hint="看视频、玩游戏、演示时">
            <Switch checked={card.hideFullscreen} onChange={(v) => setCard({ hideFullscreen: v })} />
          </Row>
        </Section>

        <Section title="首页">
          <div className="clock-opts">
            {CLOCKS.map((c) => (
              <button key={c.id} className={cx('clock-opt fx', look.clock === c.id && 'on')} onClick={() => updateLook({ clock: c.id })}>
                <span className="clock-mini">
                  <Clock sec={10 * 3600 + 42 * 60} style={c.id} seconds={false} />
                </span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <Row label="时钟显示秒">
            <Switch checked={look.seconds} onChange={(v) => updateLook({ seconds: v })} />
          </Row>
          <Row label="空档与间隔" hint="标出空闲时长和离下一项还有多久">
            <Switch checked={look.gaps} onChange={(v) => updateLook({ gaps: v })} />
          </Row>
          <Row label="太阳轨迹">
            <Switch checked={look.sun} onChange={(v) => updateLook({ sun: v })} />
          </Row>
          <Row label="任务图标">
            <Switch checked={look.icons} onChange={(v) => updateLook({ icons: v })} />
          </Row>
          <Row label="倒计时环" hint="大钟旁边显示当前日程还剩多久">
            <Switch checked={look.ring} onChange={(v) => updateLook({ ring: v })} />
          </Row>
          <Row label="完成后沉底" hint="漂着的待办完成后慢慢沉到色带底部">
            <Switch checked={look.gravity} onChange={(v) => updateLook({ gravity: v })} />
          </Row>
          <Row label="漂浮速度">
            <div className="rk">
              <input type="range" min={0} max={2.5} step={0.1} value={look.floatSpeed} onChange={(e) => updateLook({ floatSpeed: Number(e.target.value) })} aria-label="漂浮速度" />
              <b className="tnum">{look.floatSpeed.toFixed(1)}</b>
            </div>
          </Row>
          <Row label="色带夜间灰度">
            <div className="rk">
              <input type="range" min={0} max={2} step={0.1} value={look.night} onChange={(e) => updateLook({ night: Number(e.target.value) })} aria-label="色带夜间灰度" />
              <b className="tnum">{look.night.toFixed(1)}</b>
            </div>
          </Row>
        </Section>

        <button
          className="btn ghost fx lk-reset"
          onClick={() => {
            updateLook(DEFAULT_SETTINGS.look)
            setCustom(false)
          }}
        >
          <RotateCcw size={13} />
          外观恢复默认
        </button>
      </div>
      <LookPreview />
    </div>
  )
}
