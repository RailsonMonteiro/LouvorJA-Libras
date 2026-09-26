import {
  formatGloss,
  normalizeGloss,
  parseGloss,
  textKey
} from '../../../src/modules/libras/core/GlossParser'
import { restoreCase } from '../../../src/modules/libras/core/TextCase'
import type {
  TranslationResult,
  TranslationSource
} from '../../../src/modules/libras/types/libras.types'
import { EngineError, type GlossEngine } from './engines/GlossEngine'
import { FallbackEngine } from './engines/FallbackEngine'
import type { LibrasRepository } from './LibrasRepository'
import type { SignCatalogService } from './SignCatalogService'

export interface TranslationServiceOptions {
  repository: LibrasRepository
  catalog: SignCatalogService
  /** Engines to try, best first. Read on every call, so a settings change applies at once. */
  engines: () => GlossEngine[]
  fallback?: GlossEngine
  now?: () => number
  onWarning?: (message: string, data?: unknown) => void
}

/** How long an engine that asked us to slow down is left alone when it does not say. */
const DEFAULT_COOLDOWN_MS = 60_000

/**
 * Text in, gloss out. The order of preference is always: what a person wrote, what was already
 * translated, a fresh engine result, and finally the plain words. Nothing here ever throws for
 * a bad engine: a translation is always produced, and its `source` says how good it is.
 */
export class TranslationService {
  private readonly fallback: GlossEngine
  private readonly inFlight = new Map<string, Promise<TranslationResult>>()
  private readonly cooldownUntil = new Map<string, number>()

  constructor(private readonly options: TranslationServiceOptions) {
    this.fallback = options.fallback ?? new FallbackEngine()
  }

  translate(text: string): Promise<TranslationResult> {
    const key = textKey(text)
    if (!key) return Promise.resolve(this.result(text, '', 'fallback', false))

    // Two requests for the same slide share one engine call.
    const pending = this.inFlight.get(key)
    if (pending) return pending

    const work = this.run(text, key).finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, work)
    return work
  }

  /** Stores a gloss written by a person. An empty gloss removes the override. */
  saveOverride(text: string, gloss: string): Promise<TranslationResult> {
    const key = textKey(text)
    const clean = normalizeGloss(gloss)
    if (!key) return this.translate(text)

    if (clean) this.options.repository.setOverride(key, text.trim(), clean)
    else this.options.repository.removeOverride(key)
    return this.translate(text)
  }

  removeOverride(text: string): Promise<TranslationResult> {
    return this.saveOverride(text, '')
  }

  private async run(text: string, key: string): Promise<TranslationResult> {
    const { repository } = this.options

    const manual = repository.getOverride(key)
    if (manual) return this.result(text, manual, 'manual', true)

    const engines = this.options.engines()
    for (const engine of engines) {
      if (engine.cacheable === false) continue
      const cached = repository.getCached(key, engine.id)
      if (cached) return this.result(text, cached, 'cache', false)
    }
    // Results obtained earlier stay valid (and cost no network) even if their engine is now off.
    const remembered = repository.getCachedAny(key)
    if (remembered) return this.result(text, remembered, 'cache', false)

    // What the engines get to read: LouvorJA's all-caps text with its normal casing back.
    const input = restoreCase(text)
    const now = (this.options.now ?? Date.now)()
    for (const engine of engines) {
      if ((this.cooldownUntil.get(engine.id) ?? 0) > now) continue
      try {
        const gloss = await engine.translate(input)
        if (engine.cacheable !== false) repository.putCache(key, engine.id, text.trim(), gloss)
        return this.result(text, gloss, sourceOf(engine.id), false)
      } catch (error) {
        this.handleEngineFailure(engine, error, now)
      }
    }

    return this.result(text, await this.fallback.translate(text), 'fallback', false)
  }

  private handleEngineFailure(engine: GlossEngine, error: unknown, now: number): void {
    if (error instanceof EngineError && error.code === 'rate-limited') {
      this.cooldownUntil.set(engine.id, now + (error.retryAfterMs ?? DEFAULT_COOLDOWN_MS))
    }
    this.options.onWarning?.(`Translation engine "${engine.id}" failed`, {
      error: error instanceof EngineError ? error.code : String(error)
    })
  }

  private result(
    text: string,
    gloss: string,
    source: TranslationSource,
    edited: boolean
  ): TranslationResult {
    const tokens = this.options.catalog.current.annotate(parseGloss(gloss))
    return { text, gloss: formatGloss(tokens), tokens, source, edited }
  }
}

/** `online` -> `online`; `local:0.2` -> `local`. */
function sourceOf(engineId: string): TranslationSource {
  const base = engineId.split(':')[0]
  return base === 'online' || base === 'local' ? base : 'fallback'
}
