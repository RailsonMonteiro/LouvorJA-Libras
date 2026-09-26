import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SignCache } from '../../../../electron/services/avatar/SignCache'

const bundle = (label: string): Buffer => Buffer.from(`UnityFS\0${label}`, 'latin1')

let server: Server
let base = ''
let hits: string[] = []
/** Signs the fake dictionary knows; anything else is a 404. */
const dictionary = new Map<string, Buffer | 'html' | 'error'>()

beforeAll(async () => {
  server = createServer((request, response) => {
    hits.push(request.url ?? '')
    const [, region, ...rest] = (request.url ?? '').split('/')
    const entry = dictionary.get(`${region}/${decodeURIComponent(rest.join('/'))}`)
    if (entry === undefined) {
      response.writeHead(404).end('no')
    } else if (entry === 'error') {
      response.writeHead(500).end('boom')
    } else if (entry === 'html') {
      response.writeHead(200, { 'content-type': 'text/html' }).end('<html>login</html>')
    } else {
      response.writeHead(200).end(entry)
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
afterAll(() => new Promise<void>((done) => server.close(() => done())))

let dir = ''
let clock = 0
beforeEach(async () => {
  hits = []
  dictionary.clear()
  clock = 1_000
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = await mkdtemp(join(tmpdir(), 'signs-'))
})

const make = (dictionaryUrl: () => string = () => base): SignCache =>
  new SignCache({ dir, dictionaryUrl, now: () => clock, missingTtlMs: 60_000, timeoutMs: 2_000 })

describe('SignCache', () => {
  it('downloads a sign once and serves it from disk afterwards', async () => {
    dictionary.set('BR/DEUS', bundle('deus'))
    const cache = make()

    const first = await cache.get('BR', 'DEUS')
    expect(first).toMatchObject({ status: 200, from: 'network' })
    const second = await cache.get('BR', 'DEUS')
    expect(second).toMatchObject({ status: 200, from: 'cache' })
    expect(second.status === 200 && second.body.equals(bundle('deus'))).toBe(true)
    expect(hits).toHaveLength(1)
  })

  it('serves cached signs even when the dictionary is unreachable', async () => {
    dictionary.set('BR/AMOR', bundle('amor'))
    await make().get('BR', 'AMOR')

    const offline = make(() => 'http://127.0.0.1:1/')
    expect(await offline.get('BR', 'AMOR')).toMatchObject({ status: 200, from: 'cache' })
    expect(await offline.get('BR', 'PAZ')).toEqual({ status: 502 })
  })

  it('keeps the same sign of different regions apart', async () => {
    dictionary.set('BR/OI', bundle('br'))
    dictionary.set('SP/OI', bundle('sp'))
    const cache = make()
    await cache.get('BR', 'OI')
    await cache.get('SP', 'OI')

    const sp = await cache.get('SP', 'OI')
    expect(sp.status === 200 && sp.body.toString('latin1')).toContain('sp')
    expect(await cache.stats()).toMatchObject({ files: 2 })
  })

  it('keeps names that differ only by case apart', async () => {
    dictionary.set('BR/a', bundle('lower'))
    dictionary.set('BR/A', bundle('upper'))
    const cache = make()
    await cache.get('BR', 'a')
    await cache.get('BR', 'A')
    expect((await cache.stats()).files).toBe(2)
  })

  it('answers 404 for a missing sign and does not ask again for a while', async () => {
    const cache = make()
    expect(await cache.get('BR', 'INEXISTENTE')).toEqual({ status: 404 })
    expect(await cache.get('BR', 'INEXISTENTE')).toEqual({ status: 404 })
    expect(hits).toHaveLength(1)

    clock += 61_000
    await cache.get('BR', 'INEXISTENTE')
    expect(hits).toHaveLength(2)
  })

  it('never caches something that is not a sign bundle', async () => {
    dictionary.set('BR/PAGINA', 'html')
    dictionary.set('BR/ERRO', 'error')
    const cache = make()

    expect(await cache.get('BR', 'PAGINA')).toEqual({ status: 502 })
    expect(await cache.get('BR', 'ERRO')).toEqual({ status: 502 })
    expect((await cache.stats()).files).toBe(0)
    expect(await readdir(dir).catch(() => [])).toEqual([])
  })

  it('rejects unknown regions and unsafe names without touching the network', async () => {
    const cache = make()
    for (const [region, sign] of [
      ['XX', 'DEUS'],
      ['BR', '../segredo'],
      ['BR', 'a/b'],
      ['BR', ''],
      ['BR', '..']
    ] as const) {
      expect(await cache.get(region, sign)).toEqual({ status: 400 })
    }
    expect(hits).toHaveLength(0)
  })

  it('shares one download between simultaneous requests', async () => {
    dictionary.set('BR/GLÓRIA', bundle('gloria'))
    const cache = make()
    await Promise.all([
      cache.get('BR', 'GLÓRIA'),
      cache.get('BR', 'GLÓRIA'),
      cache.get('BR', 'GLÓRIA')
    ])
    expect(hits).toHaveLength(1)
  })

  it('reads the dictionary address on every request', async () => {
    dictionary.set('BR/PAZ', bundle('paz'))
    let url = 'http://127.0.0.1:1/'
    const cache = make(() => url)
    expect(await cache.get('BR', 'PAZ')).toEqual({ status: 502 })
    url = base
    expect(await cache.get('BR', 'PAZ')).toMatchObject({ status: 200 })
  })

  it('prefetches only what is missing and reports the outcome', async () => {
    dictionary.set('BR/DEUS', bundle('deus'))
    dictionary.set('BR/AMOR', bundle('amor'))
    const cache = make()
    await cache.get('BR', 'DEUS')
    hits = []

    const result = await cache.prefetch('BR', ['DEUS', 'AMOR', 'AMOR', 'FALTA'])
    expect(result).toEqual({ cached: 1, downloaded: 1, failed: 1 })
    expect(hits.sort()).toEqual(['/BR/AMOR', '/BR/FALTA'])
    expect(await cache.prefetch('BR', [])).toEqual({ cached: 0, downloaded: 0, failed: 0 })
  })

  it('reports size and clears everything', async () => {
    dictionary.set('BR/DEUS', bundle('deus'))
    const cache = make()
    await cache.get('BR', 'DEUS')
    const stats = await cache.stats()
    expect(stats.files).toBe(1)
    expect(stats.bytes).toBe(bundle('deus').length)

    await cache.clear()
    expect(await cache.stats()).toEqual({ files: 0, bytes: 0 })
    // Cleared signs come back from the network.
    expect(await cache.get('BR', 'DEUS')).toMatchObject({ status: 200, from: 'network' })
  })
})
