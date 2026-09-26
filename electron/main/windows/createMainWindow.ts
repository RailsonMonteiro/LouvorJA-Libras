import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import icon from '../../../build/icon.png?asset'
import { IpcChannels } from '../../../src/types/ipc'
import { devServerUrl } from '../security/trustedOrigin'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // Custom title bar rendered by the app (same look as LouvorJA).
    frame: false,
    backgroundColor: '#181722',
    title: 'LouvorJA Libras',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => win.show())

  const notifyMaximized = (): void => {
    win.webContents.send(IpcChannels.windowMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', notifyMaximized)
  win.on('unmaximize', notifyMaximized)

  if (devServerUrl) {
    traceDevLoading(win)
    // Drops what earlier runs left in the cache (see noCache in security/index.ts).
    void win.webContents.session.clearCache().finally(() => void win.loadURL(devServerUrl!))
  } else {
    void win.loadURL('app://renderer/index.html')
  }

  return win
}

/**
 * Dev only: says in the terminal how long the window takes to load and what goes wrong, so a slow
 * or blank start can be told apart (dev server, renderer crash, script error).
 */
function traceDevLoading(win: BrowserWindow): void {
  const started = Date.now()
  const since = (): string => `${((Date.now() - started) / 1000).toFixed(1)}s`
  const { webContents } = win

  webContents.once('did-start-loading', () => console.info(`[window] loading ${devServerUrl}`))
  webContents.once('dom-ready', () => console.info(`[window] dom-ready after ${since()}`))
  webContents.once('did-finish-load', () => console.info(`[window] loaded after ${since()}`))
  win.once('ready-to-show', () => console.info(`[window] shown after ${since()}`))
  webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (code !== -3)
      console.error(`[window] failed to load ${url} (${description}, main frame: ${isMainFrame})`)
  })
  webContents.on('render-process-gone', (_event, details) =>
    console.error(`[window] renderer process gone: ${details.reason}`)
  )
  // The exact network error (or HTTP status) of anything the page asked the dev server for.
  const filter = { urls: [`${new URL(devServerUrl!).origin}/*`] }
  // Chromium tries fonts from its cache first (cache miss) and cancels requests it no longer
  // needs (aborted), then goes to the server. Neither is a failure.
  const harmless = ['net::ERR_CACHE_MISS', 'net::ERR_ABORTED']
  webContents.session.webRequest.onErrorOccurred(filter, (details) => {
    if (!harmless.includes(details.error)) console.error(`[net] ${details.error} ${details.url}`)
  })
  webContents.session.webRequest.onCompleted(filter, (details) => {
    if (details.statusCode >= 400) console.error(`[net] HTTP ${details.statusCode} ${details.url}`)
  })
  webContents.on('unresponsive', () => console.warn('[window] renderer is not responding'))
  webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error(`[renderer] ${event.message}`)
  })
}
