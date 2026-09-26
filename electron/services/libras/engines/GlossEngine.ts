export type EngineErrorCode = 'unavailable' | 'timeout' | 'rate-limited' | 'bad-response'

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    readonly detail: string | null = null,
    /** For "rate-limited": how long the engine asks us to wait. */
    readonly retryAfterMs: number | null = null
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'EngineError'
  }
}

/**
 * Turns Portuguese text into a Libras gloss. Engines are interchangeable: the online VLibras
 * service today, our own port of its translator later.
 */
export interface GlossEngine {
  /** Identifier stored with cached results. Change it when the engine's output changes. */
  readonly id: string
  /**
   * Whether results are worth keeping in the cache (default yes). Engines that answer at once
   * without a network, like the local one, say no: a stored result would only get in the way of
   * a better engine turned on later.
   */
  readonly cacheable?: boolean
  translate(text: string): Promise<string>
}
