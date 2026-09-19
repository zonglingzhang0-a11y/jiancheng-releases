// 仅用于在浏览器中预览界面（使用模拟数据），正式运行请使用 `npm run dev`
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { woff2Only } from './electron.vite.config'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [woff2Only(), react()],
  server: { port: 5199 }
})
