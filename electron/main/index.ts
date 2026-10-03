import { arch, release, type as osType, version as osVersion } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, type Tray } from 'electron'
import { SignCache } from '../services/avatar/SignCache'
import { openDatabase } from '../services/DatabaseService'
import { LogService } from '../services/LogService'
import { SettingsService } from '../services/SettingsService'
import { UpdaterService } from '../services/UpdaterService'
import { LibrasService } from '../services/libras/LibrasService'
import { LouvorJAService } from '../services/louvorja/LouvorJAService'
import { registerIpc } from './ipc'
import { registerAvatarIpc } from './ipc/avatar'
import { registerLibrasIpc } from './ipc/libras'
import { registerLouvorJAIpc } from './ipc/louvorja'
import { registerOverlayIpc } from './ipc/overlay'
import { registerUpdaterIpc } from './ipc/updater'
import { installAppMenu } from './menus/appMenu'
import { handleAppProtocol, registerAppScheme } from './protocol'
import { applySecurity } from './security'
import { devServerUrl, rendererDir } from './security/trustedOrigin'
import { createMainWindow } from './windows/createMainWindow'
import { createTray, notifyHiddenToTray } from './windows/createTray'
import { OverlayController } from './windows/OverlayController'

// Must happen before the app is ready.
registerAppScheme()

// Lets end-to-end tests run against an isolated profile.
if (process.env['LOUVORJA_USER_DATA']) app.setPath('userData', process.env['LOUVORJA_USER_DATA'])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    applySecurity()

    const db = openDatabase(join(app.getPath('userData'), 'louvorja-libras.db'))
    const logs = new LogService(db)
    const settings = new SettingsService(db)

    // "Executar em segundo plano" is still being tested (its switch in Configurações is locked
    // off) - this undoes it too, in case an earlier build already saved it as on for this profile.
    if (settings.getAll().runInBackground) settings.set('runInBackground', false)

    logs.prune()
    logs.info('app', `Started LouvorJA Libras ${app.getVersion()}`)
    // One line of OS/locale context per launch - the "Token recusado"/"não conecta" reports
    // this session has chased so far all trace back to specific Windows editions and regional
    // settings (see docs/protocolo-louvorja.md); without this, a report has no way to confirm
    // or rule out a pattern across machines.
    logs.info('app', 'Environment', {
      platform: process.platform,
      arch: arch(),
      osType: osType(),
      osRelease: release(),
      osVersion: osVersion(),
      locale: app.getLocale(),
      systemLocale: app.getSystemLocale()
    })

    const signs = new SignCache({
      dir: join(app.getPath('userData'), 'signs'),
      dictionaryUrl: () => settings.getAll().dictionaryUrl
    })
    handleAppProtocol({ rendererDir, serveInterface: !devServerUrl, signs })

    const louvorja = new LouvorJAService({ db, logs })
    louvorja.prune()

    const libras = new LibrasService({ db, logs, settings: () => settings.getAll() })
    libras.prune()

    registerIpc({
      settings,
      logs,
      onSettingsChanged: (updated) => syncTray(updated.runInBackground)
    })
    registerLibrasIpc(libras)
    registerAvatarIpc(signs)
    registerLouvorJAIpc(louvorja)
    const overlay = new OverlayController()
    registerOverlayIpc(overlay)
    const updater = new UpdaterService(logs)
    registerUpdaterIpc(updater)
    installAppMenu()

    // "X" on the window only hides it - see wireWindow below - so the app otherwise never really
    // quits on its own; before-quit (the tray's "Sair", Cmd+Q, the OS shutting down, ...) is the
    // one signal that says a close should go through for real this time.
    let isQuitting = false
    app.on('before-quit', () => {
      isQuitting = true
    })

    let mainWindow = createMainWindow()
    let hiddenToTrayOnce = false
    let tray: Tray | null = null

    // Follows the "Executar em segundo plano" setting (Configurações): shows or removes the tray
    // icon to match, right away if it is flipped while the app is running.
    function syncTray(enabled: boolean): void {
      if (enabled && !tray) {
        tray = createTray(() => mainWindow, settings.getAll().locale)
      } else if (!enabled && tray) {
        tray.destroy()
        tray = null
      }
    }
    syncTray(settings.getAll().runInBackground)

    // The overlay has no reason to outlive the main window (and would keep the app running).
    // With "Executar em segundo plano" on, closing the window (or Alt+F4) leaves the app running
    // in the tray instead of quitting it - the tray icon is otherwise the only trace it is still
    // there. With it off, closing behaves like any other app: it quits.
    function wireWindow(win: BrowserWindow): void {
      win.on('closed', () => overlay.close())
      win.on('close', (event) => {
        if (isQuitting || !settings.getAll().runInBackground) return
        event.preventDefault()
        win.hide()
        if (!hiddenToTrayOnce) {
          hiddenToTrayOnce = true
          notifyHiddenToTray(settings.getAll().locale)
        }
      })
    }
    wireWindow(mainWindow)

    const { overlayAutoOpen, overlayDisplayId } = settings.getAll()
    if (overlayAutoOpen) mainWindow.once('ready-to-show', () => overlay.open(overlayDisplayId))

    if (settings.getAll().autoConnect) louvorja.connectToLast()

    // Silent: only "Sobre" shows anything, there is no popup or forced restart.
    void updater.check()

    app.on('second-instance', () => {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
        wireWindow(mainWindow)
      } else {
        mainWindow.show()
      }
    })

    app.on('will-quit', () => {
      tray?.destroy()
      louvorja.dispose()
      db.close()
    })
  })

  // Only reached now if a window is destroyed for real (the tray's "Sair", or before-quit) - the
  // "X" button no longer closes windows, it hides them (see wireWindow in whenReady above).
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
