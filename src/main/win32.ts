// Win32 原生调用：前台窗口、进程路径、空闲时间、文件描述
import { basename } from 'path'

export interface Foreground {
  exe: string
  path: string
  title: string
}

/** 物理像素坐标 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Bindings {
  foreground(): Foreground | null
  /** 前台窗口的可见边界；最小化或无窗口时返回 null */
  foregroundRect(): Rect | null
  idleMs(): number
  describe(path: string): string | null
  /** 把窗口放到所有普通窗口之下（「贴在桌面」），不激活 */
  sendToBottom(hwnd: Buffer): void
}

function load(): Bindings | null {
  if (process.platform !== 'win32') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    const version = koffi.load('version.dll')

    const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()')
    const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void* hWnd, _Out_ uint16_t* buf, int max)')
    const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* pid)')
    // 注册结构体类型，供下方函数签名引用
    koffi.struct('LASTINPUTINFO', { cbSize: 'uint32_t', dwTime: 'uint32_t' })
    const GetLastInputInfo = user32.func('bool __stdcall GetLastInputInfo(_Inout_ LASTINPUTINFO* info)')
    const GetTickCount = kernel32.func('uint32_t __stdcall GetTickCount()')
    const OpenProcess = kernel32.func('void* __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)')
    const QueryFullProcessImageNameW = kernel32.func(
      'bool __stdcall QueryFullProcessImageNameW(void* h, uint32_t flags, _Out_ uint16_t* buf, _Inout_ uint32_t* size)'
    )
    const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* h)')
    koffi.struct('RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' })
    const GetWindowRect = user32.func('bool __stdcall GetWindowRect(void* hWnd, _Out_ RECT* rect)')
    const IsIconic = user32.func('bool __stdcall IsIconic(void* hWnd)')
    // DWMWA_EXTENDED_FRAME_BOUNDS 不含 Win10/11 窗口四周不可见的缩放边框
    const dwmapi = koffi.load('dwmapi.dll')
    const DwmGetWindowAttribute = dwmapi.func('int32_t __stdcall DwmGetWindowAttribute(void* hWnd, uint32_t attr, _Out_ RECT* rect, uint32_t size)')
    const GetFileVersionInfoSizeW = version.func('uint32_t __stdcall GetFileVersionInfoSizeW(str16 path, _Out_ uint32_t* handle)')
    const GetFileVersionInfoW = version.func(
      'bool __stdcall GetFileVersionInfoW(str16 path, uint32_t handle, uint32_t len, _Out_ uint8_t* data)'
    )
    const VerQueryValueW = version.func('bool __stdcall VerQueryValueW(uint8_t* block, str16 sub, _Out_ void** buf, _Out_ uint32_t* len)')
    const SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)')

    const titleBuf = Buffer.alloc(1024)
    const pathBuf = Buffer.alloc(2048)
    const pidCache = new Map<number, { path: string; at: number }>()

    const processPath = (pid: number): string | null => {
      const cached = pidCache.get(pid)
      const now = Date.now()
      if (cached && now - cached.at < 60_000) return cached.path
      // PROCESS_QUERY_LIMITED_INFORMATION
      const h = OpenProcess(0x1000, false, pid)
      if (!h) return null
      try {
        const size = [1024]
        if (!QueryFullProcessImageNameW(h, 0, pathBuf, size)) return null
        const path = pathBuf.toString('utf16le', 0, size[0] * 2)
        pidCache.set(pid, { path, at: now })
        if (pidCache.size > 300) pidCache.clear()
        return path
      } finally {
        CloseHandle(h)
      }
    }

    return {
      foreground() {
        const hwnd = GetForegroundWindow()
        if (!hwnd) return null
        const len = GetWindowTextW(hwnd, titleBuf, 512)
        const title = titleBuf.toString('utf16le', 0, Math.max(0, len) * 2)
        const pid = [0]
        GetWindowThreadProcessId(hwnd, pid)
        if (!pid[0]) return null
        const path = processPath(pid[0])
        if (!path) return null
        return { exe: basename(path).toLowerCase(), path, title }
      },
      foregroundRect() {
        const hwnd = GetForegroundWindow()
        if (!hwnd || IsIconic(hwnd)) return null
        const r = { left: 0, top: 0, right: 0, bottom: 0 }
        if (DwmGetWindowAttribute(hwnd, 9, r, 16) !== 0 && !GetWindowRect(hwnd, r)) return null
        const w = r.right - r.left
        const h = r.bottom - r.top
        return w > 0 && h > 0 ? { x: r.left, y: r.top, w, h } : null
      },
      sendToBottom(hwnd: Buffer) {
        // HWND_BOTTOM = 1；SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
        const h = hwnd.length >= 8 ? hwnd.readBigInt64LE(0) : BigInt(hwnd.readInt32LE(0))
        SetWindowPos(h, 1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
      },
      idleMs() {
        const info = { cbSize: 8, dwTime: 0 }
        if (!GetLastInputInfo(info)) return 0
        return (GetTickCount() - info.dwTime) >>> 0
      },
      describe(path: string) {
        try {
          const size = GetFileVersionInfoSizeW(path, [0])
          if (!size) return null
          const data = Buffer.alloc(size)
          if (!GetFileVersionInfoW(path, 0, size, data)) return null
          const pairs: [number, number][] = []
          const out = [null]
          const len = [0]
          if (VerQueryValueW(data, '\\VarFileInfo\\Translation', out, len) && len[0] >= 4) {
            const arr = koffi.decode(out[0], 'uint16_t', Math.floor(len[0] / 2)) as Uint16Array
            for (let i = 0; i + 1 < arr.length; i += 2) pairs.push([arr[i], arr[i + 1]])
          }
          pairs.push([0x0804, 0x04b0], [0x0409, 0x04b0], [0x0409, 0x04e4])
          const hex = (n: number): string => n.toString(16).padStart(4, '0')
          for (const [lang, cp] of pairs) {
            const o = [null]
            const n = [0]
            const key = `\\StringFileInfo\\${hex(lang)}${hex(cp)}\\FileDescription`
            if (VerQueryValueW(data, key, o, n) && n[0] > 1) {
              const text = String(koffi.decode(o[0], 'char16_t', n[0] - 1)).replace(/\0/g, '').trim()
              if (text) return text
            }
          }
          return null
        } catch {
          return null
        }
      }
    }
  } catch (err) {
    console.error('[win32] 原生模块加载失败', err)
    return null
  }
}

export const win32 = load()
