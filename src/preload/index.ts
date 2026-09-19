import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api } from '@shared/types'

const subscribe =
  <T>(channel: string) =>
  (cb: (payload: T) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }

const api: Api = {
  getData: () => ipcRenderer.invoke('data:get'),
  saveTask: (task) => ipcRenderer.invoke('task:save', task),
  deleteTask: (id, mode, date) => ipcRenderer.invoke('task:delete', id, mode, date),
  setCompletion: (key, done) => ipcRenderer.invoke('completion:set', key, done),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getUsage: (date) => ipcRenderer.invoke('usage:get', date),
  getSegments: (date) => ipcRenderer.invoke('segments:get', date),
  getRecentApps: () => ipcRenderer.invoke('apps:recent'),
  getAppIcon: (exe) => ipcRenderer.invoke('apps:icon', exe),
  getProgress: () => ipcRenderer.invoke('progress:get'),
  getMonitor: () => ipcRenderer.invoke('monitor:get'),
  pickPath: (kind) => ipcRenderer.invoke('path:pick', kind),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  onData: subscribe('data'),
  onProgress: subscribe('progress'),
  onMonitor: subscribe('monitor'),
  getShots: (date) => ipcRenderer.invoke('shots:list', date),
  captureNow: () => ipcRenderer.invoke('shots:capture'),
  deleteShot: (file) => ipcRenderer.invoke('shots:delete', file),
  clearShots: () => ipcRenderer.invoke('shots:clear'),
  getShotStats: () => ipcRenderer.invoke('shots:stats'),
  revealShot: (file) => ipcRenderer.invoke('shots:reveal', file),
  openShotsFolder: () => ipcRenderer.invoke('shots:openFolder'),
  getCapture: () => ipcRenderer.invoke('capture:get'),
  onCapture: subscribe('capture'),
  onShot: subscribe('shot'),
  showMain: (nav) => ipcRenderer.invoke('app:showMain', nav),
  hidePanel: () => ipcRenderer.invoke('panel:hide'),
  setCard: (patch) => ipcRenderer.invoke('card:set', patch),
  closeCard: () => ipcRenderer.invoke('card:close'),
  setTitleBarTone: (tone) => ipcRenderer.invoke('titlebar:tone', tone),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: subscribe('update'),
  getSystemFonts: () => ipcRenderer.invoke('fonts:system'),
  importFont: () => ipcRenderer.invoke('fonts:import'),
  readFont: (id) => ipcRenderer.invoke('fonts:read', id),
  removeFont: (id) => ipcRenderer.invoke('fonts:remove', id),
  getHotkeyStatus: () => ipcRenderer.invoke('hotkey:get'),
  onHotkeyStatus: subscribe('hotkey'),
  onNavigate: subscribe('navigate'),
  onPanelShown: subscribe<void>('panel:shown')
}

contextBridge.exposeInMainWorld('api', api)
