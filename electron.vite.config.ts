import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

/** fontsource 的样式同时引用 woff2 和 woff；Chromium 只用 woff2，去掉 woff 能让安装包小一半字体体积 */
export function woff2Only(): Plugin {
  return {
    name: 'woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/@fontsource(-variable)?[\\/].*\.css$/.test(id)) return null
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '')
    }
  }
}

// 开发模式（serve）和带预发布号的版本都是测试版，标题栏显示「测试版」
export default defineConfig(({ command }) => ({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: shared },
    build: { externalizeDeps: true }
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      IS_TEST_BUILD: JSON.stringify(command === 'serve' || pkg.version.includes('-'))
    },
    plugins: [woff2Only(), react()]
  }
}))
