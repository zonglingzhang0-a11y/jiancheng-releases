import { useEffect, useState, type ReactNode } from 'react'
import { Camera, FolderOpen, Info, MousePointerClick, Palette, Radar, Settings2, ShieldCheck, SlidersHorizontal, Trash2, X, Zap } from 'lucide-react'
import { HotkeyRecorder } from './HotkeyRecorder'
import type { Settings, ShotStats } from '@shared/types'
import { useStore, type SettingsTab } from '../store'
import { api, isMock } from '../lib/api'
import { AppPicker } from './AppPicker'
import { Modal } from './Modal'
import { Popover, Select, useAnchor } from './Popover'
import { cx, Segmented, Switch } from './ui'
import { LookSettings } from './LookSettings'

function Row(props: { title: string; desc?: string; children: ReactNode; disabled?: boolean; stack?: boolean }): React.JSX.Element {
  return (
    <div className={cx('set-row', props.disabled && 'disabled', props.stack && 'stack')}>
      <div className="set-row-text">
        <div className="set-row-title">{props.title}</div>
        {props.desc && <div className="set-row-desc">{props.desc}</div>}
      </div>
      <div className="set-row-control">{props.children}</div>
    </div>
  )
}

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: '通用', icon: <SlidersHorizontal size={15} /> },
  { id: 'look', label: '外观', icon: <Palette size={15} /> },
  { id: 'entry', label: '快捷入口', icon: <Zap size={15} /> },
  { id: 'monitor', label: '智能监测', icon: <Radar size={15} /> },
  { id: 'capture', label: '本地截屏', icon: <Camera size={15} /> },
  { id: 'system', label: '系统', icon: <Settings2 size={15} /> }
]

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function ClearShotsButton(props: { onCleared: () => void; disabled: boolean }): React.JSX.Element {
  const a = useAnchor()
  return (
    <>
      <button ref={a.ref} className="btn btn-ghost btn-danger btn-sm" onClick={a.toggle} disabled={props.disabled}>
        <Trash2 size={14} />
        清空
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={220} align="end">
        <div className="confirm-pop">
          <div className="confirm-title">删除全部截图？</div>
          <div className="confirm-desc">截图会从本机永久删除，活动记录与日程不受影响。</div>
          <div className="confirm-actions">
            <button className="btn btn-ghost btn-sm" onClick={a.close}>
              取消
            </button>
            <button
              className="btn btn-sm btn-danger-solid"
              onClick={async () => {
                a.close()
                await api().clearShots()
                props.onCleared()
              }}
            >
              删除
            </button>
          </div>
        </div>
      </Popover>
    </>
  )
}

function CaptureSettings({ settings, set }: { settings: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }): React.JSX.Element {
  const bumpShots = useStore((s) => s.bumpShots)
  const version = useStore((s) => s.shotVersion)
  const [stats, setStats] = useState<ShotStats | null>(null)
  const off = !settings.shotEnabled

  useEffect(() => {
    api().getShotStats().then(setStats)
  }, [version, settings.shotRetention])

  return (
    <>
      <div className={cx('capture-hero', settings.shotEnabled && 'on')}>
        <span className="capture-hero-icon">
          <Camera size={18} />
        </span>
        <div className="capture-hero-text">
          <div className="capture-hero-title">本地截屏</div>
          <div className="capture-hero-desc">按间隔截取当前窗口，方便回看这段时间在做什么。截图只保存在这台电脑上，不会上传。</div>
        </div>
        <Switch checked={settings.shotEnabled} onChange={(v) => set('shotEnabled', v)} />
      </div>

      <section className="set-section">
        <Row title="截屏间隔" disabled={off}>
          <Select<number>
            value={settings.shotInterval}
            onChange={(v) => set('shotInterval', v)}
            width={130}
            disabled={off}
            options={[1, 2, 5, 10, 15, 30].map((m) => ({ value: m, label: `每 ${m} 分钟` }))}
          />
        </Row>
        <Row title="截屏范围" desc={settings.shotScope === 'tasks' ? '只在正在为智能任务计时的应用中截屏' : '所有前台应用都会截屏'} disabled={off}>
          <Segmented<Settings['shotScope']>
            size="sm"
            value={settings.shotScope}
            onChange={(v) => set('shotScope', v)}
            options={[
              { value: 'tasks', label: '智能任务相关', disabled: off },
              { value: 'all', label: '所有应用', disabled: off }
            ]}
          />
        </Row>
        <Row title="截取内容" disabled={off}>
          <Segmented<Settings['shotTarget']>
            size="sm"
            value={settings.shotTarget}
            onChange={(v) => set('shotTarget', v)}
            options={[
              { value: 'window', label: '当前窗口', disabled: off },
              { value: 'screen', label: '整个屏幕', disabled: off }
            ]}
          />
        </Row>
        <Row title="保留时长" desc="过期的截图会自动删除">
          <Select<number>
            value={settings.shotRetention}
            onChange={(v) => set('shotRetention', v)}
            width={120}
            options={[1, 3, 7, 14, 30].map((d) => ({ value: d, label: `${d} 天` }))}
          />
        </Row>
        <Row title="不截屏的应用" desc="例如密码管理器、网银；无痕浏览窗口始终不截屏" stack>
          <AppPicker value={settings.shotBlocklist} onChange={(v) => set('shotBlocklist', v)} placeholder="添加应用" />
        </Row>
      </section>

      <section className="set-section">
        <Row title="存储占用" desc={stats ? `${stats.count} 张截图 · ${formatBytes(stats.bytes)}` : '统计中…'}>
          <div className="set-actions">
            <button className="btn btn-outline btn-sm" onClick={() => api().openShotsFolder()} disabled={isMock()}>
              <FolderOpen size={14} />
              打开文件夹
            </button>
            <ClearShotsButton
              disabled={!stats?.count}
              onCleared={() => {
                bumpShots()
                api().getShotStats().then(setStats)
              }}
            />
          </div>
        </Row>
        <div className="set-note">
          <ShieldCheck size={13} />
          <span>空闲、锁屏和简程自身窗口不会截屏；画面与上一张几乎相同时自动跳过，节省空间。</span>
        </div>
      </section>
    </>
  )
}

function EntrySettings({ settings, set }: { settings: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }): React.JSX.Element {
  const hotkey = useStore((s) => s.hotkey)
  return (
    <>
      <section className="set-section">
        <div className="side-label">快捷面板</div>
        <Row
          title="呼出快捷键"
          desc={
            !settings.hotkey
              ? '未设置，仍可点击任务栏托盘图标打开'
              : hotkey.ok || hotkey.accelerator !== settings.hotkey
                ? '在任何地方按下即可弹出今日清单和一句话添加'
                : '这个快捷键被其他软件占用了，请换一个'
          }
        >
          <HotkeyRecorder value={settings.hotkey} ok={hotkey.ok || hotkey.accelerator !== settings.hotkey} onChange={(v) => set('hotkey', v)} />
        </Row>
        <div className="set-note">
          <MousePointerClick size={13} />
          <span>单击任务栏托盘里的简程图标也能打开快捷面板，双击打开主窗口。Windows 11 默认会把新图标收进「^」里，可以在「设置 → 个性化 → 任务栏 → 其他系统托盘图标」中让它常显。</span>
        </div>
      </section>

      <div className="set-note">
        <Info size={13} />
        <span>桌角卡片的开关、尺寸和层级在「外观」里调，托盘图标的右键菜单里也能切换。</span>
      </div>
    </>
  )
}

function UpdateRow(): React.JSX.Element {
  const update = useStore((s) => s.update)
  const time = update.checkedAt ? new Date(update.checkedAt).toTimeString().slice(0, 5) : ''
  const desc =
    update.state === 'dev'
      ? '测试版不检查更新，也不会被正式版的更新覆盖'
      : update.state === 'checking'
        ? '正在检查…'
        : update.state === 'latest'
          ? `已是最新版本${time ? `（${time} 检查过）` : ''}`
          : update.state === 'downloading'
            ? `正在下载 ${update.next ?? '新版本'}${update.percent ? ` · ${update.percent}%` : ''}`
            : update.state === 'ready'
              ? `${update.next} 已下载好，重启就能用上；不重启的话下次退出时自动安装`
              : update.state === 'error'
                ? update.message ?? '检查更新失败'
                : '启动后会自动检查，之后每 4 小时检查一次'
  return (
    <Row title={`简程${IS_TEST_BUILD ? ' 测试版' : ''} ${__APP_VERSION__}`} desc={desc}>
      {update.state === 'ready' ? (
        <button className="btn btn-primary btn-sm" onClick={() => api().installUpdate()}>
          重启更新
        </button>
      ) : (
        <button
          className="btn btn-outline btn-sm"
          onClick={() => api().checkUpdate()}
          disabled={isMock() || update.state === 'dev' || update.state === 'checking' || update.state === 'downloading'}
        >
          检查更新
        </button>
      )}
    </Row>
  )
}

export function SettingsDialog(): React.JSX.Element {
  const open = useStore((s) => s.settingsOpen)
  const tab = useStore((s) => s.settingsTab)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.data.settings)
  const update = useStore((s) => s.updateSettings)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    update({ [key]: value } as Partial<Settings>)
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} width={tab === 'look' ? 1200 : 760}>
      <div className={cx('settings', tab === 'look' && 'wide')}>
        <nav className="settings-nav">
          <h2 className="modal-title">设置</h2>
          {TABS.map((t) => (
            <button key={t.id} className={cx('settings-tab', tab === t.id && 'active')} onClick={() => setOpen(true, t.id)}>
              {t.icon}
              {t.label}
            </button>
          ))}
          <div className="settings-version">简程 {__APP_VERSION__}</div>
        </nav>

        <div className="settings-body">
          <div className="settings-head">
            <h3>{TABS.find((t) => t.id === tab)?.label}</h3>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="关闭">
              <X size={16} />
            </button>
          </div>

          <div className={cx('settings-content', tab === 'look' && 'look-mode')}>
            {tab === 'look' && <LookSettings />}
            {tab === 'general' && (
              <section className="set-section">
                <Row title="每周起始日">
                  <Segmented<'1' | '0'>
                    size="sm"
                    value={String(settings.weekStart) as '1' | '0'}
                    onChange={(v) => set('weekStart', Number(v) as 0 | 1)}
                    options={[
                      { value: '1', label: '周一' },
                      { value: '0', label: '周日' }
                    ]}
                  />
                </Row>
                <div className="settings-keys">
                  <div className="side-label">快捷键</div>
                  <div className="keys-grid">
                    {[
                      ['N', '一句话添加'],
                      ['Ctrl + N', '新建日程'],
                      ['H', '回到今天'],
                      ['← →', '前一天 / 后一天'],
                      ['W / M', '展开周 / 月'],
                      ['A', '智能监测'],
                      ['L', '外观设置'],
                      ['Ctrl + ,', '设置'],
                      ['Ctrl + Enter', '保存日程'],
                      ['Esc', '关闭编辑']
                    ].map(([k, v]) => (
                      <div key={k} className="keys-item">
                        <kbd className="kbd">{k}</kbd>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {tab === 'entry' && <EntrySettings settings={settings} set={set} />}

            {tab === 'monitor' && (
              <section className="set-section">
                <Row title="启用智能监测" desc="记录前台应用与窗口标题，用于自动完成任务">
                  <Switch checked={settings.monitorEnabled} onChange={(v) => set('monitorEnabled', v)} />
                </Row>
                <Row title="空闲判定" desc="超过该时长没有键鼠操作，不再计入使用时长">
                  <Select<number>
                    value={settings.idleMinutes}
                    onChange={(v) => set('idleMinutes', v)}
                    width={140}
                    options={[
                      { value: 2, label: '2 分钟' },
                      { value: 5, label: '5 分钟' },
                      { value: 10, label: '10 分钟' },
                      { value: 15, label: '15 分钟' },
                      { value: 0, label: '不检测空闲' }
                    ]}
                  />
                </Row>
                <Row title="自动完成时通知">
                  <Switch checked={settings.notify} onChange={(v) => set('notify', v)} />
                </Row>
              </section>
            )}

            {tab === 'capture' && <CaptureSettings settings={settings} set={set} />}

            {tab === 'system' && (
              <section className="set-section">
                <UpdateRow />
                <Row title="开机自动启动" desc="在后台静默启动，保证监测不中断">
                  <Switch checked={settings.launchAtLogin} onChange={(v) => set('launchAtLogin', v)} />
                </Row>
                <Row title="关闭窗口时最小化到托盘">
                  <Switch checked={settings.closeToTray} onChange={(v) => set('closeToTray', v)} />
                </Row>
                <Row title="数据文件夹" desc="日程、活动记录、截图和导入的字体都保存在本机">
                  <button className="btn btn-outline btn-sm" onClick={() => api().openDataFolder()} disabled={isMock()}>
                    <FolderOpen size={14} />
                    打开
                  </button>
                </Row>
                <div className="set-note">
                  <Info size={13} />
                  <span>
                    简程 {__APP_VERSION__}。随应用提供的字体（思源黑体、思源宋体、站酷系列、马善政、龙藏、Fredoka、Fraunces 等）均以 SIL Open Font License 1.1 授权；图标来自 Lucide（ISC 许可）。
                  </span>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
