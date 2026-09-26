import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../../electron/services/DatabaseService'
import { EngineError } from '../../../electron/services/libras/engines/GlossEngine'
import { VLibrasOnlineEngine } from '../../../electron/services/libras/engines/VLibrasOnlineEngine'
import { LibrasRepository } from '../../../electron/services/libras/LibrasRepository'
import { LibrasService } from '../../../electron/services/libras/LibrasService'
import { SignCatalogService } from '../../../electron/services/libras/SignCatalogService'

const servers: Server[] = []

type Handler = (request: IncomingMessage, body: string, response: ServerResponse) => void

async function serve(handler: Handler): Promise<string> {
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => handler(request, body, response))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections()
          server.close(resolve)
        })
    )
  )
})

const signIndex = (words: string[]): unknown => {
  const root: { children: Record<string, unknown> } = { children: {} }
  for (const word of words) {
    let node = root as { children: Record<string, unknown>; end?: boolean }
    for (const char of word) {
      node.children[char] ??= { children: {} }
      node = node.children[char] as typeof node
    }
    node.end = true
  }
  return { root }
}

describe('VLibrasOnlineEngine', () => {
  it('posts the text as JSON and returns the gloss', async () => {
    let received = ''
    const url = await serve((request, body, response) => {
      received = `${request.method} ${request.headers['content-type']} ${body}`
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('DEUS  AMOR\n')
    })
    const gloss = await new VLibrasOnlineEngine({ url }).translate('Deus é amor')

    expect(gloss).toBe('DEUS AMOR')
    expect(received).toBe('POST application/json {"text":"Deus é amor"}')
  })

  it('reports rate limiting with the wait the server asked for', async () => {
    const url = await serve((_r, _b, response) => {
      response.writeHead(429, { 'retry-after': '12' }).end()
    })
    await expect(new VLibrasOnlineEngine({ url }).translate('x')).rejects.toMatchObject({
      code: 'rate-limited',
      retryAfterMs: 12_000
    })
  })

  it.each([
    ['a server error', 500, 'oops', 'unavailable'],
    ['an empty answer', 200, '', 'bad-response'],
    ['an HTML page', 200, '<html><body>blocked</body></html>', 'bad-response']
  ])('rejects %s', async (_name, status, body, code) => {
    const url = await serve((_r, _b, response) => response.writeHead(status).end(body))
    await expect(new VLibrasOnlineEngine({ url }).translate('x')).rejects.toMatchObject({ code })
  })

  it('times out and reports an unreachable server', async () => {
    const stuck = await serve(() => undefined) // never answers
    await expect(
      new VLibrasOnlineEngine({ url: stuck, timeoutMs: 150 }).translate('x')
    ).rejects.toMatchObject({ code: 'timeout' })

    await expect(
      new VLibrasOnlineEngine({ url: 'http://127.0.0.1:1/translate' }).translate('x')
    ).rejects.toBeInstanceOf(EngineError)
  })
})

describe('SignCatalogService', () => {
  const words = Array.from({ length: 150 }, (_, i) => `SINAL${i}`)

  it('downloads the index, stores it and survives a restart', async () => {
    const url = await serve((_r, _b, response) =>
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(signIndex(words)))
    )
    const db = openDatabase(':memory:')
    const service = new SignCatalogService(new LibrasRepository(db), 'default://url')
    expect(service.getStatus()).toMatchObject({ ready: false, count: 0, url: 'default://url' })

    const status = await service.refresh(url)
    expect(status).toMatchObject({ ready: true, count: 150, url })
    expect(status.updatedAt).not.toBeNull()
    expect(service.current.availability('SINAL7')).toBe('sign')

    const reopened = new SignCatalogService(new LibrasRepository(db), 'default://url')
    expect(reopened.getStatus()).toMatchObject({ ready: true, count: 150 })
  })

  it('keeps the previous catalog when the new index is broken or too small', async () => {
    const good = await serve((_r, _b, response) =>
      response.writeHead(200).end(JSON.stringify(signIndex(words)))
    )
    const tiny = await serve((_r, _b, response) =>
      response.writeHead(200).end(JSON.stringify(signIndex(['A', 'B'])))
    )
    const failing = await serve((_r, _b, response) => response.writeHead(503).end())
    const garbage = await serve((_r, _b, response) => response.writeHead(200).end('not json'))

    const service = new SignCatalogService(new LibrasRepository(openDatabase(':memory:')), 'x')
    await service.refresh(good)

    await expect(service.refresh(tiny)).rejects.toThrow(/only 2 signs/)
    await expect(service.refresh(failing)).rejects.toThrow(/503/)
    await expect(service.refresh(garbage)).rejects.toThrow()
    expect(service.getStatus()).toMatchObject({ ready: true, count: 150, url: good })
  })
})

describe('LibrasService', () => {
  it('follows the settings: nothing leaves the computer until the online engine is turned on', async () => {
    const requests: string[] = []
    const url = await serve((_r, body, response) => {
      requests.push(body)
      response.writeHead(200).end('DEUS AMOR')
    })
    const settings = { onlineTranslator: false, translatorUrl: url, signsIndexUrl: url }
    const service = new LibrasService({ db: openDatabase(':memory:'), settings: () => settings })

    const off = await service.translate('Deus é amor')
    expect(off).toMatchObject({ source: 'local', gloss: 'DEUS SER AMOR' })
    expect(requests).toEqual([])

    settings.onlineTranslator = true
    const on = await service.translate('Deus é amor')
    expect(on).toMatchObject({ source: 'online', gloss: 'DEUS AMOR' })
    expect(requests).toHaveLength(1)
  })

  it('refreshes the catalog from the configured index and reports it', async () => {
    const url = await serve((_r, _b, response) =>
      response
        .writeHead(200)
        .end(JSON.stringify(signIndex(Array.from({ length: 200 }, (_, i) => `S${i}X`))))
    )
    const service = new LibrasService({
      db: openDatabase(':memory:'),
      settings: () => ({ onlineTranslator: false, translatorUrl: url, signsIndexUrl: url })
    })
    expect(service.getCatalogStatus().ready).toBe(false)
    expect((await service.refreshCatalog()).count).toBe(200)
    expect(service.getCatalogStatus().ready).toBe(true)
  })
})

describe('LibrasService with the sign catalog', () => {
  it('puts verbs in the infinitive once the catalog is downloaded', async () => {
    const signs = [...Array.from({ length: 200 }, (_, i) => `S${i}X`), 'LOUVAR', 'DEUS', 'FILHO']
    const url = await serve((_r, _b, response) =>
      response.writeHead(200).end(JSON.stringify(signIndex(signs)))
    )
    const service = new LibrasService({
      db: openDatabase(':memory:'),
      settings: () => ({ onlineTranslator: false, translatorUrl: url, signsIndexUrl: url })
    })

    // No catalog yet: the words stay as they are.
    expect((await service.translate('Louvamos os filhos de Deus')).gloss).toBe(
      'LOUVAMOS FILHOS DEUS'
    )

    await service.refreshCatalog()
    expect(await service.translate('Louvamos os filhos de Deus')).toMatchObject({
      source: 'local',
      gloss: 'LOUVAR FILHO DEUS'
    })
  })
})
