import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LouvorJAApiAdapter } from '../../../electron/services/louvorja/adapters/LouvorJAApiAdapter'
import type { Endpoint, LouvorJAEvent } from '../../../src/modules/louvorja/types/louvorja.types'
import { startMockServer, type MockServer } from '../../../scripts/mock-louvorja/server.mts'

const servers: MockServer[] = []
const rawServers: Server[] = []
const adapters: LouvorJAApiAdapter[] = []

async function mock(options: Parameters<typeof startMockServer>[0] = {}): Promise<MockServer> {
  const server = await startMockServer(options)
  servers.push(server)
  return server
}

function adapterFor(
  target: { host: string; port: number },
  token = '',
  options = {}
): { adapter: LouvorJAApiAdapter; events: LouvorJAEvent[] } {
  const endpoint: Endpoint = { host: target.host, port: target.port, token }
  const adapter = new LouvorJAApiAdapter(endpoint, { pollIntervalMs: 20, ...options })
  adapters.push(adapter)
  const events: LouvorJAEvent[] = []
  adapter.onEvent((event) => events.push(event))
  return { adapter, events }
}

const slides = (events: LouvorJAEvent[]) =>
  events.flatMap((event) => (event.type === 'slide' ? [event.slide] : []))

afterEach(async () => {
  adapters.splice(0).forEach((adapter) => adapter.disconnect())
  await Promise.all(servers.splice(0).map((server) => server.close()))
  await Promise.all(
    rawServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  )
})

describe('LouvorJAApiAdapter (API v2)', () => {
  it('reports the song on screen, slide by slide, with the next slide known ahead', async () => {
    const server = await mock()
    server.playSong(['HINO\nÁLBUM', 'PRIMEIRA LINHA\nSEGUNDA LINHA', 'CORO'])
    const { adapter, events } = adapterFor(server)

    await adapter.connect()
    expect(adapter.protocol).toBe('v2')
    expect(events.map((e) => e.type)).toEqual(['presentation-started', 'slide'])
    expect(events[0]).toMatchObject({ presentation: { title: 'HINO' } })
    expect(slides(events)[0]).toMatchObject({
      kind: 'lyrics',
      text: 'HINO\nÁLBUM',
      nextText: 'PRIMEIRA LINHA\nSEGUNDA LINHA',
      presentationId: 'song-1'
    })

    server.nextSlide()
    await vi.waitFor(() => expect(slides(events)).toHaveLength(2))
    server.nextSlide()
    await vi.waitFor(() => expect(slides(events)).toHaveLength(3))

    expect(slides(events).map((s) => s.text)).toEqual([
      'HINO\nÁLBUM',
      'PRIMEIRA LINHA\nSEGUNDA LINHA',
      'CORO'
    ])
    expect(slides(events)[2]?.nextText).toBeNull() // last slide
    // The slide ids are unique and stay inside their presentation.
    expect(new Set(slides(events).map((s) => s.id)).size).toBe(3)
  })

  it('asks for the next slide only when the current one changes', async () => {
    const server = await mock()
    server.playSong(['UM', 'DOIS'])
    const { adapter } = adapterFor(server)
    await adapter.connect()

    await new Promise((resolve) => setTimeout(resolve, 150)) // many polls, nothing changes
    const nextRequests = server.requests.filter((r) => r.query.slide === 'next')
    expect(nextRequests).toHaveLength(1)
    expect(server.requests.filter((r) => r.query.slide === 'current').length).toBeGreaterThan(3)
  })

  it('ends the presentation when the song is closed and starts another one later', async () => {
    const server = await mock()
    server.playSong(['UM'])
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.stopSong()
    await vi.waitFor(() =>
      expect(events.at(-1)).toEqual({ type: 'presentation-ended', presentationId: 'song-1' })
    )

    server.playSong(['UM']) // the very same text, but a new presentation
    await vi.waitFor(() => expect(slides(events)).toHaveLength(2))
    expect(events.filter((e) => e.type === 'presentation-started')).toHaveLength(2)
    expect(slides(events)[1]?.presentationId).toBe('song-2')
  })

  it('shows the Bible verse when no song is playing, without the quotation marks', async () => {
    const server = await mock()
    server.showVerse({ text: 'Deus é amor.', reference: 'I João 4:8 (ARA)' })
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    expect(slides(events)[0]).toMatchObject({
      kind: 'verse',
      text: 'Deus é amor.',
      title: 'I João 4:8 (ARA)',
      nextText: null
    })

    server.showVerse({ text: 'Outro versículo.', reference: 'Salmos 1:1 (ARA)' })
    await vi.waitFor(() => expect(slides(events)).toHaveLength(2))
    expect(events.filter((e) => e.type === 'presentation-started')).toHaveLength(1)

    server.clearVerse()
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('presentation-ended'))
  })

  it('a song wins over the Bible, and the presentation switches with it', async () => {
    const server = await mock()
    server.showVerse({ text: 'Versículo.', reference: 'X 1:1' })
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.playSong(['LETRA'])
    await vi.waitFor(() => expect(slides(events).at(-1)?.text).toBe('LETRA'))
    expect(events.map((e) => e.type)).toEqual([
      'presentation-started',
      'slide',
      'presentation-ended',
      'presentation-started',
      'slide'
    ])
  })

  it('keeps what it showed while LouvorJA is busy with a window, instead of closing the presentation', async () => {
    const server = await mock()
    server.playSong(['UM', 'DOIS'])
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.setBusy(true)
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(events.map((e) => e.type)).toEqual(['presentation-started', 'slide'])

    server.setBusy(false)
    server.nextSlide()
    await vi.waitFor(() => expect(slides(events)).toHaveLength(2))
    expect(events.filter((e) => e.type === 'presentation-ended')).toHaveLength(0)
  })

  it('does not report the same slide twice and ignores blank slides', async () => {
    const server = await mock()
    server.playSong(['UM', '', 'UM'])
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.nextSlide() // blank slide
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(slides(events)).toHaveLength(1)
    expect(events.filter((e) => e.type === 'presentation-ended')).toHaveLength(0)
  })
})

describe('LouvorJAApiAdapter (token)', () => {
  it('sends the token as a Bearer header', async () => {
    const server = await mock({ token: 'AB12c' })
    server.playSong(['UM'])
    const { adapter, events } = adapterFor(server, 'AB12c')
    await adapter.connect()

    expect(slides(events)).toHaveLength(1)
    expect(server.requests.every((r) => r.authorization === 'Bearer AB12c')).toBe(true)
  })

  it.each([
    ['a wrong token', 'ZZZZZ'],
    ['no token', '']
  ])('rejects %s as unauthorized', async (_n, token) => {
    const server = await mock({ token: 'AB12c' })
    const { adapter } = adapterFor(server, token)
    await expect(adapter.connect()).rejects.toMatchObject({ code: 'unauthorized', fatal: true })
  })

  it('reports a token that stops working during the session as fatal', async () => {
    const server = await mock({ token: 'AB12c' })
    server.playSong(['UM'])
    const { adapter } = adapterFor(server, 'AB12c')
    const closed = vi.fn()
    adapter.onClose(closed)
    await adapter.connect()

    // The operator generates a new token: the old one is refused from now on.
    await server.close()
    servers.length = 0
    const changed = await mock({ token: 'NEW99', port: adapterPort(adapter) })
    changed.playSong(['UM'])

    await vi.waitFor(() => expect(closed).toHaveBeenCalled(), { timeout: 3000 })
    expect(closed.mock.calls[0]?.[0]).toMatchObject({ code: 'unauthorized', fatal: true })
  })
})

/** The port an adapter was created for (its endpoint is private). */
function adapterPort(adapter: LouvorJAApiAdapter): number {
  return (adapter as unknown as { endpoint: Endpoint }).endpoint.port
}

describe('LouvorJAApiAdapter (older LouvorJA, original API)', () => {
  it('falls back to the v1 API, which answers 200 with a 404 page for /api/v2', async () => {
    const server = await mock({ dialect: 'v1', token: 'AB12c' })
    server.playSong(['HINO', 'LETRA UM', 'FIM'])
    const { adapter, events } = adapterFor(server, 'AB12c')
    await adapter.connect()

    expect(adapter.protocol).toBe('v1')
    expect(slides(events)[0]).toMatchObject({ text: 'HINO', nextText: 'LETRA UM' })
    // v1 reads the token from the URL only.
    expect(
      server.requests
        .filter((r) => r.path === '/api/song-slides')
        .every((r) => r.query.token === 'AB12c')
    ).toBe(true)

    server.nextSlide()
    server.nextSlide()
    await vi.waitFor(() => expect(slides(events).at(-1)?.text).toBe('FIM'))
    expect(slides(events).at(-1)?.nextText).toBeNull() // "< FIM >" is not a slide
  })

  it('has no Bible endpoint, so nothing is shown when no song is playing', async () => {
    const server = await mock({ dialect: 'v1' })
    server.showVerse({ text: 'Versículo.', reference: 'X 1:1' })
    const { adapter, events } = adapterFor(server)
    await adapter.connect()
    expect(events).toEqual([])
  })
})

describe('LouvorJAApiAdapter (connection problems)', () => {
  it('rejects a server that is not LouvorJA', async () => {
    const other = createServer((_request, response) =>
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end('{"status":"ok","app":"Router"}')
    )
    rawServers.push(other)
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
    const { port } = other.address() as AddressInfo

    const { adapter } = adapterFor({ host: '127.0.0.1', port })
    await expect(adapter.connect()).rejects.toMatchObject({ code: 'incompatible', fatal: true })
  })

  it('rejects when nothing is listening', async () => {
    const closed = await mock()
    const { host, port } = closed
    await closed.close()
    servers.length = 0

    await expect(adapterFor({ host, port }).adapter.connect()).rejects.toMatchObject({
      code: 'unreachable',
      fatal: false
    })
  })

  it('reports a lost connection after repeated failures', async () => {
    const server = await mock()
    server.playSong(['UM'])
    const { adapter } = adapterFor(server, '', { maxFailures: 2, requestTimeoutMs: 500 })
    const closed = vi.fn()
    adapter.onClose(closed)
    await adapter.connect()

    await server.close()
    servers.length = 0
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(closed.mock.calls[0]?.[0]).toMatchObject({ fatal: false })
  })

  it('stops polling after disconnect()', async () => {
    const server = await mock()
    server.playSong(['UM'])
    const { adapter } = adapterFor(server)
    await adapter.connect()
    adapter.disconnect()

    const before = server.requests.length
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(server.requests.length).toBe(before)
  })
})
