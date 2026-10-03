import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { LouvorJAPianoAdapter } from '../../../electron/services/louvorja/adapters/LouvorJAPianoAdapter'
import type { Endpoint } from '../../../src/modules/louvorja/types/louvorja.types'

interface Harness {
  host: string
  port: number
  sockets: WebSocket[]
  close: () => Promise<void>
}

/** A bare-bones stand-in for app-Piano's remote-control WebSocket server. */
async function startMock(onConnection?: (socket: WebSocket) => void): Promise<Harness> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  const sockets: WebSocket[] = []
  wss.on('connection', (socket) => {
    sockets.push(socket)
    onConnection?.(socket)
  })
  await new Promise<void>((resolve) => wss.once('listening', resolve))
  const { port } = wss.address() as AddressInfo

  const harness: Harness = {
    host: '127.0.0.1',
    port,
    sockets,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.terminate()
        wss.close(() => resolve())
      })
  }
  harnesses.push(harness)
  return harness
}

const harnesses: Harness[] = []
const adapters: LouvorJAPianoAdapter[] = []

function adapterFor(target: { host: string; port: number }): LouvorJAPianoAdapter {
  const endpoint: Endpoint = { host: target.host, port: target.port, token: '' }
  const adapter = new LouvorJAPianoAdapter(endpoint, { connectTimeoutMs: 1000, busyGraceMs: 50 })
  adapters.push(adapter)
  return adapter
}

afterEach(async () => {
  adapters.splice(0).forEach((adapter) => adapter.disconnect())
  await Promise.all(harnesses.splice(0).map((h) => h.close()))
})

describe('LouvorJAPianoAdapter', () => {
  it('connects and reports app-Piano as the protocol, without ever emitting a slide', async () => {
    const server = await startMock()
    const adapter = adapterFor(server)
    const events: unknown[] = []
    adapter.onEvent((event) => events.push(event))

    await adapter.connect()
    expect(adapter.describe()).toEqual({ version: null, protocol: 'piano' })

    // Even if the server pushed a full "state" (liturgy titles, bible book/chapter/verse
    // numbers), this adapter has nothing to translate from it - see the class doc.
    server.sockets[0]?.send(
      JSON.stringify({ v: 1, type: 'state', player: { title: 'Alguma música' } })
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(events).toHaveLength(0)
  })

  it('is refused when the one connection slot is already taken (remote_busy)', async () => {
    const server = await startMock((socket) => {
      socket.send(JSON.stringify({ v: 1, type: 'error', code: 'remote_busy' }))
      socket.close()
    })
    const adapter = adapterFor(server)
    await expect(adapter.connect()).rejects.toMatchObject({ code: 'unreachable' })
  })

  it('reports the connection lost when the server closes it later', async () => {
    const server = await startMock()
    const adapter = adapterFor(server)
    const closed = vi.fn()
    adapter.onClose(closed)

    await adapter.connect()
    server.sockets[0]?.close()
    await vi.waitFor(() =>
      expect(closed).toHaveBeenCalledWith(expect.objectContaining({ code: 'closed' }))
    )
  })

  it('fails to connect when nothing is listening', async () => {
    const adapter = adapterFor({ host: '127.0.0.1', port: 1 })
    await expect(adapter.connect()).rejects.toMatchObject({ code: 'unreachable' })
  })
})
