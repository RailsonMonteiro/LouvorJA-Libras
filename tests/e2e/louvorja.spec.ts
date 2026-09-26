import { expect, test, type Page } from '@playwright/test'
import { startMockServer, type MockServer } from '../../scripts/mock-louvorja/server.mts'
import { connectThroughUi, createAppSession } from './helpers'

const session = createAppSession()
let server: MockServer | null = null

test.beforeEach(session.setup)
test.afterEach(async () => {
  await session.teardown()
  await server?.close()
  server = null
})

const state = (page: Page) => page.getByTestId('connection-state')
const currentText = (page: Page) => page.getByTestId('slides-current').getByTestId('slide-text')

test('explains how to connect, with every field starting empty', async () => {
  const page = await (await session.launch()).firstWindow()
  await page.getByTestId('nav-louvorja').click()

  await page.getByTestId('connection-help').click()
  await expect(page.getByTestId('connection-help-content')).toContainText('aba Transmitir')
  await expect(page.getByTestId('field-host').locator('input')).toHaveValue('')
  await expect(page.getByTestId('field-port').locator('input')).toHaveValue('')
  await expect(page.getByTestId('field-port').locator('input')).toHaveAttribute(
    'placeholder',
    '7070'
  )
  await expect(page.getByTestId('field-token').locator('input')).toHaveValue('')
})

test('connects through the UI and follows the song slide by slide', async () => {
  server = await startMockServer()
  server.playSong(['MÚSICA DE TESTE\nÁLBUM', 'PRIMEIRA ESTROFE\nDO HINO', 'CORO'])
  const page = await (await session.launch()).firstWindow()

  await connectThroughUi(page, server)
  await expect(state(page)).toHaveText('Conectado')
  // The page tells which LouvorJA it found, so the user can tell it is the right one.
  await expect(page.getByTestId('connection-server')).toHaveText(
    'Programa: LouvorJA 26.8.9716.65265 (API v2)'
  )

  await page.getByTestId('nav-slides').click()
  await expect(currentText(page)).toHaveText('MÚSICA DE TESTE ÁLBUM')
  await expect(page.getByTestId('live-chip')).toBeVisible()
  await expect(page.getByText('Apresentação: MÚSICA DE TESTE')).toBeVisible()

  server.nextSlide()
  await expect(currentText(page)).toHaveText('PRIMEIRA ESTROFE DO HINO')
  server.nextSlide()
  await expect(currentText(page)).toHaveText('CORO')
  await expect(page.getByTestId('slides-history').getByRole('listitem')).toHaveCount(3)

  // Looking at an older slide does not lose the live one.
  await page.getByTestId('slides-history').getByText('PRIMEIRA ESTROFE').click()
  await expect(currentText(page)).toHaveText('PRIMEIRA ESTROFE DO HINO')
  await expect(page.getByTestId('live-chip')).toBeHidden()
  await page.getByTestId('back-to-live').click()
  await expect(currentText(page)).toHaveText('CORO')
})

test('shows a Bible verse with its reference when no song is playing', async () => {
  server = await startMockServer()
  server.showVerse({ text: 'Deus é amor.', reference: 'I João 4:8 (ARA)' })
  const page = await (await session.launch()).firstWindow()

  await connectThroughUi(page, server)
  await page.getByTestId('nav-slides').click()

  await expect(currentText(page)).toHaveText('Deus é amor.')
  await expect(page.getByTestId('slides-current')).toContainText('I João 4:8 (ARA)')
  await expect(page.getByText('Versículo')).toBeVisible()
})

test('rejects an invalid address without connecting', async () => {
  server = await startMockServer()
  const page = await (await session.launch()).firstWindow()

  await connectThroughUi(page, { host: 'http://192.168.0.1', port: server.port })
  await expect(page.getByText('Informe um IP ou nome válido')).toBeVisible()
  await expect(state(page)).toHaveText('Desconectado')
  expect(server.requests).toHaveLength(0)
})

test('tells when the token is wrong, and connects with the right one', async () => {
  server = await startMockServer({ token: 'AB12c' })
  server.playSong(['LETRA'])
  const page = await (await session.launch()).firstWindow()

  await connectThroughUi(page, server, 'ERRADO')
  await expect(page.getByTestId('connection-error')).toContainText('recusou o token')
  await expect(state(page)).toHaveText('Desconectado')
  const attempts = server.requests.length
  await page.waitForTimeout(2500) // longer than the first retry delay: it must not retry
  expect(server.requests.length).toBe(attempts)

  await page.getByTestId('field-token').locator('input').fill('AB12c')
  await page.getByTestId('connect-button').click()
  await expect(state(page)).toHaveText('Conectado')
  await expect(page.getByTestId('connection-error')).toBeHidden()
})

test('keeps retrying while LouvorJA is closed and recovers when it opens', async () => {
  const first = await startMockServer()
  const { host, port } = first
  await first.close()

  const page = await (await session.launch()).firstWindow()
  await connectThroughUi(page, { host, port })

  await expect(state(page)).toHaveText('Reconectando…')
  await expect(page.getByTestId('connection-error')).toContainText('Não foi possível alcançar')

  server = await startMockServer({ port }) // LouvorJA is opened
  server.playSong(['LETRA'])
  await expect(state(page)).toHaveText('Conectado', { timeout: 15_000 })
  await expect(page.getByTestId('connection-error')).toBeHidden()
})

test('reconnects by itself when LouvorJA is restarted', async () => {
  server = await startMockServer()
  server.playSong(['ANTES'])
  const page = await (await session.launch()).firstWindow()
  await connectThroughUi(page, server)
  await expect(state(page)).toHaveText('Conectado')

  const { port } = server
  await server.close()
  await expect(state(page)).toHaveText('Reconectando…', { timeout: 10_000 })

  server = await startMockServer({ port })
  server.playSong(['DEPOIS'])
  await expect(state(page)).toHaveText('Conectado', { timeout: 15_000 })
  await page.getByTestId('nav-slides').click()
  await expect(currentText(page)).toHaveText('DEPOIS')
})

test('remembers the connection, with its token, and reconnects on the next start', async () => {
  server = await startMockServer({ token: 'AB12c' })
  server.playSong(['LETRA EM ANDAMENTO'])

  const first = await session.launch()
  const page = await first.firstWindow()
  await connectThroughUi(page, server, 'AB12c')
  await expect(state(page)).toHaveText('Conectado')

  await first.close()

  const second = await session.launch()
  const reopened = await second.firstWindow()
  await reopened.getByTestId('nav-slides').click()
  await expect(currentText(reopened)).toHaveText('LETRA EM ANDAMENTO', { timeout: 15_000 })
})

test('disconnecting stops the polling', async () => {
  server = await startMockServer()
  const page = await (await session.launch()).firstWindow()
  await connectThroughUi(page, server)
  await expect(state(page)).toHaveText('Conectado')

  await page.getByTestId('connect-button').click() // now "Desconectar"
  await expect(state(page)).toHaveText('Desconectado')
  const seen = server.requests.length
  await page.waitForTimeout(1500)
  expect(server.requests.length).toBe(seen)
})
