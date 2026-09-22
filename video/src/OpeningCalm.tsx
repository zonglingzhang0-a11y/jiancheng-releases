// 开场（第一版，偏安静，留作对照）：24 小时的钟面转完一圈，留下一圈由白到暗的轨迹，再展开成简程首页那条色带
import { useMemo } from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { dayTone, NIGHT, SANS, SERIF, waitForFonts } from './theme'

const TITLE = '把一天，画成一条色带。'
const N = 576 // 圆周上取的点数：每 2.5 分钟一段
const R = 250 // 钟面半径
const L = 1560 // 展开后色带的长度
const NOW = 20.5 / 24 // 「现在」是晚上 8 点半

const ease = Easing.bezier(0.45, 0, 0.2, 1)

export function OpeningCalm(): React.JSX.Element {
  useMemo(() => waitForFonts(TITLE + '简程测试版0612182400'), [])
  const f = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const s = (sec: number): number => sec * fps
  const cx = width / 2
  const cy = height / 2 - 30

  const appear = interpolate(f, [0, s(0.6)], [0, 1], { extrapolateRight: 'clamp' })
  // 指针转完一整天，身后留下一圈轨迹
  const sweep = interpolate(f, [s(0.5), s(2.1)], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  // 圆展开成直线
  const unroll = interpolate(f, [s(2.3), s(3.7)], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  // 细环长成色带的厚度
  const grow = interpolate(f, [s(3.4), s(4.2)], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const text = interpolate(f, [s(4.3), s(4.9)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const nowIn = interpolate(f, [s(4.0), s(4.6)], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const brand = interpolate(f, [s(5.0), s(5.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const x0 = cx - L / 2
  // 时间标签等色带完全拉直了再出现，免得和还在移动的刻度打架
  const labels = interpolate(unroll, [0.85, 1], [0, 1], { extrapolateLeft: 'clamp' })
  const flat = unroll >= 0.999
  const thick = interpolate(grow, [0, 1], [16, 150])
  // 第 i 个点在「圆上」和「直线上」的位置，按展开进度插值
  const pt = (u: number): [number, number] => {
    const a = -Math.PI / 2 + u * Math.PI * 2
    const px = cx + R * Math.cos(a)
    const py = cy + R * Math.sin(a)
    return [px + (x0 + u * L - px) * unroll, py + (cy - py) * unroll]
  }

  const segs: React.JSX.Element[] = []
  const shown = flat ? 0 : Math.floor(N * sweep)
  for (let i = 0; i < shown; i++) {
    const [ax, ay] = pt(i / N)
    const [bx, by] = pt((i + 1.4) / N)
    segs.push(<line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={dayTone((i / N) * 24)} strokeWidth={thick} strokeLinecap="butt" />)
  }

  // 24 个刻度：从钟面外圈的放射线，变成色带下方的坐标刻度
  const ticks: React.JSX.Element[] = []
  for (let h = 0; h <= 24; h++) {
    const u = h / 24
    if (h === 24 && unroll < 0.5) continue
    const a = -Math.PI / 2 + u * Math.PI * 2
    const major = h % 6 === 0
    const r1 = R + 26
    const r2 = R + (major ? 46 : 36)
    const lineY = cy + thick / 2 + 14
    const p1: [number, number] = [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]
    const p2: [number, number] = [cx + r2 * Math.cos(a), cy + r2 * Math.sin(a)]
    const q1: [number, number] = [x0 + u * L, lineY]
    const q2: [number, number] = [x0 + u * L, lineY + (major ? 16 : 9)]
    const m = (p: [number, number], q: [number, number]): [number, number] => [p[0] + (q[0] - p[0]) * unroll, p[1] + (q[1] - p[1]) * unroll]
    const [ax, ay] = m(p1, q1)
    const [bx, by] = m(p2, q2)
    ticks.push(<line key={h} x1={ax} y1={ay} x2={bx} y2={by} stroke="#8a8b90" strokeWidth={major ? 3 : 2} strokeLinecap="round" opacity={appear} />)
    if (major)
      ticks.push(
        <text key={`t${h}`} x={q2[0]} y={q2[1] + 30} fill="#8a8b90" fontFamily={SANS} fontSize={22} textAnchor="middle" opacity={labels}>
          {String(h).padStart(2, '0')}
        </text>
      )
  }

  // 指针：转圈时可见，展开时淡出
  const ha = -Math.PI / 2 + sweep * Math.PI * 2
  const handOpacity = appear * (1 - unroll)
  const nowX = x0 + NOW * L

  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <svg width={width} height={height}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#2a2b30" strokeWidth={16} opacity={appear * (1 - unroll)} />
        <defs>
          {/* 拉直之后换成一整条平滑渐变，两端圆角，和首页色带一样 */}
          <linearGradient id="day" gradientUnits="userSpaceOnUse" x1={x0} x2={x0 + L} y1={0} y2={0}>
            {Array.from({ length: 97 }, (_, i) => (
              <stop key={i} offset={i / 96} stopColor={dayTone((i / 96) * 24)} />
            ))}
          </linearGradient>
        </defs>
        {segs}
        {flat && <rect x={x0} y={cy - thick / 2} width={L} height={thick} rx={18 * grow} fill="url(#day)" />}
        {ticks}
        <line x1={cx} y1={cy} x2={cx + (R - 40) * Math.cos(ha)} y2={cy + (R - 40) * Math.sin(ha)} stroke="#f4f4f3" strokeWidth={5} strokeLinecap="round" opacity={handOpacity} />
        <circle cx={cx} cy={cy} r={9} fill="#f4f4f3" opacity={handOpacity} />
        {/* 「现在」：一根竖线从上方落下 */}
        <g opacity={nowIn}>
          <line x1={nowX} y1={cy - thick / 2 - 26 + (1 - nowIn) * -60} x2={nowX} y2={cy + thick / 2} stroke="#f4f4f3" strokeWidth={4} />
          <circle cx={nowX} cy={cy - thick / 2 - 26 + (1 - nowIn) * -60} r={10} fill="#f4f4f3" />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: cy + 230,
          textAlign: 'center',
          fontFamily: SERIF,
          fontWeight: 700,
          fontSize: 64,
          letterSpacing: '0.06em',
          color: '#f4f4f3',
          opacity: text,
          transform: `translateY(${(1 - text) * 16}px)`
        }}
      >
        {TITLE}
      </div>
      <div style={{ position: 'absolute', right: 72, bottom: 56, fontFamily: SERIF, fontSize: 28, letterSpacing: '0.12em', color: '#b9babd', opacity: brand }}>
        简程 · 测试版
      </div>
    </AbsoluteFill>
  )
}
