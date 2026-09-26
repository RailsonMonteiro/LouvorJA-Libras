import { app, BrowserWindow } from 'electron'
import { z } from 'zod'
import { IpcChannels, WINDOW_ACTIONS, type AppInfo } from '../../../src/types/ipc'
import type { AppSettings } from '../../../src/types/settings'
import type { LogService } from '../../services/LogService'
import { isSettingKey, settingSchemas, type SettingsService } from '../../services/SettingsService'
import { handle } from './handle'

interface IpcContext {
  settings: SettingsService
  logs: LogService
  /** Told about every change, so main-process-only reactions (the tray) can follow along too. */
  onSettingsChanged?: (updated: AppSettings) => void
}

const setSettingSchema = z
  .object({ key: z.string(), value: z.unknown() })
  .transform((input, ctx) => {
    if (!isSettingKey(input.key)) {
      ctx.addIssue({ code: 'custom', message: `Unknown setting "${input.key}"` })
      return z.NEVER
    }
    const value = settingSchemas[input.key].safeParse(input.value)
    if (!value.success) {
      ctx.addIssue({ code: 'custom', message: `Invalid value for setting "${input.key}"` })
      return z.NEVER
    }
    return { key: input.key, value: value.data }
  })

export function registerIpc({ settings, logs, onSettingsChanged }: IpcContext): void {
  handle(IpcChannels.appGetInfo, z.undefined(), (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    dataPath: app.getPath('userData')
  }))

  handle(IpcChannels.settingsGetAll, z.undefined(), () => settings.getAll())

  handle(IpcChannels.settingsSet, setSettingSchema, ({ key, value }) => {
    logs.info('settings', `Changed "${key}"`, { value })
    const updated = settings.set(key, value as never)
    // Every window (the overlay too) follows the same settings.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.settingsChanged, updated)
    }
    onSettingsChanged?.(updated)
    return updated
  })

  handle(IpcChannels.windowControl, z.enum(WINDOW_ACTIONS), (action, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    switch (action) {
      case 'minimize':
        win.minimize()
        break
      case 'maximize':
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
        break
      case 'close':
        win.close()
        break
    }
    return win.isMaximized()
  })
}
