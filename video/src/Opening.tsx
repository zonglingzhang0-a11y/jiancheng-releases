// 开场（第二版）：一天被快进——指针越转越快、滴答越来越密，圆往里一收再「嗖」地甩直，
// 色带长厚时弹一下、落定一声闷响、一道光扫过，「现在」带回弹落下，标题逐字弹入。镜头随色带变长慢慢拉远。
import { useMemo } from 'react'
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { dayTone, NIGHT, SANS, SERIF, waitForFonts } from './theme'

const TITLE = '把一天，画成一条色带。'
const STRESS = new Set([5, 6, 7, 8]) // 「一条色带」四个字再强调一下
const N = 576
const R = 250
const L = 1560
const NOW = 20.5 / 24

// 关键时间点（秒）
const T = {
  sweepA: 0.3,
  sweepB: 1.85,
  unrollA: 2.0,
  unrollB: 2.7,
  grow: 2.5,
  sweepLight: 2.85,
  now: 2.95,
  text: 3.15,
  brand: 3.95
}
const SWEEP_POW = 2.2 // 指针越转越快：进度 = 时间的 2.2 次方

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const outExpo = (x: number): number => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const inOut = Easing.bezier(0.45, 0, 0.2, 1)

// 固定种子的星点
const STARS = Array.from({ length: 46 }, (_, i) => {
  const r = (k: number): number => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  return { x: r(1), y: r(2), s: 0.8 + r(3) * 1.8, a: 0.12 + r(4) * 0.28, p: r(5) * 6.28 }
})

/** 每一个整点，指针经过的时刻（秒）；间隔太密的就不再发出滴答声 */
const HOUR_TICKS = (() => {
  const out: number[] = []
  let last = -1
  for (let k = 1; k <= 24; k++) {
    const t = T.sweepA + (T.sweepB - T.sweepA) * Math.pow(k / 24, 1 / SWEEP_POW)
    if (t - last >= 0.055) {
      out.push(t)
      last = t
    }
  }
  return out
})()

export function Opening(): React.JSX.Element {
  useMemo(() => waitForFonts(TITLE + '简程测试版0612182400'), [])
  const f = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const t = f / fps
  const at = (sec: number): number => Math.round(sec * fps)
  const cx = width / 2
  const cy = height / 2 - 30
  const x0 = cx - L / 2

  // 钟面弹出来，刻度一根接一根冒出
  const dialIn = spring({ frame: f, fps, config: { damping: 11, stiffness: 140 } })
  const sweep = Math.pow(clamp01((t - T.sweepA) / (T.sweepB - T.sweepA)), SWEEP_POW)
  // 展开前往里收一下
  const antic = interpolate(t, [T.sweepB, T.unrollA - 0.02, T.unrollA + 0.08], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const ringScale = dialIn * (1 - 0.045 * antic)
  const unrollAt = (delay: number): number => outExpo(clamp01((t - T.unrollA - delay) / (T.unrollB - T.unrollA)))
  const unroll = unrollAt(0)
  const flat = unroll >= 0.999
  // 色带长厚：冲过头再弹回
  const growS = spring({ frame: f - at(T.grow), fps, config: { damping: 9, stiffness: 150, mass: 0.9 } })
  const thick = 16 + (150 - 16) * growS
  const nowS = spring({ frame: f - at(T.now), fps, config: { damping: 8, stiffness: 170 } })
  const brand = clamp01((t - T.brand) / 0.5)
  // 镜头：从近处开始，随着色带展开慢慢拉远
  const cam = interpolate(t, [0, T.unrollA, T.unrollB + 0.4, 4.8], [1.16, 1.12, 1.0, 0.985], { easing: inOut, extrapolateRight: 'clamp' })

  const pt = (u: number, un: number): [number, number] => {
    const a = -Math.PI / 2 + u * Math.PI * 2
    const px = cx + R * ringScale * Math.cos(a)
    const py = cy + R * ringScale * Math.sin(a)
    return [px + (x0 + u * L - px) * un, py + (cy - py) * un]
  }

  const segs: React.JSX.Element[] = []
  const shown = flat ? 0 : Math.floor(N * sweep)
  for (let i = 0; i < shown; i++) {
    const [ax, ay] = pt(i / N, unroll)
    const [bx, by] = pt((i + 1.4) / N, unroll)
    segs.push(<line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={dayTone((i / N) * 24)} strokeWidth={thick} strokeLinecap="butt" />)
  }

  // 刻度：出现时依次冒出；展开时一根跟一根被甩开
  const ticks: React.JSX.Element[] = []
  for (let h = 0; h <= 24; h++) {
    const u = h / 24
    const un = unrollAt(h * 0.012)
    if (h === 24 && un < 0.5) continue
    const pop = spring({ frame: f - at(0.05 + h * 0.012), fps, config: { damping: 12, stiffness: 200 } })
    const a = -Math.PI / 2 + u * Math.PI * 2
    const major = h % 6 === 0
    const r1 = (R + 26) * ringScale
    const r2 = (R + (major ? 46 : 36)) * ringScale
    const lineY = cy + thick / 2 + 14
    const m = (p: [number, number], q: [number, number]): [number, number] => [p[0] + (q[0] - p[0]) * un, p[1] + (q[1] - p[1]) * un]
    const [ax, ay] = m([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)], [x0 + u * L, lineY])
    const [bx, by] = m([cx + r2 * Math.cos(a), cy + r2 * Math.sin(a)], [x0 + u * L, lineY + (major ? 16 : 9)])
    ticks.push(<line key={h} x1={ax} y1={ay} x2={bx} y2={by} stroke="#8a8b90" strokeWidth={major ? 3 : 2} strokeLinecap="round" opacity={pop} />)
    if (major)
      ticks.push(
        <text key={`t${h}`} x={x0 + u * L} y={lineY + 46} fill="#8a8b90" fontFamily={SANS} fontSize={22} textAnchor="middle" opacity={clamp01((un - 0.85) / 0.15)}>
          {String(h).padStart(2, '0')}
        </text>
      )
  }

  // 指针：越转越快时拖出一道残影；白天指尖带一点太阳的光
  const hand: React.JSX.Element[] = []
  const handOpacity = dialIn * (1 - unroll)
  for (let k = 5; k >= 0; k--) {
    const tk = t - k * 0.018
    const pk = Math.pow(clamp01((tk - T.sweepA) / (T.sweepB - T.sweepA)), SWEEP_POW)
    const ha = -Math.PI / 2 + pk * Math.PI * 2
    hand.push(
      <line
        key={k}
        x1={cx}
        y1={cy}
        x2={cx + (R - 40) * ringScale * Math.cos(ha)}
        y2={cy + (R - 40) * ringScale * Math.sin(ha)}
        stroke="#f4f4f3"
        strokeWidth={k === 0 ? 5 : 4}
        strokeLinecap="round"
        opacity={handOpacity * (k === 0 ? 1 : 0.22 * (1 - k / 6))}
      />
    )
  }
  const ha = -Math.PI / 2 + sweep * Math.PI * 2
  const hour = sweep * 24
  const sunny = hour > 6 && hour < 18.3 ? Math.sin((Math.PI * (hour - 6)) / 12.3) : 0
  const tipX = cx + (R - 40) * ringScale * Math.cos(ha)
  const tipY = cy + (R - 40) * ringScale * Math.sin(ha)

  // 色带落定后一道光从左扫到右
  const lightX = interpolate(t, [T.sweepLight, T.sweepLight + 0.55], [-0.15, 1.15], { easing: inOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const nowX = x0 + NOW * L
  const nowY = cy - thick / 2 - 26 - (1 - nowS) * 90

  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: 'hidden' }}>
      {/* 背景星点，缓慢漂移、轻轻闪烁 */}
      <svg width={width} height={height} style={{ position: 'absolute' }}>
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={((s.x * width - t * 14 * s.s) % width + width) % width}
            cy={s.y * height}
            r={s.s}
            fill="#f4f4f3"
            opacity={s.a * (0.6 + 0.4 * Math.sin(t * 2.2 + s.p))}
          />
        ))}
      </svg>
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: `${cx}px ${cy}px` }}>
        <svg width={width} height={height}>
          <defs>
            <linearGradient id="day" gradientUnits="userSpaceOnUse" x1={x0} x2={x0 + L} y1={0} y2={0}>
              {Array.from({ length: 97 }, (_, i) => (
                <stop key={i} offset={i / 96} stopColor={dayTone((i / 96) * 24)} />
              ))}
            </linearGradient>
            <linearGradient id="light" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="tip">
              <stop offset="0" stopColor="#fff" stopOpacity=".9" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <clipPath id="band">
              <rect x={x0} y={cy - thick / 2} width={L} height={thick} rx={18 * growS} />
            </clipPath>
          </defs>
          <circle cx={cx} cy={cy} r={R * ringScale} fill="none" stroke="#26272c" strokeWidth={16} opacity={dialIn * (1 - unroll)} />
          {segs}
          {flat && <rect x={x0} y={cy - thick / 2} width={L} height={thick} rx={18 * growS} fill="url(#day)" />}
          {flat && <rect x={x0 + lightX * L - 160} y={cy - thick / 2 - 4} width={320} height={thick + 8} fill="url(#light)" clipPath="url(#band)" />}
          {ticks}
          {hand}
          <circle cx={tipX} cy={tipY} r={30} fill="url(#tip)" opacity={handOpacity * sunny * 0.8} />
          <circle cx={cx} cy={cy} r={9} fill="#f4f4f3" opacity={handOpacity} />
          <g opacity={clamp01(nowS * 3)}>
            <line x1={nowX} y1={nowY} x2={nowX} y2={cy + thick / 2} stroke="#f4f4f3" strokeWidth={4} />
            <circle cx={nowX} cy={nowY} r={10} fill="#f4f4f3" />
          </g>
        </svg>
      </AbsoluteFill>
      {/* 标题逐字弹入，「一条色带」再强调一下 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: cy + 222, display: 'flex', justifyContent: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: 66, letterSpacing: '0.06em', color: '#f4f4f3' }}>
        {[...TITLE].map((ch, i) => {
          const p = spring({ frame: f - at(T.text + i * 0.045), fps, config: { damping: 12, stiffness: 180 } })
          const stress = STRESS.has(i) ? spring({ frame: f - at(T.text + 0.75), fps, config: { damping: 7, stiffness: 160 } }) : 0
          const pulse = STRESS.has(i) ? 1 + 0.1 * Math.sin(Math.PI * clamp01(stress)) * (1 - clamp01((t - T.text - 1.1) / 0.3)) : 1
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: clamp01(p * 1.4),
                transform: `translateY(${(1 - p) * 30}px) scale(${pulse})`,
                filter: `blur(${Math.max(0, (1 - p) * 6)}px)`
              }}
            >
              {ch}
            </span>
          )
        })}
      </div>
      <div style={{ position: 'absolute', right: 72, bottom: 56, fontFamily: SERIF, fontSize: 28, letterSpacing: '0.12em', color: '#b9babd', opacity: brand, transform: `translateX(${(1 - brand) * 20}px)` }}>
        简程 · 测试版
      </div>

      {/* 音效：整点滴答越来越密 → 展开时呼啸 → 落定一声闷响 → 光扫过 */}
      {HOUR_TICKS.map((s, i) => (
        <Sequence key={i} from={at(s)} durationInFrames={at(0.2)}>
          <Audio src={staticFile('sfx/tick.wav')} volume={0.55} />
        </Sequence>
      ))}
      <Sequence from={at(T.unrollA - 0.12)} durationInFrames={at(0.9)}>
        <Audio src={staticFile('sfx/whoosh.wav')} volume={0.7} />
      </Sequence>
      <Sequence from={at(T.grow + 0.12)} durationInFrames={at(0.7)}>
        <Audio src={staticFile('sfx/thud.wav')} volume={0.9} />
      </Sequence>
      <Sequence from={at(T.sweepLight)} durationInFrames={at(0.6)}>
        <Audio src={staticFile('sfx/shimmer.wav')} volume={0.35} />
      </Sequence>
    </AbsoluteFill>
  )
}
