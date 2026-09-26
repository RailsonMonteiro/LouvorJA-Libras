import { EngineError, type GlossEngine } from './GlossEngine'

export interface VLibrasOnlineOptions {
  /** `POST` endpoint that answers the gloss as plain text (the public VLibras service, or a copy). */
  url: string
  timeoutMs?: number
}

/**
 * Asks a VLibras translation service. Sends the text to that server, so it is only used when the
 * user turns it on in the settings.
 */
export class VLibrasOnlineEngine implements GlossEngine {
  readonly id = 'online'

  constructor(private readonly options: VLibrasOnlineOptions) {}

  async translate(text: string): Promise<string> {
    let response: Response
    try {
      response = await fetch(this.options.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000)
      })
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new EngineError('timeout')
      throw new EngineError('unavailable', (error as Error).message)
    }

    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'))
      throw new EngineError(
        'rate-limited',
        null,
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null
      )
    }
    if (!response.ok) throw new EngineError('unavailable', `HTTP ${response.status}`)

    const gloss = (await response.text()).replace(/\s+/g, ' ').trim()
    // A gloss is a short line of words. Anything else (an HTML error page...) is not one.
    if (!gloss || gloss.length > 4000 || /[<>]/.test(gloss)) {
      throw new EngineError('bad-response', 'not a gloss')
    }
    return gloss
  }
}
