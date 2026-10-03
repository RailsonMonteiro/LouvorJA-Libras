import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViolinAppAdapter } from '../../../electron/services/louvorja/adapters/ViolinAppAdapter'
import type { Endpoint, LouvorJAEvent } from '../../../src/modules/louvorja/types/louvorja.types'

interface Harness {
  host: string
  port: number
  send: (type: string, payload: unknown) => void
  close: () => Promise<void>
}

/**
 * A bare-bones stand-in for violin-app's own server: `/api/ping` the way it really answers, and
 * `/events` as a real SSE stream (`send()` writes a frame to every connected client) - close
 * enough to `electron/main/httpServer/events.js` for what `ViolinAppAdapter` actually reads.
 */
async function startMock(): Promise<Harness> {
  const clients = new Set<ServerResponse>()
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith('/api/ping')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', app: 'LouvorJA', authorized: true, permissions: [] }))
      return
    }
    if (req.url?.startsWith('/events')) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      })
      res.write(':ok\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const harness: Harness = {
    host: '127.0.0.1',
    port,
    send: (type, payload) => {
      const frame = `data: ${JSON.stringify({ type, payload })}\n\n`
      for (const client of clients) client.write(frame)
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of clients) client.end()
        server.close(() => resolve())
      })
  }
  harnesses.push(harness)
  return harness
}

const harnesses: Harness[] = []
const adapters: ViolinAppAdapter[] = []

function adapterFor(target: { host: string; port: number }): {
  adapter: ViolinAppAdapter
  events: LouvorJAEvent[]
} {
  const endpoint: Endpoint = { host: target.host, port: target.port, token: '' }
  const adapter = new ViolinAppAdapter(endpoint, { requestTimeoutMs: 2000 })
  adapters.push(adapter)
  const events: LouvorJAEvent[] = []
  adapter.onEvent((event) => events.push(event))
  return { adapter, events }
}

afterEach(async () => {
  adapters.splice(0).forEach((adapter) => adapter.disconnect())
  await Promise.all(harnesses.splice(0).map((h) => h.close()))
})

describe('ViolinAppAdapter', () => {
  it('reports the song on screen from a music_presentation_snapshot event', async () => {
    const server = await startMock()
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.send('music_presentation_snapshot', {
      snapshot: {
        active: true,
        sessionId: 'sess-1',
        title: 'HINO',
        slide: { lyric: 'PRIMEIRA LINHA<br>SEGUNDA LINHA' },
        nextSlide: { lyric: 'CORO' }
      }
    })

    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(events[0]).toMatchObject({
      type: 'presentation-started',
      presentation: { title: 'HINO' }
    })
    expect(events[1]).toMatchObject({
      type: 'slide',
      slide: { kind: 'lyrics', text: 'PRIMEIRA LINHA\nSEGUNDA LINHA', nextText: 'CORO' }
    })
  })

  it('does not repeat the same slide twice', async () => {
    const server = await startMock()
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    const snapshot = {
      snapshot: {
        active: true,
        sessionId: 'sess-1',
        title: 'HINO',
        slide: { lyric: 'IGUAL' },
        nextSlide: null
      }
    }
    server.send('music_presentation_snapshot', snapshot)
    await vi.waitFor(() => expect(events).toHaveLength(2))
    server.send('music_presentation_snapshot', snapshot)
    await new Promise((r) => setTimeout(r, 100))
    expect(events).toHaveLength(2) // still just started + one slide
  })

  it('ends the presentation when the snapshot goes inactive, and starts a new one for a new session', async () => {
    const server = await startMock()
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.send('music_presentation_snapshot', {
      snapshot: {
        active: true,
        sessionId: 'sess-1',
        title: 'UM',
        slide: { lyric: 'A' },
        nextSlide: null
      }
    })
    await vi.waitFor(() => expect(events).toHaveLength(2))

    server.send('music_presentation_snapshot', { snapshot: { active: false } })
    await vi.waitFor(() =>
      expect(events.map((e) => e.type)).toEqual([
        'presentation-started',
        'slide',
        'presentation-ended'
      ])
    )

    server.send('music_presentation_snapshot', {
      snapshot: {
        active: true,
        sessionId: 'sess-2',
        title: 'DOIS',
        slide: { lyric: 'B' },
        nextSlide: null
      }
    })
    await vi.waitFor(() => expect(events).toHaveLength(5))
    expect(events[3]).toMatchObject({
      type: 'presentation-started',
      presentation: { title: 'DOIS' }
    })
  })

  it('reports a bible verse from a bible_verse event', async () => {
    const server = await startMock()
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.send('bible_verse', { text: 'No princípio...', reference: 'Gênesis 1:1', active: true })
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(events[1]).toMatchObject({
      type: 'slide',
      slide: { kind: 'verse', text: 'No princípio...', title: 'Gênesis 1:1' }
    })
  })

  it('ends the presentation on media_close', async () => {
    const server = await startMock()
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.send('bible_verse', { text: 'Texto', reference: 'Ref', active: true })
    await vi.waitFor(() => expect(events).toHaveLength(2))
    server.send('media_close', {})
    await vi.waitFor(() => expect(events).toHaveLength(3))
    expect(events[2]?.type).toBe('presentation-ended')
  })
})
