import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../../electron/services/DatabaseService'
import {
  EngineError,
  type GlossEngine
} from '../../../../electron/services/libras/engines/GlossEngine'
import { LibrasRepository } from '../../../../electron/services/libras/LibrasRepository'
import { SignCatalogService } from '../../../../electron/services/libras/SignCatalogService'
import { TranslationService } from '../../../../electron/services/libras/TranslationService'

function engine(
  id: string,
  translate: (text: string) => Promise<string>
): GlossEngine & {
  calls: string[]
} {
  const calls: string[] = []
  return {
    id,
    calls,
    translate: (text) => {
      calls.push(text)
      return translate(text)
    }
  }
}

function setup(engines: () => GlossEngine[], signs: string[] = []) {
  const repository = new LibrasRepository(openDatabase(':memory:'))
  if (signs.length) repository.replaceSigns(signs, 'test://index', new Date())
  const catalog = new SignCatalogService(repository, 'test://index')
  let now = 1_000_000
  const warnings: string[] = []
  const service = new TranslationService({
    repository,
    catalog,
    engines,
    now: () => now,
    onWarning: (message) => warnings.push(message)
  })
  return { service, repository, warnings, advance: (ms: number) => void (now += ms) }
}

describe('TranslationService', () => {
  it('translates with the engine, annotates the tokens and caches the result', async () => {
    const online = engine('online', async () => 'DEUS AMOR AMAR')
    const { service, repository } = setup(() => [online], ['DEUS', 'AMOR'])

    const first = await service.translate('Deus é amor')
    expect(first.source).toBe('online')
    expect(first.gloss).toBe('DEUS AMOR AMAR')
    expect(first.edited).toBe(false)
    expect(first.tokens.map((t) => t.availability)).toEqual(['sign', 'sign', 'missing'])
    expect(repository.countCache()).toBe(1)

    const second = await service.translate('  deus   É AMOR ') // same text, different case/spacing
    expect(second.source).toBe('cache')
    expect(online.calls).toHaveLength(1)
  })

  it('a manual gloss always wins, and can be removed', async () => {
    const online = engine('online', async () => 'DEUS AMOR')
    const { service } = setup(() => [online])

    const edited = await service.saveOverride('Deus é amor', ' deus   amor  ,  amar ')
    expect(edited).toMatchObject({ source: 'manual', edited: true, gloss: 'DEUS AMOR , AMAR' })
    expect(online.calls).toEqual([])

    const restored = await service.removeOverride('Deus é amor')
    expect(restored).toMatchObject({ source: 'online', edited: false, gloss: 'DEUS AMOR' })
  })

  it('an empty manual gloss removes the override', async () => {
    const { service, repository } = setup(() => [])
    await service.saveOverride('oi', 'OLÁ')
    expect(repository.countOverrides()).toBe(1)
    await service.saveOverride('oi', '   ')
    expect(repository.countOverrides()).toBe(0)
  })

  it('falls back to the plain words when no engine is available', async () => {
    const { service, repository } = setup(() => [])
    const result = await service.translate('Glória a Deus, nas alturas!')
    expect(result).toMatchObject({ source: 'fallback', gloss: 'GLÓRIA A DEUS NAS ALTURAS' })
    expect(repository.countCache()).toBe(0) // a fallback is never remembered
  })

  it('does not keep the answer of an engine that says it is not cacheable', async () => {
    const online = engine('online', async () => 'DEUS AMOR AMAR')
    const local = { ...engine('local:0.1', async () => 'DEUS AMOR'), cacheable: false }
    let engines: GlossEngine[] = [local]
    const { service, repository } = setup(() => engines)

    expect(await service.translate('Deus é amor')).toMatchObject({ source: 'local' })
    expect(repository.countCache()).toBe(0)

    // Turning the better engine on later is not hidden by what the local one said before.
    engines = [online, local]
    expect(await service.translate('Deus é amor')).toMatchObject({
      source: 'online',
      gloss: 'DEUS AMOR AMAR'
    })
  })

  it('moves on to the next engine when one fails, and reports it', async () => {
    const broken = engine('online', async () => {
      throw new EngineError('unavailable', 'HTTP 503')
    })
    const backup = engine('local', async () => 'PAZ')
    const { service, warnings } = setup(() => [broken, backup])

    const result = await service.translate('paz')
    expect(result).toMatchObject({ source: 'local', gloss: 'PAZ' })
    expect(warnings).toEqual(['Translation engine "online" failed'])
  })

  it('leaves an engine alone for a while after it asks us to slow down', async () => {
    const limited = engine('online', async () => {
      throw new EngineError('rate-limited', null, 30_000)
    })
    const { service, advance } = setup(() => [limited])

    await service.translate('um')
    await service.translate('dois')
    expect(limited.calls).toEqual(['um']) // "dois" did not even try

    advance(30_001)
    await service.translate('três')
    expect(limited.calls).toEqual(['um', 'três'])
  })

  it('shares one engine call between simultaneous requests for the same text', async () => {
    let release: (gloss: string) => void = () => undefined
    const slow = engine('online', () => new Promise<string>((resolve) => (release = resolve)))
    const { service } = setup(() => [slow])

    const a = service.translate('Deus é amor')
    const b = service.translate('deus é amor')
    release('DEUS AMOR')
    const [first, second] = await Promise.all([a, b])

    expect(slow.calls).toHaveLength(1)
    expect(first.gloss).toBe(second.gloss)
  })

  it('still uses results obtained earlier after the engine was turned off', async () => {
    let enabled = true
    const online = engine('online', async () => 'AMOR')
    const { service } = setup(() => (enabled ? [online] : []))

    await service.translate('amor')
    enabled = false
    const offline = await service.translate('amor')
    expect(offline).toMatchObject({ source: 'cache', gloss: 'AMOR' })
    expect(online.calls).toHaveLength(1)
  })

  it('gives the engine LouvorJA all-caps text with its normal casing, but caches by the raw text', async () => {
    const online = engine('online', async () => 'SENHOR SER MEU PASTOR')
    const { service } = setup(() => [online])

    await service.translate('O SENHOR É O MEU PASTOR')
    expect(online.calls).toEqual(['O Senhor é o meu pastor'])

    // The same words in normal casing are the same text: no second call.
    const again = await service.translate('O senhor é o meu pastor')
    expect(again.source).toBe('cache')
    expect(online.calls).toHaveLength(1)
  })

  it('returns an empty translation for blank text without calling anything', async () => {
    const online = engine('online', vi.fn())
    const { service } = setup(() => [online])
    expect(await service.translate('   ')).toMatchObject({ gloss: '', tokens: [] })
    expect(online.calls).toEqual([])
  })
})
