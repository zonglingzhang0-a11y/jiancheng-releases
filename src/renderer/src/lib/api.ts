import type { Api } from '@shared/types'

declare global {
  interface Window {
    api: Api
  }
}

export const isMock = (): boolean => !!window.api?.__mock

/** 在浏览器中预览时注入模拟 API */
export async function ensureApi(): Promise<void> {
  if (window.api) return
  const { createMockApi } = await import('./mockApi')
  window.api = createMockApi()
}

export const api = (): Api => window.api
