import { createRoot } from 'react-dom/client'
import { MotionGlobalConfig } from 'motion/react'
// 随应用提供的基础字体：界面、时钟、时间数字
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/fredoka/wght.css'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/caveat/600.css'
import '@fontsource/monoton/400.css'
import './styles/tokens.css'
import './styles/components.css'
import './styles/legacy.css'
import './styles/app.css'
import { App } from './App'
import { ensureApi } from './lib/api'
import { installRipple } from './lib/fx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PanelApp } from './mini/PanelApp'
import { CardApp } from './mini/CardApp'

// 截图/调试用：?noanim 关闭所有动画
if (location.search.includes('noanim')) {
  MotionGlobalConfig.skipAnimations = true
  document.documentElement.classList.add('noanim')
}

// 同一套界面代码按地址区分窗口：#/panel 快捷面板，#/card 桌角卡片
const route = location.hash.replace(/^#\/?/, '')
if (route === 'panel' || route === 'card') document.documentElement.classList.add('route-mini', `route-${route}`)

installRipple()

ensureApi().then(() => {
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>{route === 'panel' ? <PanelApp /> : route === 'card' ? <CardApp /> : <App />}</ErrorBoundary>
  )
})
