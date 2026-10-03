import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createAdapterFactory } from '../../../electron/services/louvorja/adapters/createAdapter'
import type { LouvorJAAdapter } from '../../../electron/services/louvorja/adapters/LouvorJAAdapter'
import type { Endpoint } from '../../../src/modules/louvorja/types/louvorja.types'
import { startMockServer, type MockServer } from '../../../scripts/mock-louvorja/server.mts'

const mockServers: MockServer[] = []
const rawServers: Server[] = []
const adapters: LouvorJAAdapter[] = []

async function mock(options: Parameters<typeof startMockServer>[0] = {}): Promise<MockServer> {
  const server = await startMockServer(options)
  mockServers.push(server)
  return server
}

/** A bare HTTP server answering `/api/ping` the way violin-app does (no `/api/v2/*` at all). */
function startViolinLikeServer(): Promise<{ host: string; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url?.startsWith('/api/ping')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({ status: 'ok', app: 'LouvorJA', authorized: true, permissions: [] })
        )
        return
      }
      res.writeHead(404).end()
    })
    rawServers.push(server)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ host: '127.0.0.1', port })
    })
  })
}

/** Nothing answers here at all - the port is open but immediately hangs up (not a timeout). */
function startClosingServer(): Promise<{ host: string; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => res.destroy())
    rawServers.push(server)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ host: '127.0.0.1', port })
    })
  })
}

function adapterFor(target: { host: string; port: number }, token = ''): LouvorJAAdapter {
  const endpoint: Endpoint = { host: target.host, port: target.port, token }
  const adapter = createAdapterFactory({ requestTimeoutMs: 500 })(endpoint)
  adapters.push(adapter)
  return adapter
}

afterEach(async () => {
  adapters.splice(0).forEach((adapter) => adapter.disconnect())
  await Promise.all(mockServers.splice(0).map((server) => server.close()))
  await Promise.all(
    rawServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  )
})

describe('createAdapterFactory (protocol detection)', () => {
  it('picks the v2 adapter for a genuine LouvorJA (Delphi) v2 server', async () => {
    const server = await mock()
    const adapter = adapterFor(server)
    await adapter.connect()
    expect(adapter.describe?.()?.protocol).toBe('v2')
  })

  it('picks the v1 adapter for a genuine LouvorJA (Delphi) v1 server', async () => {
    const server = await mock({ dialect: 'v1' })
    const adapter = adapterFor(server)
    await adapter.connect()
    expect(adapter.describe?.()?.protocol).toBe('v1')
  })

  it('tells violin-app apart from the real LouvorJA even though both answer /api/ping the same way at a glance', async () => {
    const server = await startViolinLikeServer()
    const adapter = adapterFor(server)
    // violin-app's /events never answers in this test (no route for it) - connect() is expected
    // to fail past detection, but the important thing here is which adapter it picked.
    await adapter.connect().catch(() => null)
    expect(adapter.describe?.()?.protocol).toBe('violin')
  })

  it('falls back to app-Piano only once nothing answers HTTP at all', async () => {
    const server = await startClosingServer()
    const adapter = adapterFor(server)
    // Nothing is listening on the WebSocket side either in this test - connect() fails, but
    // by then the choice of adapter (piano) has already been made.
    await adapter.connect().catch(() => null)
    expect(adapter.describe?.()?.protocol).toBe('piano')
  })

  it('gives up right away on a wrong token, without ever trying app-Piano', async () => {
    const server = await mock({ token: 'right-token' })
    const adapter = adapterFor(server, 'wrong-token')
    await expect(adapter.connect()).rejects.toMatchObject({ code: 'unauthorized' })
  })
})
