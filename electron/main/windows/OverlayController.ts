import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { IpcChannels, type OverlayCommand, type OverlayState } from '../../../src/types/ipc'
import { devServerUrl } from '../security/trustedOrigin'
import { describeDisplays, pickScreen } from './displays'

/**
 * How often the overlay is put back on top. On Windows every "always on top" window shares one
 * layer, and the one used last is in front: the presentation window (also on top, and clicked
 * by whoever runs the service) would otherwise end up over the avatar.
 */
const RAISE_EVERY_MS = 400

/** How long the numbers stay on the screens when the person asks to identify them. */
const IDENTIFY_MS = 3_000
/** The square of the number and how far it is from the corner of the screen, in pixels. */
const IDENTIFY_SIZE = 128
const IDENTIFY_MARGIN = 24

/** The overlay is the same interface, on this route: only the avatar, on a transparent page. */
const OVERLAY_ROUTE = '#/overlay'

/**
 * The transparent window that puts the avatar over the presentation. It covers a whole screen,
 * stays above everything (fullscreen programs included), and lets every click through, so the
 * presentation underneath keeps working.
 */
export class OverlayController {
  private window: BrowserWindow | null = null
  /** The screen the overlay is on now, and the one it was asked for (it may not exist for a while). */
  private displayId: number | null = null
  private requestedId: number | null = null
  private identifyWindows: BrowserWindow[] = []
  private identifyTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    // Screens come and go (a projector is plugged in, a cable is pulled).
    const changed = (): void => this.onDisplaysChanged()
    screen.on('display-added', changed)
    screen.on('display-removed', changed)
    screen.on('display-metrics-changed', changed)
  }

  getState(): OverlayState {
    return {
      open: this.window !== null && !this.window.isDestroyed(),
      displayId: this.window ? this.displayId : null,
      displays: describeDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id)
    }
  }

  open(requestedId: number | null): OverlayState {
    const target = pickScreen(screen.getAllDisplays(), screen.getPrimaryDisplay().id, requestedId)
    if (!target) return this.getState()
    this.displayId = target.id
    this.requestedId = requestedId

    if (this.window && !this.window.isDestroyed()) {
      this.window.setBounds(target.bounds)
    } else {
      this.window = this.create(target.bounds)
    }
    this.broadcast()
    return this.getState()
  }

  close(): OverlayState {
    const win = this.window
    this.window = null
    this.displayId = null
    if (win && !win.isDestroyed()) win.close()
    this.broadcast()
    return this.getState()
  }

  /**
   * Shows the number of every screen (the one the list of screens uses) for a few seconds, the way
   * the "Identify" button of the Windows display settings does: a dark rounded square with a big
   * white digit, in the lower left corner of each screen.
   */
  identify(): void {
    this.clearIdentify()

    screen.getAllDisplays().forEach((display, index) => {
      const win = new BrowserWindow({
        x: display.workArea.x + IDENTIFY_MARGIN,
        y: display.workArea.y + display.workArea.height - IDENTIFY_SIZE - IDENTIFY_MARGIN,
        width: IDENTIFY_SIZE,
        height: IDENTIFY_SIZE,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        focusable: false
      })
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setIgnoreMouseEvents(true)
      win.once('ready-to-show', () => win.showInactive())
      void win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(identifyPage(index + 1))}`
      )
      this.identifyWindows.push(win)
    })

    this.identifyTimer = setTimeout(() => this.clearIdentify(), IDENTIFY_MS)
  }

  private clearIdentify(): void {
    if (this.identifyTimer) clearTimeout(this.identifyTimer)
    this.identifyTimer = null
    for (const win of this.identifyWindows) if (!win.isDestroyed()) win.destroy()
    this.identifyWindows = []
  }

  /** Forwards a command from the projection page to the overlay, if it is open. */
  command(command: OverlayCommand): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IpcChannels.overlayCommandEvent, command)
    }
  }

  private create(bounds: Electron.Rectangle): BrowserWindow {
    const win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Never takes the keyboard from the presentation.
      focusable: false,
      title: 'LouvorJA Libras - Overlay',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })

    // Above fullscreen windows too, and invisible to the mouse.
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // The opening screen in index.html belongs to the main window; this one must stay clear.
    win.webContents.on('dom-ready', () => {
      void win.webContents.insertCSS('#splash { display: none !important; }')
    })

    // Windows limits a new window to the work area (the screen without the taskbar); asking again
    // once it exists gives it the whole screen.
    win.setBounds(bounds)
    win.once('ready-to-show', () => {
      win.setBounds(bounds)
      win.showInactive()
    })
    // Raising does not activate the window, so the presentation keeps the keyboard.
    const raise = setInterval(() => {
      if (!win.isDestroyed() && win.isVisible()) win.moveTop()
    }, RAISE_EVERY_MS)
    win.on('closed', () => {
      clearInterval(raise)
      if (this.window === win) {
        this.window = null
        this.displayId = null
        this.broadcast()
      }
    })

    const base = devServerUrl ?? 'app://renderer/index.html'
    void win.loadURL(`${base}${OVERLAY_ROUTE}`)
    return win
  }

  private onDisplaysChanged(): void {
    if (this.window && !this.window.isDestroyed()) {
      // Moves to the automatic choice when the screen it was on is gone, and goes back to the screen that was asked for as soon as it is there again.
      const target = pickScreen(
        screen.getAllDisplays(),
        screen.getPrimaryDisplay().id,
        this.requestedId
      )
      if (target) {
        this.displayId = target.id
        this.window.setBounds(target.bounds)
      }
    }
    this.broadcast()
  }

  private broadcast(): void {
    const state = this.getState()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.overlayStateChanged, state)
    }
  }
}

/** The page of an identification window: the screen's number, big and white, on a dark square. */
function identifyPage(number: number): string {
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;background:transparent;overflow:hidden">
<div style="box-sizing:border-box;width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(20,20,20,0.86);border:1px solid rgba(255,255,255,0.14);color:#fff;font:600 84px/1 'Segoe UI Variable Display','Segoe UI',Roboto,sans-serif;animation:in 0.18s ease-out">${number}</div>
<style>@keyframes in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:none}}</style></body>`
}
