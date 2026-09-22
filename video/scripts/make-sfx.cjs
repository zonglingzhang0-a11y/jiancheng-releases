// 用代码合成开场要用的几个短音效（不依赖任何素材，没有版权问题）
// 用法：node scripts/make-sfx.cjs → public/sfx/*.wav
const fs = require('fs')
const path = require('path')

const RATE = 44100
const out = path.join(__dirname, '..', 'public', 'sfx')
fs.mkdirSync(out, { recursive: true })

// 固定种子的噪声，每次生成的声音都一样
let seed = 7
const noise = () => {
  seed = (seed * 16807) % 2147483647
  return (seed / 2147483647) * 2 - 1
}

function wav(name, seconds, fn) {
  const n = Math.round(seconds * RATE)
  const data = Buffer.alloc(n * 2)
  let peak = 0
  const buf = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    buf[i] = fn(i / RATE, i)
    peak = Math.max(peak, Math.abs(buf[i]))
  }
  const k = peak > 0 ? 0.89 / peak : 1
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(buf[i] * k * 32767), i * 2)
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  fs.writeFileSync(path.join(out, name), Buffer.concat([head, data]))
  console.log(name, `${seconds}s`)
}

// 滴答：很短的木质敲击声，高频正弦 + 一点噪声，快速衰减
wav('tick.wav', 0.06, (t) => {
  const env = Math.exp(-t * 90)
  return env * (Math.sin(2 * Math.PI * 2600 * t) * 0.6 + Math.sin(2 * Math.PI * 1300 * t) * 0.3 + noise() * 0.25)
})

// 呼啸：噪声经过一个截止频率先升后降的低通，音量先起后落
{
  let y = 0
  wav('whoosh.wav', 0.75, (t) => {
    const x = t / 0.75
    const cutoff = 0.02 + 0.28 * Math.sin(Math.PI * Math.min(1, x * 1.15))
    y += cutoff * (noise() - y)
    const env = Math.sin(Math.PI * Math.min(1, x)) ** 1.6
    return y * env
  })
}

// 闷响：低频正弦，音高从 90Hz 往下掉，带一点起音的「噗」
{
  let phase = 0
  wav('thud.wav', 0.6, (t) => {
    const f = 48 + 42 * Math.exp(-t * 14)
    phase += (2 * Math.PI * f) / RATE
    const body = Math.sin(phase) * Math.exp(-t * 7)
    const click = noise() * Math.exp(-t * 180) * 0.35
    return body + click
  })
}

// 亮光扫过：轻微的高频「嘶」声
{
  let y = 0
  wav('shimmer.wav', 0.5, (t) => {
    const x = t / 0.5
    y += 0.5 * (noise() - y)
    const hp = noise() - y
    return hp * Math.sin(Math.PI * x) ** 2 * 0.5
  })
}
