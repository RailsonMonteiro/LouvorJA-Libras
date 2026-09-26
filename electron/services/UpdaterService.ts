import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IpcChannels, type UpdaterState } from '../../src/types/ipc'
import type { LogService } from './LogService'

const IDLE: UpdaterState = { status: 'idle', version: null, progressPercent: null, error: null }

/**
 * Wraps `electron-updater`'s `autoUpdater` (fed by the "latest*.yml" electron-builder publishes
 * alongside each GitHub release - see `publish` in electron-builder.yml) so the renderer gets a
 * plain, typed state instead of the library's own event stream. Downloads happen on their own
 * once a newer version is found; `install()` is the only thing a person has to ask for.
 */
export class UpdaterService {
  private state: UpdaterState = IDLE

  constructor(private readonly logs: LogService) {
    autoUpdater.autoDownload = true
    // We ask for a restart ourselves (install()); never behind someone's back on quit.
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }))
    autoUpdater.on('update-available', (info) =>
      this.set({ status: 'downloading', version: info.version, progressPercent: 0 })
    )
    autoUpdater.on('update-not-available', () =>
      this.set({ status: 'upToDate', version: null, progressPercent: null })
    )
    autoUpdater.on('download-progress', (progress) =>
      this.set({ progressPercent: Math.round(progress.percent) })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ status: 'downloaded', version: info.version, progressPercent: 100 })
    )
    autoUpdater.on('error', (error) => {
      this.logs.error('updater', 'Check or download failed', { error: error.message })
      this.set({ status: 'error', progressPercent: null, error: error.message })
    })
  }

  getState(): UpdaterState {
    return this.state
  }

  /** A dev run has no packaged app to update - nothing real to check against. */
  private get supported(): boolean {
    return app.isPackaged
  }

  async check(): Promise<UpdaterState> {
    if (!this.supported) return this.set({ status: 'unavailable' })
    // Already under way: let it finish instead of starting a second, overlapping one.
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.state

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      // Also reaches the 'error' event above; caught here only so a rejected promise never
      // reaches the IPC caller (handle() would otherwise turn it into a thrown renderer error).
      this.logs.error('updater', 'checkForUpdates() rejected', { error: String(error) })
    }
    return this.state
  }

  /** Quits and installs the downloaded update. Ignored unless one is actually ready. */
  install(): void {
    if (this.state.status !== 'downloaded') return
    autoUpdater.quitAndInstall()
  }

  private set(patch: Partial<UpdaterState>): UpdaterState {
    this.state = { ...this.state, ...patch }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.updaterStateChanged, this.state)
    }
    return this.state
  }
}
