import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { startMockServer, type MockServer } from '../../scripts/mock-louvorja/server.mts'
import { connectThroughUi, createAppSession } from './helpers'

const session = createAppSession()

// The official player is downloaded by `npm run player:fetch` and is not part of the repository.
const playerInstalled = existsSync(resolve(__dirname, '../../public/vlibras/unity/index.html'))

let louvorja: MockServer | null = null

test.beforeEach(session.setup)
test.afterEach(async () => {
  await session.teardown()
  await louvorja?.close()
  louvorja = null
})

const OVERLAY_ROUTE = '#/overlay'

/** What the main process knows of the overlay window, or null when there is none. */
function overlayWindow(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow, screen }, route) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith(route))
    if (!win || win.isDestroyed()) return null
    const display = screen.getDisplayMatching(win.getBounds())
    return {
      bounds: win.getBounds(),
      displayBounds: display.bounds,
      alwaysOnTop: win.isAlwaysOnTop(),
      focusable: win.isFocusable(),
      visible: win.isVisible(),
      resizable: win.isResizable()
    }
  }, OVERLAY_ROUTE)
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Fractional display scaling (125%, 150%) makes Windows round the window up by a pixel or two. */
const coversScreen = (window: Rect, screen: Rect): boolean =>
  Math.abs(window.x - screen.x) <= 2 &&
  Math.abs(window.y - screen.y) <= 2 &&
  Math.abs(window.width - screen.width) <= 2 &&
  Math.abs(window.height - screen.height) <= 2

async function overlayPage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((w) => w.url().includes('#/overlay'))).toBe(true)
  return app.windows().find((w) => w.url().includes('#/overlay'))!
}

/** The overlay controls live on the Settings page, under the "Overlay" tab. */
async function openOverlaySettings(app: ElectronApplication): Promise<Page> {
  const page = (await app.firstWindow()) as Page
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-tab-overlay').click()
  return page
}

test('opens a transparent, click-through window that covers a whole screen, above everything', async () => {
  const app = await session.launch()
  const page = await openOverlaySettings(app)
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'false')
  expect(await overlayWindow(app)).toBeNull()

  await page.getByTestId('overlay-open').click()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'true')

  // The window exists at once; it knows its address a moment later.
  await expect.poll(() => overlayWindow(app)).not.toBeNull()
  const win = await overlayWindow(app)
  expect(coversScreen(win!.bounds, win!.displayBounds)).toBe(true)
  expect(win!.alwaysOnTop).toBe(true)
  expect(win!.focusable).toBe(false) // never takes the keyboard from the presentation
  expect(win!.resizable).toBe(false)

  // The overlay page is only the avatar layer, on a transparent page: no menu, no title bar.
  const overlay = await overlayPage(app)
  await expect(overlay.getByTestId('overlay-root')).toBeAttached()
  await expect(overlay.getByTestId('nav-home')).toHaveCount(0)
  await expect(overlay.getByTestId('titlebar')).toHaveCount(0)
  const background = await overlay.evaluate<string>(
    "getComputedStyle(document.body).backgroundColor + '|' + getComputedStyle(document.documentElement).backgroundColor"
  )
  expect(background).toMatch(/^rgba\(0, 0, 0, 0\)\|rgba\(0, 0, 0, 0\)$/)
})

test('closes from the page, and closing the main window takes the overlay with it', async () => {
  const app = await session.launch()
  const page = await openOverlaySettings(app)

  await page.getByTestId('overlay-open').click()
  await expect(page.getByTestId('overlay-close')).toBeVisible()
  await page.getByTestId('overlay-close').click()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'false')
  expect(await overlayWindow(app)).toBeNull()

  // Opened again and then the app closed: nothing is left running.
  await page.getByTestId('overlay-open').click()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'true')
  const closed = new Promise((done) => app.process().once('exit', done))
  await page.evaluate("window.louvorja.window.control('close')")
  await closed
})

test('opens by itself at the next start when asked to', async () => {
  const first = await session.launch()
  const page = await openOverlaySettings(first)
  await page.getByTestId('overlay-auto-open').locator('input').check()
  await expect(page.getByTestId('overlay-auto-open').locator('input')).toBeChecked()
  await first.close()

  const second = await session.launch()
  await expect.poll(() => overlayWindow(second)).not.toBeNull()
  const reopened = await openOverlaySettings(second)
  await expect(reopened.getByTestId('overlay-status')).toHaveAttribute('data-open', 'true')
})

test('lists the screens, remembers the choice and the overlay follows it', async () => {
  const app = await session.launch()
  const page = await openOverlaySettings(app)
  await page.getByTestId('overlay-open').click()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'true')

  const screens = await app.evaluate(({ screen }) =>
    screen.getAllDisplays().map((display) => display.id)
  )
  // "Automatic" plus one tile per screen.
  const tiles = page.getByTestId('overlay-display').getByRole('radio')
  await expect(tiles).toHaveCount(screens.length + 1)
  await tiles.last().click()
  await expect(tiles.last()).toHaveAttribute('aria-checked', 'true')

  await expect
    .poll(async () => {
      const win = await overlayWindow(app)
      return win ? coversScreen(win.bounds, win.displayBounds) : false
    })
    .toBe(true)
})

test('follows the position and size chosen in the main window', async () => {
  test.skip(!playerInstalled, 'the avatar player is not installed')
  test.setTimeout(120_000)

  const app = await session.launch()
  const page = await openOverlaySettings(app)
  await page.getByTestId('overlay-open').click()
  const overlay = await overlayPage(app)
  await expect(overlay.getByTestId('avatar-layer')).toBeAttached({ timeout: 60_000 })

  // Position and size are relative to the whole screen here, as the preview is to its stage.
  const screen = (await overlayWindow(app))!.bounds
  const layer = overlay.getByTestId('avatar-layer')
  await expect
    .poll(async () => (await layer.boundingBox())?.height ?? 0, { timeout: 30_000 })
    .toBeCloseTo(screen.height * 0.9, -1)
  const right = (await layer.boundingBox())!
  expect(right.x + right.width).toBeGreaterThan(screen.width * 0.9)

  // The avatar's position is chosen on the Projection page, not here.
  await page.getByTestId('nav-projection').click()
  await page.getByTestId('avatar-position').getByRole('radio', { name: 'Esquerda' }).click()
  await expect
    .poll(async () => (await layer.boundingBox())?.x ?? 9999)
    .toBeLessThan(screen.width * 0.1)
})

/** Titles of the visible windows of this app, from the front one to the back one (Windows only). */
function windowsFrontToBack(): string[] {
  const script = resolve(__dirname, 'zorder.ps1')
  return execFileSync('powershell', ['-NoProfile', '-File', script], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
}

test('stays in front of another window that is always on top, like the presentation', async () => {
  test.skip(process.platform !== 'win32', 'the stacking order is read with the Windows API')

  const app = await session.launch()
  const page = await openOverlaySettings(app)
  await page.getByTestId('overlay-open').click()
  await expect.poll(() => overlayWindow(app)).not.toBeNull()

  // The presentation window: always on top too, and clicked (activated) after the overlay opened.
  await app.evaluate(({ BrowserWindow }) => {
    const presentation = new BrowserWindow({ title: 'COMPETITOR', width: 800, height: 500 })
    presentation.setAlwaysOnTop(true, 'screen-saver')
    presentation.show()
    presentation.focus()
  })

  await expect
    .poll(() => {
      const order = windowsFrontToBack()
      const overlay = order.findIndex((title) => title.startsWith('LouvorJA Libras - Overlay'))
      const presentation = order.findIndex((title) => title.startsWith('COMPETITOR'))
      return overlay >= 0 && presentation >= 0 && overlay < presentation
    })
    .toBe(true)
})

test('stays open but shows the avatar only during the presentation, unless asked to always show it', async () => {
  const app = await session.launch()
  const page = await openOverlaySettings(app)
  await page.getByTestId('overlay-open').click()
  const overlay = await overlayPage(app)
  const root = overlay.getByTestId('overlay-root')

  // No presentation: the window is there, the avatar is not seen.
  await expect(page.getByTestId('overlay-only-during-presentation').locator('input')).toBeChecked()
  await expect(root).toHaveAttribute('data-visible', 'false')
  await expect(root).toHaveCSS('opacity', '0')
  expect(await overlayWindow(app)).not.toBeNull()

  // "Always show": the setting reaches the overlay window at once.
  await page.getByTestId('overlay-only-during-presentation').locator('input').uncheck()
  await expect(root).toHaveAttribute('data-visible', 'true')
  await expect(root).toHaveCSS('opacity', '1')

  await page.getByTestId('overlay-only-during-presentation').locator('input').check()
  await expect(root).toHaveAttribute('data-visible', 'false')
})

test('appears with the first text of the presentation and goes away after the last one', async () => {
  louvorja = await startMockServer()
  louvorja.playSong(['GLÓRIA A DEUS', 'AMÉM'])

  const app = await session.launch()
  const page = await openOverlaySettings(app)
  await page.getByTestId('overlay-open').click()
  const overlay = await overlayPage(app)
  const root = overlay.getByTestId('overlay-root')
  await expect(root).toHaveAttribute('data-visible', 'false')

  // The first text arrives: the avatar is there and stays for the whole presentation.
  await connectThroughUi(page, louvorja)
  await expect(page.getByTestId('connection-state')).toHaveText('Conectado')
  await expect(root).toHaveAttribute('data-visible', 'true')

  louvorja.nextSlide()
  await page.waitForTimeout(2500) // longer than the pause before it hides
  await expect(root).toHaveAttribute('data-visible', 'true')

  // The presentation ends: it goes away.
  louvorja.stopSong()
  await expect(root).toHaveAttribute('data-visible', 'false', { timeout: 15_000 })
})

test('remembers the overlay choice when navigating away and back', async () => {
  const app = await session.launch()
  const page = await openOverlaySettings(app)

  await expect(page.getByTestId('overlay-display')).toBeVisible()
  await expect(page.getByTestId('overlay-only-during-presentation').locator('input')).toBeChecked()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'false')

  await page.getByTestId('overlay-auto-open').locator('input').check()
  await page.getByTestId('overlay-open').click()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'true')
  await expect.poll(() => overlayWindow(app)).not.toBeNull()

  // Leaving the tab (and the page) and coming back keeps the same state.
  await page.getByTestId('nav-projection').click()
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-tab-overlay').click()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('overlay-auto-open').locator('input')).toBeChecked()

  await page.getByTestId('overlay-close').click()
  await expect(page.getByTestId('overlay-status')).toHaveAttribute('data-open', 'false')
  expect(await overlayWindow(app)).toBeNull()
})

test('the overlay window never shows the opening screen', async () => {
  const app = await session.launch()
  const page = await openOverlaySettings(app)
  await page.getByTestId('overlay-open').click()
  const overlay = await overlayPage(app)
  await expect(overlay.getByTestId('overlay-root')).toBeAttached()
  await expect(overlay.getByTestId('splash')).toHaveCount(0)
})
