// 生成应用图标、托盘图标和宣传用大图：用 Electron 按真实像素把 resources/icon-src 里的 SVG 画出来
// 用法：npm run icons            生成 resources/ 下的图标文件
//      npm run icons -- <目录>   另外把每个尺寸的 PNG 存到这个目录，方便检查
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'resources', 'icon-src')
const OUT = path.join(ROOT, 'resources')

/** 每个尺寸用哪一版：16 像素按 16 格单独画；20–24 用裁到地平线的特写；32 以上用完整画面 */
const APP = { 16: 'crop16', 20: 'crop', 24: 'crop', 32: 'night', 40: 'night', 48: 'night', 64: 'night', 96: 'night', 128: 'night', 256: 'night' }
const TRAY_LIGHT = { 16: 'glyph-light16', 20: 'glyph-light', 24: 'glyph-light', 32: 'glyph-light', 40: 'glyph-light', 48: 'glyph-light' }
const TRAY_DARK = { 16: 'glyph-dark16', 20: 'glyph-dark', 24: 'glyph-dark', 32: 'glyph-dark', 40: 'glyph-dark', 48: 'glyph-dark' }

/** 把几张 PNG 装进一个 .ico（Vista 起支持 PNG 格式的图标项） */
function ico(entries) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach(({ size, png }, i) => {
    const o = i * 16
    dir[o] = size >= 256 ? 0 : size
    dir[o + 1] = size >= 256 ? 0 : size
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([head, dir, ...entries.map((e) => e.png)])
}

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.whenReady().then(async () => {
  const preview = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs') && a !== '.')
  const win = new BrowserWindow({ show: false, width: 300, height: 300, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<canvas></canvas>')
  const svgs = Object.fromEntries(fs.readdirSync(SRC).filter((f) => f.endsWith('.svg')).map((f) => [f.slice(0, -4), fs.readFileSync(path.join(SRC, f), 'utf8')]))
  /** 在页面里把 SVG 画到 size×size 的画布上，取回 PNG */
  const render = async (name, size) => {
    const url = await win.webContents.executeJavaScript(`new Promise((ok, fail) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = c.height = ${size}
        const g = c.getContext('2d')
        g.imageSmoothingQuality = 'high'
        g.drawImage(img, 0, 0, ${size}, ${size})
        ok(c.toDataURL('image/png'))
      }
      img.onerror = () => fail(new Error('无法解析 ${name}.svg'))
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svgs[name]).toString('base64'))}
    })`)
    return Buffer.from(url.split(',')[1], 'base64')
  }
  const build = async (map, file) => {
    const entries = []
    for (const [size, name] of Object.entries(map)) {
      const png = await render(name, Number(size))
      entries.push({ size: Number(size), png })
      if (preview) fs.writeFileSync(path.join(preview, `${path.basename(file, '.ico')}-${size}.png`), png)
    }
    fs.writeFileSync(path.join(OUT, file), ico(entries))
    console.log('✓', file, Object.keys(map).join(' / '))
  }

  if (preview) fs.mkdirSync(preview, { recursive: true })
  await build(APP, 'icon.ico')
  await build(TRAY_LIGHT, 'tray-light.ico')
  await build(TRAY_DARK, 'tray-dark.ico')
  // 窗口图标和安装包用的大图
  fs.writeFileSync(path.join(OUT, 'icon.png'), await render('night', 512))
  console.log('✓ icon.png 512')
  // 视频和宣传图用：黄昏（长庚）与清晨（启明）两张大图
  const promo = path.join(ROOT, 'video', 'public')
  fs.mkdirSync(promo, { recursive: true })
  fs.writeFileSync(path.join(promo, 'icon-dusk.png'), await render('night', 1024))
  fs.writeFileSync(path.join(promo, 'icon-dawn.png'), await render('dawn', 1024))
  console.log('✓ video/public/icon-dusk.png、icon-dawn.png 1024')
  if (preview) {
    for (const n of ['night', 'dawn']) fs.writeFileSync(path.join(preview, `${n}-256.png`), await render(n, 256))
  }
  app.quit()
})
