import { expect, test } from '@playwright/test'
import { createAppSession } from './helpers'

const session = createAppSession()
const launch = session.launch
test.beforeEach(session.setup)
test.afterEach(session.teardown)

test('starts on the home page in Portuguese with the LouvorJA layout', async () => {
  const app = await launch()
  const page = await app.firstWindow()

  // The home page is just the brand; "Página inicial" is the sidebar's label for it.
  await expect(page.getByTestId('nav-home')).toHaveText('Página inicial')
  await expect(page.getByTestId('home-title')).toBeVisible()
  await expect(page.getByTestId('titlebar')).toBeVisible()
  await expect(page.getByTestId('sidebar')).toBeVisible()

  // The sidebar must start right below the 32px title bar (no gap, no shrinking).
  const titlebar = await page.getByTestId('titlebar').boundingBox()
  const sidebar = await page.getByTestId('sidebar').boundingBox()
  expect(titlebar?.height).toBeCloseTo(32, 0)
  expect(sidebar?.y).toBeCloseTo(32, 0)

  // One logo everywhere: the LouvorJA mark with the Libras hands over it (wider than tall).
  const logo = await page.getByTestId('logo').boundingBox()
  expect(logo!.width).toBeGreaterThan(logo!.height * 1.2)
  await expect(page.getByTestId('logo')).toHaveJSProperty('complete', true)
  expect(
    await page.evaluate<number>("document.querySelector('[data-testid=logo]').naturalWidth")
  ).toBeGreaterThan(0)
})

test('renderer is isolated from Node and CSP blocks inline scripts', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await expect(page.getByTestId('home-title')).toBeVisible()

  // Runs in the page (browser context); written as a string because this project's
  // Node tsconfig has no DOM types.
  const state = await page.evaluate<{
    require: string
    process: string
    bridge: string[]
    inlineScriptRan: boolean
  }>(`(() => {
    // An inline <script> injected into the DOM only runs if the CSP allows it.
    const script = document.createElement('script')
    script.textContent = 'globalThis.__inlineScriptRan = true'
    document.head.appendChild(script)
    return {
      require: typeof globalThis.require,
      process: typeof globalThis.process,
      bridge: Object.keys(window.louvorja).sort(),
      inlineScriptRan: globalThis.__inlineScriptRan === true
    }
  })()`)

  expect(state.require).toBe('undefined')
  expect(state.process).toBe('undefined')
  expect(state.bridge).toEqual([
    'app',
    'avatar',
    'integration',
    'libras',
    'overlay',
    'settings',
    'window'
  ])
  expect(state.inlineScriptRan).toBe(false)
})

test('persists the language across restarts', async () => {
  for (const [option, homeTitle] of [
    ['English', 'Home'],
    ['Español', 'Inicio']
  ] as const) {
    const first = await launch()
    const page = await first.firstWindow()

    await page.getByTestId('nav-settings').click()
    await page.getByRole('radio', { name: option }).click()
    await first.close()

    const second = await launch()
    await expect((await second.firstWindow()).getByTestId('nav-home')).toHaveText(homeTitle)
    await second.close()
  }
})

test('offers exactly three languages', async () => {
  const app = await launch()
  const page = await app.firstWindow()

  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('setting-locale').getByRole('radio')).toHaveText([
    /Português \(Brasil\)/,
    /Español/,
    /English/
  ])
})

test('custom title bar controls drive the native window', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await expect(page.getByTestId('titlebar')).toBeVisible()

  const isMaximized = (): Promise<boolean> =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized())

  expect(await isMaximized()).toBe(false)
  await page.getByTestId('window-maximize').click()
  await expect.poll(isMaximized).toBe(true)
  await page.getByTestId('window-maximize').click()
  await expect.poll(isMaximized).toBe(false)
})

test('sidebar collapses to an icon rail when unpinned', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  const sidebar = page.getByTestId('sidebar')

  await expect(sidebar).not.toHaveClass(/is-collapsed/)
  await page.getByTestId('sidebar-pin').click()
  await page.mouse.move(700, 400)
  await expect(sidebar).toHaveClass(/is-collapsed/)
  await page.getByTestId('nav-settings').hover()
  await expect(sidebar).not.toHaveClass(/is-collapsed/)
})

test('shows the opening screen, then hands over an app with every page already loaded', async () => {
  const app = await launch()
  const page = await app.firstWindow()

  // The opening screen leaves by itself once the app (and the avatar, if installed) is ready.
  await expect(page.getByTestId('splash')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByTestId('home-title')).toBeVisible()

  // Nothing is fetched when a page is opened for the first time: their code came with the start.
  const fetched: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/.*\.js(\?|$)/.test(request.url())) fetched.push(request.url())
  })
  for (const name of ['louvorja', 'slides', 'projection', 'settings', 'home']) {
    await page.getByTestId(`nav-${name}`).click()
    await page.waitForTimeout(300)
  }
  expect(fetched).toEqual([])
})
