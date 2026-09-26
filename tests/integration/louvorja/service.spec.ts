import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../electron/services/DatabaseService'
import { LouvorJAService } from '../../../electron/services/louvorja/LouvorJAService'
import type {
  Endpoint,
  IntegrationPushEvent
} from '../../../src/modules/louvorja/types/louvorja.types'
import { startMockServer, type MockServer } from '../../../scripts/mock-louvorja/server.mts'

const servers: MockServer[] = []
const services: LouvorJAService[] = []

async function mock(options: Parameters<typeof startMockServer>[0] = {}): Promise<MockServer> {
  const server = await startMockServer(options)
  servers.push(server)
  return server
}

function setup() {
  const db = openDatabase(':memory:')
  const service = new LouvorJAService({ db, backoff: { initialMs: 30, maxMs: 120 } })
  services.push(service)
  const events: IntegrationPushEvent[] = []
  service.onEvent((event) => events.push(event))
  return { db, service, events }
}

const endpointOf = (server: MockServer, token = ''): Endpoint => ({
  host: server.host,
  port: server.port,
  token
})

const state = (service: LouvorJAService) => service.getState().status.state

afterEach(async () => {
  services.splice(0).forEach((service) => service.dispose())
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('LouvorJAService against the simulated LouvorJA', () => {
  it('connects, follows the song slide by slide and closes the presentation with it', async () => {
    const server = await mock()
    server.playSong(['HINO\nÁLBUM', 'PRIMEIRA ESTROFE', 'CORO'])
    const { service, events } = setup()

    service.connect(endpointOf(server))
    await vi.waitFor(() => expect(state(service)).toBe('connected'))
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('HINO\nÁLBUM'))
    expect(service.getState().presentation?.title).toBe('HINO')
    expect(service.getState().currentSlide?.nextText).toBe('PRIMEIRA ESTROFE')

    // A slide changed faster than LouvorJA is asked about it would be missed, so wait for each.
    server.nextSlide()
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('PRIMEIRA ESTROFE'))
    server.nextSlide()
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('CORO'))
    expect(service.getState().recentSlides.map((s) => s.text)).toEqual([
      'HINO\nÁLBUM',
      'PRIMEIRA ESTROFE',
      'CORO'
    ])

    server.stopSong()
    await vi.waitFor(() => expect(service.getState().presentation).toBeNull())
    expect(service.getState().currentSlide?.text).toBe('CORO') // stays visible
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['status', 'presentation', 'slide'])
    )
  })

  it('keeps retrying while LouvorJA is not open and connects once it opens', async () => {
    const first = await mock()
    const { port } = first
    await first.close()
    servers.length = 0

    const { service } = setup()
    service.connect({ host: '127.0.0.1', port, token: '' })
    await vi.waitFor(() => {
      const { status } = service.getState()
      expect(status.state).toBe('reconnecting')
      expect(status.lastError?.code).toBe('unreachable')
    })

    const opened = await mock({ port })
    opened.playSong(['LETRA'])
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('LETRA'), {
      timeout: 5000
    })
  })

  it('reconnects by itself after LouvorJA is closed and opened again', async () => {
    const server = await mock()
    server.playSong(['UM'])
    const { service } = setup()
    service.connect(endpointOf(server))
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('UM'))

    const { port } = server
    await server.close()
    servers.length = 0
    await vi.waitFor(() => expect(state(service)).toBe('reconnecting'), { timeout: 5000 })

    const again = await mock({ port })
    again.playSong(['OUTRA LETRA'])
    await vi.waitFor(() => expect(state(service)).toBe('connected'), { timeout: 5000 })
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('OUTRA LETRA'))
  })

  it('does not keep retrying with a wrong token, and remembers a right one', async () => {
    const server = await mock({ token: 'AB12c' })
    server.playSong(['UM'])
    const { service } = setup()

    service.connect(endpointOf(server, 'WRONG'))
    await vi.waitFor(() => expect(service.getState().status.lastError?.code).toBe('unauthorized'))
    expect(state(service)).toBe('disconnected')
    const requests = server.requests.length
    await new Promise((resolve) => setTimeout(resolve, 250)) // several backoff periods
    expect(server.requests.length).toBe(requests)
    expect(service.getHistory().connections).toEqual([]) // a failed attempt is not saved

    service.connect(endpointOf(server, 'AB12c'))
    await vi.waitFor(() => expect(state(service)).toBe('connected'))
    expect(service.getHistory().connections[0]).toMatchObject({ token: 'AB12c' })

    // Reconnecting to the last one uses the saved token.
    service.disconnect()
    expect(service.connectToLast()).toBe(true)
    await vi.waitFor(() => expect(state(service)).toBe('connected'))
  })

  it('works with an older LouvorJA that only has the original API', async () => {
    const server = await mock({ dialect: 'v1' })
    server.playSong(['HINO', 'LETRA'])
    const { service } = setup()
    service.connect(endpointOf(server))
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('HINO'))

    server.nextSlide()
    await vi.waitFor(() => expect(service.getState().currentSlide?.text).toBe('LETRA'))
  })

  it('removes a saved connection from the history', async () => {
    const server = await mock()
    const { service } = setup()
    service.connect(endpointOf(server))
    await vi.waitFor(() => expect(state(service)).toBe('connected'))

    const [saved] = service.getHistory().connections
    expect(service.removeConnection(saved!.id).connections).toEqual([])
  })
})
