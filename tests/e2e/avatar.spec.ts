import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startMockServer, type MockServer } from '../../scripts/mock-louvorja/server.mts'
import { connectThroughUi, createAppSession } from './helpers'

const session = createAppSession()
let louvorja: MockServer | null = null

// The official player is downloaded by `npm run player:fetch` and is not part of the repository.
const playerInstalled = existsSync(resolve(__dirname, '../../public/vlibras/unity/index.html'))

test.beforeEach(session.setup)
test.afterEach(async () => {
  await session.teardown()
  await louvorja?.close()
  louvorja = null
})

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!

test('is reachable from the menu and shows the stage', async () => {
  const page = await (await session.launch()).firstWindow()
  await page.getByTestId('nav-projection').click()

  await expect(page.getByTestId('projection-title')).toBeVisible()
  const stage = await box(page, 'stage')
  expect(stage.width / stage.height).toBeCloseTo(16 / 9, 1)
  await expect(page.getByTestId('avatar-picker').getByRole('radio')).toHaveText([
    /Ícaro/,
    /Guga/,
    /Hosana/
  ])
  await expect(page.getByTestId('avatar-icaro')).toHaveAttribute('aria-checked', 'true')
})

test('remembers the chosen avatar, position and speed after a restart', async () => {
  const first = await session.launch()
  const page = await first.firstWindow()
  await page.getByTestId('nav-projection').click()

  await page.getByTestId('avatar-guga').click()
  await expect(page.getByTestId('avatar-guga')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('avatar-position').getByRole('radio', { name: 'Esquerda' }).click()
  await page.getByTestId('avatar-speed').getByRole('radio', { name: '2×' }).click()
  // Wait for the last change to be saved before closing.
  await expect(
    page.getByTestId('avatar-position').getByRole('radio', { name: 'Esquerda' })
  ).toHaveAttribute('aria-checked', 'true')
  await first.close()

  const second = await session.launch()
  const reopened = await second.firstWindow()
  await reopened.getByTestId('nav-projection').click()
  await expect(reopened.getByTestId('avatar-guga')).toHaveAttribute('aria-checked', 'true')
  await expect(
    reopened.getByTestId('avatar-position').getByRole('radio', { name: 'Esquerda' })
  ).toHaveAttribute('aria-checked', 'true')
  await expect(reopened.getByTestId('avatar-speed').getByRole('radio', { name: '2×' })).toHaveAttribute(
    'aria-checked',
    'true'
  )
})

test('shows the slide that is on the air and hides it on request', async () => {
  louvorja = await startMockServer()
  louvorja.playSong(['CANTAMOS LOUVORES'])

  const page = await (await session.launch()).firstWindow()
  await connectThroughUi(page, louvorja)
  await expect(page.getByTestId('connection-state')).toHaveText('Conectado')
  await page.getByTestId('nav-projection').click()

  await expect(page.getByTestId('stage-slide')).toContainText('CANTAMOS LOUVORES')
  await page.getByTestId('stage-show-slide').locator('input').uncheck()
  await expect(page.getByTestId('stage-slide')).not.toContainText('CANTAMOS LOUVORES')
})

test('tells where the avatar stands and follows the position and size settings', async () => {
  test.skip(!playerInstalled, 'the avatar player is not installed')
  test.setTimeout(90_000)

  const page = await (await session.launch()).firstWindow()
  await page.getByTestId('nav-projection').click()
  await expect(page.getByTestId('avatar-status')).toHaveAttribute('data-status', 'ready', {
    timeout: 60_000
  })

  const layer = page.getByTestId('avatar-layer')
  const stage = await box(page, 'stage')

  // Default: on the right, as tall as 90% of the stage.
  let avatar = (await layer.boundingBox())!
  expect(avatar.height).toBeCloseTo(stage.height * 0.9, 0)
  expect(avatar.x + avatar.width).toBeGreaterThan(stage.x + stage.width * 0.7)

  await page.getByTestId('avatar-position').getByRole('radio', { name: 'Esquerda' }).click()
  await expect
    .poll(async () => (await layer.boundingBox())!.x + (await layer.boundingBox())!.width / 2)
    .toBeLessThan(stage.x + stage.width * 0.3)

  await page.getByTestId('avatar-position').getByRole('radio', { name: 'Centro' }).click()
  await expect
    .poll(async () => {
      const b = (await layer.boundingBox())!
      return Math.abs(b.x + b.width / 2 - (stage.x + stage.width / 2))
    })
    .toBeLessThan(4)

  // A smaller size shrinks the box.
  const thumb = page.getByTestId('avatar-scale').getByRole('slider')
  await thumb.focus()
  for (let i = 0; i < 6; i++) await thumb.press('ArrowLeft')
  await expect
    .poll(async () => (await layer.boundingBox())!.height)
    .toBeLessThan(stage.height * 0.9 - 10)
  avatar = (await layer.boundingBox())!
  expect(avatar.y + avatar.height).toBeLessThanOrEqual(stage.y + stage.height + 1)
})

test('sets the delay before the avatar starts signing and remembers it', async () => {
  const first = await session.launch()
  const page = await first.firstWindow()
  await page.getByTestId('nav-projection').click()

  const thumb = page.getByTestId('interpret-delay').getByRole('slider')
  await expect(page.getByText('sem atraso')).toBeVisible()
  await thumb.focus()
  for (let i = 0; i < 6; i++) await thumb.press('ArrowRight') // half a second each
  await expect(page.getByText('Atraso para começar a interpretar: 3 s')).toBeVisible()
  await page.waitForTimeout(600) // the value is saved a moment after the last movement
  await first.close()

  const second = await session.launch()
  const reopened = await second.firstWindow()
  await reopened.getByTestId('nav-projection').click()
  await expect(reopened.getByText('Atraso para começar a interpretar: 3 s')).toBeVisible()
})
