// 测试版与正式版分开：开发模式（npm run dev）和带预发布号的版本（如 1.1.0-beta.1）都算测试版。
// 测试版用自己的数据文件夹和单实例锁，可以和正式版同时开着，不会碰到正式版里的真实日程。
import { app } from 'electron'

export const IS_TEST = !app.isPackaged || app.getVersion().includes('-')

/** 窗口标题、托盘、通知里显示的名字 */
export const APP_NAME = IS_TEST ? '简程 测试版' : '简程'

/** %APPDATA% 下的数据文件夹 */
export const DATA_DIR = IS_TEST ? 'Jiancheng-Test' : 'Jiancheng'

/** Windows 通知与任务栏分组用的 AppUserModelId，和 electron-builder 里的 appId 对应 */
export const APP_ID = IS_TEST ? 'com.zzl.tempo.test' : 'com.zzl.tempo'
