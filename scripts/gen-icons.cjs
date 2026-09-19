// 生成应用图标与托盘图标（纯 Node 实现，无第三方依赖）
// 用法：node scripts/gen-icons.cjs
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const sdRoundRect = (px, py, x, y, w, h, r) => {
  const cx = x + w / 2
  const cy = y + h / 2
  const qx = Math.abs(px - cx) - w / 2 + r
  const qy = Math.abs(py - cy) - h / 2 + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}
// eslint-disable-next-line no-unused-vars
const sdSegment = (px, py, ax, ay, bx, by) => {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h)
}

/**
 * 在 24×24 设计坐标系中绘制，pad 为四周留白（设计单位）
 * 2.0 图标：墨色底，一条白天近白、夜里浅灰的色带，竖线是「现在」，上方一颗漂浮的待办
 */
function render(size, { pad = 0, radius = 7 } = {}) {
  const buf = Buffer.alloc(size * size * 4)
  const SS = 4
  const span = 24 + pad * 2
  const INK = [0x17, 0x18, 0x1b]
  const small = size <= 32
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * span - pad
          const v = ((y + (sy + 0.5) / SS) / size) * span - pad
          if (sdRoundRect(u, v, 0, 0, 24, 24, radius) > 0) continue
          let c = INK
          // 色带：左边白天近白，右边入夜变浅灰
          const band = small ? sdRoundRect(u, v, 3, 10, 18, 6, 2.2) : sdRoundRect(u, v, 3.2, 10.4, 17.6, 5.2, 2)
          if (band <= 0) {
            const t = Math.max(0, Math.min(1, (u - 13) / 5))
            const lv = 250 - t * 40
            c = [lv, lv, lv - 1]
            // 贴在色带上的日程块
            if (sdRoundRect(u, v, small ? 9 : 9.4, small ? 11.6 : 11.7, small ? 5.5 : 4.6, small ? 2.8 : 2.6, small ? 1 : 0.9) <= 0) c = [120, 124, 132]
          }
          // 漂浮的待办
          if (Math.hypot(u - (small ? 7.5 : 8), v - (small ? 6.2 : 6.9)) <= (small ? 2.1 : 1.7)) c = [250, 250, 249]
          if (!small && Math.hypot(u - 16.6, v - 18.6) <= 1.3) c = [150, 154, 162]
          r += c[0]
          g += c[1]
          b += c[2]
          a += 1
        }
      }
      const i = (y * size + x) * 4
      const n = SS * SS
      if (a) {
        buf[i] = Math.round(r / a)
        buf[i + 1] = Math.round(g / a)
        buf[i + 2] = Math.round(b / a)
      }
      buf[i + 3] = Math.round((a / n) * 255)
    }
  }
  return png(size, buf)
}

const out = path.join(__dirname, '..', 'resources')
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'icon.png'), render(512, { pad: 1.7, radius: 6 }))
fs.writeFileSync(path.join(out, 'tray.png'), render(16, { radius: 5.5 }))
fs.writeFileSync(path.join(out, 'tray@2x.png'), render(32, { radius: 5.5 }))
console.log('icons written to', out)
