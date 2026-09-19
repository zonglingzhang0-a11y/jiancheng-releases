// 外观：字体搭配、字体加载、缺字检查
import type { FontRole, ImportedFont, LookSettings, RoleFont } from '@shared/types'
import { api } from './api'

export const ROLE_KEYS: FontRole[] = ['num', 'title', 'body', 'time']
export const ROLE_NAMES: Record<FontRole, string> = { num: '数字', title: '标题', body: '正文', time: '时间' }

type Triple = [string, number, number]
export interface Preset {
  key: string
  name: string
  /** built：随应用提供 · sys：Windows 自带 */
  src: 'built' | 'sys'
  num: Triple
  title: Triple
  body: Triple
  time: Triple
}

// 每套搭配：数字 / 标题 / 正文 / 时间 各自的 [字体, 粗细, 字号比例]
export const PRESETS: Preset[] = [
  { key: 'round', name: '圆润', src: 'built', num: ['Fredoka', 600, 1], title: ['Noto Sans SC', 600, 1], body: ['Noto Sans SC', 400, 1], time: ['IBM Plex Mono', 500, 1] },
  { key: 'book', name: '书卷', src: 'built', num: ['Instrument Serif', 400, 1.3], title: ['Noto Serif SC', 600, 1], body: ['Noto Serif SC', 400, 1], time: ['Instrument Serif', 400, 1.12] },
  { key: 'xiaowei', name: '小薇', src: 'built', num: ['Fraunces', 500, 1.08], title: ['ZCOOL XiaoWei', 400, 1.1], body: ['Noto Sans SC', 400, 1], time: ['Fraunces', 500, 1] },
  { key: 'butter', name: '黄油', src: 'built', num: ['Baloo 2', 700, 1.1], title: ['ZCOOL QingKe HuangYou', 400, 1.14], body: ['Noto Sans SC', 400, 1], time: ['Baloo 2', 600, 1.05] },
  { key: 'joy', name: '快乐', src: 'built', num: ['Fredoka', 600, 1.05], title: ['ZCOOL KuaiLe', 400, 1.12], body: ['Noto Sans SC', 400, 1], time: ['Fredoka', 500, 1.05] },
  { key: 'gauge', name: '仪表', src: 'built', num: ['DM Mono', 500, 0.9], title: ['Noto Sans SC', 500, 1], body: ['Noto Sans SC', 400, 1], time: ['DM Mono', 400, 1] },
  { key: 'kai', name: '楷意', src: 'sys', num: ['Young Serif', 400, 1.02], title: ['KaiTi', 400, 1.06], body: ['KaiTi', 400, 1.04], time: ['Young Serif', 400, 1] },
  { key: 'ink', name: '墨韵', src: 'built', num: ['Fraunces', 500, 1.05], title: ['Ma Shan Zheng', 400, 1.22], body: ['Noto Serif SC', 400, 1], time: ['Fraunces', 400, 1] },
  { key: 'note', name: '手札', src: 'built', num: ['Caveat', 600, 1.4], title: ['Long Cang', 400, 1.28], body: ['Noto Sans SC', 400, 1], time: ['Caveat', 600, 1.25] },
  { key: 'neon', name: '霓虹', src: 'built', num: ['Monoton', 400, 0.86], title: ['Noto Sans SC', 600, 1], body: ['Noto Sans SC', 400, 1], time: ['IBM Plex Mono', 500, 1] }
]

export const presetRoles = (p: Preset): Record<FontRole, RoleFont> =>
  Object.fromEntries(ROLE_KEYS.map((k) => [k, { family: p[k][0], weight: p[k][1], scale: p[k][2] }])) as Record<FontRole, RoleFont>

/** 随应用提供的字体：显示名 → [CSS 字族名, 按需加载] */
const BUILTIN: Record<string, [string, (() => Promise<unknown>) | null]> = {
  'Noto Sans SC': ['Noto Sans SC Variable', null],
  'Noto Serif SC': ['Noto Serif SC Variable', () => import('@fontsource-variable/noto-serif-sc/wght.css')],
  'ZCOOL XiaoWei': ['ZCOOL XiaoWei', () => import('@fontsource/zcool-xiaowei/400.css')],
  'ZCOOL QingKe HuangYou': ['ZCOOL QingKe HuangYou', () => import('@fontsource/zcool-qingke-huangyou/400.css')],
  'ZCOOL KuaiLe': ['ZCOOL KuaiLe', () => import('@fontsource/zcool-kuaile/400.css')],
  'Ma Shan Zheng': ['Ma Shan Zheng', () => import('@fontsource/ma-shan-zheng/400.css')],
  'Long Cang': ['Long Cang', () => import('@fontsource/long-cang/400.css')],
  Fredoka: ['Fredoka Variable', null],
  Fraunces: ['Fraunces Variable', null],
  'Instrument Serif': ['Instrument Serif', () => Promise.all([import('@fontsource/instrument-serif/400.css'), import('@fontsource/instrument-serif/400-italic.css')])],
  'Baloo 2': ['Baloo 2 Variable', () => import('@fontsource-variable/baloo-2/wght.css')],
  'DM Mono': ['DM Mono', () => Promise.all([import('@fontsource/dm-mono/400.css'), import('@fontsource/dm-mono/500.css')])],
  'IBM Plex Mono': ['IBM Plex Mono', null],
  'Young Serif': ['Young Serif', () => import('@fontsource/young-serif/400.css')],
  Caveat: ['Caveat', null],
  Monoton: ['Monoton', null]
}
export const BUILTIN_FAMILIES = Object.keys(BUILTIN)

/** 中文显示名 */
export const FAMILY_LABEL: Record<string, string> = {
  'Noto Sans SC': '思源黑体',
  'Noto Serif SC': '思源宋体',
  'ZCOOL XiaoWei': '站酷小薇',
  'ZCOOL QingKe HuangYou': '站酷庆科黄油体',
  'ZCOOL KuaiLe': '站酷快乐体',
  'Ma Shan Zheng': '马善政毛笔',
  'Long Cang': '龙藏手写',
  KaiTi: '楷体'
}

/** 只有一种粗细的字体：选中时自动用常规粗细，不让浏览器硬加粗 */
export const SINGLE_WEIGHT = new Set(['ZCOOL XiaoWei', 'ZCOOL QingKe HuangYou', 'ZCOOL KuaiLe', 'Ma Shan Zheng', 'Long Cang', 'Instrument Serif', 'Young Serif', 'Monoton', 'KaiTi', 'FangSong', 'SimSun', 'SimHei', '楷体', '仿宋', '宋体', '黑体'])

const loaded = new Map<string, Promise<unknown>>()
/** 按需加载随应用提供的字体（导入的字体在 registerImported 里加载） */
export function loadFamily(family: string): Promise<unknown> {
  const entry = BUILTIN[family]
  if (!entry?.[1]) return Promise.resolve()
  if (!loaded.has(family)) loaded.set(family, entry[1]().catch(() => undefined))
  return loaded.get(family)!
}

const importedFamily = (id: string): string => `JC Imported ${id}`
const registered = new Map<string, Promise<boolean>>()
/** 把导入的字体注册到页面上；读不到文件时返回 false */
export function registerImported(font: ImportedFont): Promise<boolean> {
  if (!registered.has(font.id)) {
    registered.set(
      font.id,
      api()
        .readFont(font.id)
        .then(async (bytes) => {
          if (!bytes) return false
          const face = new FontFace(importedFamily(font.id), new Uint8Array(bytes).buffer as ArrayBuffer)
          await face.load()
          document.fonts.add(face)
          return true
        })
        .catch(() => false)
    )
  }
  return registered.get(font.id)!
}

/** 设置里保存的字体名 → CSS font-family（带后备） */
export function familyStack(family: string, role: FontRole): string {
  let head: string
  if (family.startsWith('imported:')) head = `'${importedFamily(family.slice(9))}'`
  else if (BUILTIN[family]) head = `'${BUILTIN[family][0]}'`
  else if (family === 'KaiTi') head = `'KaiTi','STKaiti','楷体'`
  else head = `'${family.replace(/'/g, '')}'`
  return `${head}, 'Noto Sans SC Variable', 'Microsoft YaHei UI', ${role === 'num' || role === 'time' ? 'ui-monospace, ' : ''}sans-serif`
}

export function familyLabel(family: string, imported: ImportedFont[]): string {
  if (family.startsWith('imported:')) return imported.find((f) => `imported:${f.id}` === family)?.name ?? '已删除的字体'
  return FAMILY_LABEL[family] ?? family
}

/** 把四个位置的字体写成 CSS 变量；同时加载需要的字体 */
export function applyLook(root: HTMLElement, look: LookSettings, imported: ImportedFont[]): void {
  for (const k of ROLE_KEYS) {
    const r = look.roles[k]
    root.style.setProperty(`--wf-${k}`, familyStack(r.family, k))
    root.style.setProperty(`--wf-${k}-w`, String(r.weight))
    root.style.setProperty(`--wf-${k}-k`, String(r.scale))
    if (r.family.startsWith('imported:')) {
      const f = imported.find((x) => `imported:${x.id}` === r.family)
      if (f) registerImported(f)
    } else loadFamily(r.family)
  }
}

export const COMMON_HAN = '的一是了我不人在有这个上们来到时大地为中你说生国年着就那和要出也得里后自以会家可下而过天去能对小多然心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最但现前些所同日手又行意动方期头经长儿回位分老因很给名法间知世什两次使身者被高已亲其进此话常与活正感项写码产'
export const DIGITS = '0123456789:'

// 缺字检查：同一个字分别用「该字体 + 无衬线后备」和「该字体 + 衬线后备」画出来，
// 两次一样、又和两种后备都不同，说明字形来自该字体本身
let probe: CanvasRenderingContext2D | null = null
function glyphSig(font: string, ch: string): number {
  if (!probe) {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    probe = c.getContext('2d', { willReadFrequently: true })
  }
  const ctx = probe!
  ctx.clearRect(0, 0, 32, 32)
  ctx.font = font
  ctx.textBaseline = 'top'
  ctx.fillText(ch, 2, 2)
  const d = ctx.getImageData(0, 0, 32, 32).data
  let h = 0
  for (let i = 3; i < d.length; i += 8) h = (h * 31 + d[i]) >>> 0
  return h
}

/** 返回缺少的字 */
export function missingGlyphs(cssFamily: string, chars: string): string[] {
  const missing: string[] = []
  for (const ch of chars) {
    const a = glyphSig(`24px ${cssFamily}, sans-serif`, ch)
    const b = glyphSig('24px sans-serif', ch)
    const c = glyphSig(`24px ${cssFamily}, serif`, ch)
    const d = glyphSig('24px serif', ch)
    if (!(a === c && !(a === b && c === d))) missing.push(ch)
  }
  return missing
}

/** 设置里的字体名 → 用于检查的单个 CSS 字族 */
export function probeFamily(family: string): string {
  if (family.startsWith('imported:')) return `'${importedFamily(family.slice(9))}'`
  if (BUILTIN[family]) return `'${BUILTIN[family][0]}'`
  return `'${family.replace(/'/g, '')}'`
}

/** 检查某个位置的字体是否可用，返回提示文字（没问题时为空） */
export async function checkRole(family: string, role: FontRole, weight: number): Promise<string> {
  if (!family.startsWith('imported:')) await loadFamily(family)
  const css = probeFamily(family)
  try {
    await document.fonts.load(`${weight} 24px ${css}`, COMMON_HAN + DIGITS)
  } catch {
    /* 系统字体不需要加载 */
  }
  const cjk = role === 'title' || role === 'body'
  const dig = missingGlyphs(css, DIGITS)
  const han = cjk ? missingGlyphs(css, COMMON_HAN) : []
  if (dig.length === DIGITS.length && (!cjk || han.length === COMMON_HAN.length)) return '本机没有这个字体，会用思源黑体显示'
  if (cjk && han.length === COMMON_HAN.length) return '没有中文字形，中文会用思源黑体显示'
  if (cjk && han.length) return `缺 ${han.length} 个常用简体字（${han.slice(0, 6).join('')}…），缺的字用思源黑体补上，一行里会出现两种字形`
  if (!cjk && dig.length) return '缺少部分数字字形'
  return ''
}
