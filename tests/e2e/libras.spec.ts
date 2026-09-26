import { expect, test, type Page } from '@playwright/test'
import { startMockServer, type MockServer } from '../../scripts/mock-louvorja/server.mts'
import { connectThroughUi, createAppSession, startLibrasServer, type LibrasServer } from './helpers'

const session = createAppSession()
let louvorja: MockServer | null = null
let libras: LibrasServer | null = null

// Enough signs for the catalog to be accepted (it must look like a real index).
const SIGNS = [
  ...Array.from({ length: 150 }, (_, i) => `SINAL${i}`),
  'DEUS',
  'AMOR',
  'A',
  'M',
  'O',
  'R'
]

test.beforeEach(session.setup)
test.afterEach(async () => {
  await session.teardown()
  await louvorja?.close()
  await libras?.close()
  louvorja = null
  libras = null
})

async function openSlides(page: Page): Promise<void> {
  await connectThroughUi(page, louvorja!)
  await expect(page.getByTestId('connection-state')).toHaveText('Conectado')
  await page.getByTestId('nav-slides').click()
}

async function setUrl(page: Page, testId: string, value: string): Promise<void> {
  const input = page.getByTestId(testId).locator('input')
  await input.fill(value)
  await input.press('Enter')
}

test('translates on this computer and offers the online translator while it is off', async () => {
  louvorja = await startMockServer()
  louvorja.playSong(['DEUS É AMOR']) // LouvorJA sends its slide text in upper case

  const page = await (await session.launch()).firstWindow()
  await openSlides(page)

  // "é" becomes SER, as in the official translator.
  await expect(page.getByTestId('gloss-source')).toHaveAttribute('data-source', 'local')
  await expect(page.getByTestId('gloss-token')).toHaveText(['DEUS', 'SER', 'AMOR'])
  await expect(page.getByTestId('gloss-fallback-hint')).toBeVisible()
  await expect(page.getByTestId('gloss-catalog-hint')).toBeVisible()
})

test('translates online once enabled, marks missing signs and lets a person correct the gloss', async () => {
  louvorja = await startMockServer()
  libras = await startLibrasServer({ 'Deus é amor': 'DEUS AMOR AMAR' }, SIGNS)
  louvorja.playSong(['DEUS É AMOR'])

  const app = await session.launch()
  const page = await app.firstWindow()

  // Point the app at the fake services, download the catalog and turn the translator on.
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-tab-translator').click()
  await setUrl(page, 'setting-translator-url', `${libras.url}/translate`)
  await setUrl(page, 'setting-signs-url', `${libras.url}/signs.json`)
  await page.getByTestId('catalog-refresh').click()
  await expect(page.getByTestId('catalog-info')).toContainText('156 sinais')
  await page.getByTestId('setting-online-translator').locator('input').click({ force: true })

  await openSlides(page)
  await expect(page.getByTestId('gloss-source')).toHaveAttribute('data-source', 'online')
  await expect(page.getByTestId('gloss-token')).toHaveText(['DEUS', 'AMOR', 'AMAR'])
  // DEUS and AMOR have signs; AMAR does not, but its letters (A, M, R) can be fingerspelled.
  await expect(page.locator('[data-testid="gloss-token"][data-availability="sign"]')).toHaveCount(2)
  await expect(
    page.locator('[data-testid="gloss-token"][data-availability="spelled"]')
  ).toHaveCount(1)
  expect(libras.translated).toEqual(['Deus é amor']) // translated ahead of time, once

  // A person corrects it: the correction wins, and no new request is made.
  await page.getByTestId('gloss-edit').click()
  await page.getByRole('textbox', { name: 'Glosa' }).fill('deus amor JESUS')
  await page.getByTestId('gloss-save').click()
  await expect(page.getByTestId('gloss-source')).toHaveAttribute('data-source', 'manual')
  await expect(page.getByTestId('gloss-token')).toHaveText(['DEUS', 'AMOR', 'JESUS'])
  await expect(
    page.locator('[data-testid="gloss-token"][data-availability="missing"]')
  ).toHaveCount(1)
  expect(libras.translated).toHaveLength(1)

  // It survives a restart (the app reconnects and receives the same slide again).
  await app.close()
  const reopened = await (await session.launch()).firstWindow()
  await reopened.getByTestId('nav-slides').click()
  await expect(reopened.getByTestId('gloss-source')).toHaveAttribute('data-source', 'manual')
  await expect(reopened.getByTestId('gloss-token')).toHaveText(['DEUS', 'AMOR', 'JESUS'])

  // ...and can be undone, going back to the remembered automatic translation.
  await reopened.getByTestId('gloss-restore').click()
  await expect(reopened.getByTestId('gloss-source')).toHaveAttribute('data-source', 'cache')
  await expect(reopened.getByTestId('gloss-token')).toHaveText(['DEUS', 'AMOR', 'AMAR'])
  expect(libras.translated).toHaveLength(1)
})

test('never contacts the translation server while the online translator is off', async () => {
  louvorja = await startMockServer()
  libras = await startLibrasServer({}, SIGNS)
  louvorja.playSong(['PAZ DE DEUS'])

  const page = await (await session.launch()).firstWindow()
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-tab-translator').click()
  await setUrl(page, 'setting-translator-url', `${libras.url}/translate`)
  await openSlides(page)

  await expect(page.getByTestId('gloss-source')).toHaveAttribute('data-source', 'local')
  await expect(page.getByTestId('gloss-token')).toHaveText(['PAZ', 'DEUS'])
  expect(libras.translated).toEqual([])
})

test('rejects an invalid service address', async () => {
  const page = await (await session.launch()).firstWindow()
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-tab-translator').click()
  await setUrl(page, 'setting-translator-url', 'not a url')
  await expect(page.getByText('Informe um endereço http:// ou https:// válido.')).toBeVisible()
})
