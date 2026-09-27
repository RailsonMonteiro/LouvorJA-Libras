import { z } from 'zod'
import type {
  Endpoint,
  LouvorJAEvent,
  ServerInfo,
  SlideKind
} from '../../../../src/modules/louvorja/types/louvorja.types'
import { ConnectionError, type LouvorJAAdapter } from './LouvorJAAdapter'

/**
 * Talks to the transmission server of the LouvorJA desktop program (the "Transmitir" tab).
 * Everything this file knows about the wire format comes from reading that program's source,
 * and is written down in docs/protocolo-louvorja.md.
 *
 * The server is plain HTTP and only answers questions (there is no push), so the adapter asks
 * "what is on screen?" over and over and turns changes into events.
 */

export interface LouvorJAApiAdapterOptions {
  /** Time between the end of one poll and the start of the next. */
  pollIntervalMs?: number
  /** LouvorJA gives its own UI thread 5 s to answer, so a shorter wait would give up too soon. */
  requestTimeoutMs?: number
  /** Consecutive polls that cannot reach the server before the connection is called lost. */
  maxFailures?: number
  onWarning?: (message: string) => void
  now?: () => Date
}

/** `v2` is the documented API; `v1` is what older LouvorJA versions offer. */
export type Dialect = 'v2' | 'v1'

const envelope = z.looseObject({
  status: z.string().optional(),
  code: z.string().optional(),
  app: z.string().optional(),
  version: z.string().optional(),
  message: z.string().optional(),
  playing: z.boolean().optional(),
  slide: z.string().optional(),
  ready: z.boolean().optional(),
  text: z.string().optional(),
  reference: z.string().optional()
})
type Envelope = z.infer<typeof envelope>

interface Reply {
  status: number
  body: Envelope | null
}

/** What is being shown right now, whatever the dialect. */
type Observed =
  /** Nothing is on screen. */
  | { kind: 'none' }
  /** LouvorJA could not say right now (busy, or a blank slide): keep whatever we showed. */
  | { kind: 'keep' }
  | { kind: 'song'; text: string; nextText: string | null }
  | { kind: 'bible'; text: string; reference: string }

interface OpenPresentation {
  id: string
  kind: 'song' | 'bible'
}

export class LouvorJAApiAdapter implements LouvorJAAdapter {
  private eventListener: ((event: LouvorJAEvent) => void) | null = null
  private closeListener: ((error: ConnectionError) => void) | null = null
  private dialect: Dialect = 'v2'
  private version: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private failures = 0

  private presentation: OpenPresentation | null = null
  private presentationCount = 0
  private slideCount = 0
  private lastSlideKey: string | null = null

  constructor(
    private readonly endpoint: Endpoint,
    private readonly options: LouvorJAApiAdapterOptions = {}
  ) {}

  onEvent(listener: (event: LouvorJAEvent) => void): void {
    this.eventListener = listener
  }

  onClose(listener: (error: ConnectionError) => void): void {
    this.closeListener = listener
  }

  get protocol(): Dialect {
    return this.dialect
  }

  describe(): ServerInfo {
    return { version: this.version, protocol: this.dialect }
  }

  async connect(): Promise<void> {
    let reply = await this.request('/api/v2/ping')
    if (!(reply.status === 200 && reply.body?.app === 'LouvorJA')) {
      // No v2: an older LouvorJA that only has the original API. It does not say 404 for an
      // unknown route, it answers 200 with its "not found" page, so the body decides.
      this.dialect = 'v1'
      reply = await this.request('/api/ping')
    }

    if (reply.status !== 200) throw new ConnectionError('http-status', String(reply.status))
    if (reply.body?.app !== 'LouvorJA') {
      throw new ConnectionError('incompatible', 'the answer to ping is not from LouvorJA')
    }

    this.version = reply.body.version ?? null

    // The first poll runs here so a wrong token or a broken answer fails the connection; it
    // schedules the following ones itself.
    this.stopped = false
    await this.poll(true)
  }

  disconnect(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  // --- polling ---

  private schedule(): void {
    if (this.stopped) return
    this.timer = setTimeout(() => void this.poll(false), this.options.pollIntervalMs ?? 700)
  }

  /** `first` is the poll inside connect(): its errors must reach connect()'s caller. */
  private async poll(first: boolean): Promise<void> {
    try {
      await this.publish(await this.observe())
      this.failures = 0
    } catch (error) {
      if (first) throw error
      const failure = error instanceof ConnectionError ? error : new ConnectionError('closed')
      if (failure.fatal) return this.lose(failure)

      this.failures += 1
      if (this.failures >= (this.options.maxFailures ?? 3)) return this.lose(failure)
    }
    this.schedule()
  }

  private lose(error: ConnectionError): void {
    this.stopped = true
    this.closeListener?.(error)
  }

  /** Asks LouvorJA what is on screen. */
  private async observe(): Promise<Observed> {
    const song = await this.readSong('current')
    if (song === 'busy') return { kind: 'keep' }

    if (song !== null) {
      // The next slide is only asked for when the current one changed (one request less per poll).
      const changed = this.lastSlideKey !== slideKey('song', song, null)
      const next = changed ? await this.readSong('next') : null
      return { kind: 'song', text: song, nextText: next === 'busy' ? null : next }
    }

    if (this.dialect === 'v2') {
      const verse = await this.readVerse()
      if (verse) return { kind: 'bible', ...verse }
    }
    return { kind: 'none' }
  }

  /**
   * The text of the current or next slide of the song being played, `null` when no song is
   * playing (or the slide is blank / past the end), "busy" when LouvorJA did not answer in time.
   */
  private async readSong(which: 'current' | 'next'): Promise<string | null | 'busy'> {
    const reply =
      this.dialect === 'v2'
        ? await this.request('/api/v2/song-slides', { action: 'slide', slide: which })
        : await this.request('/api/song-slides', { action: 'get-slide', slide: which })

    if (reply.status === 503 || reply.status === 409) return 'busy'
    if (reply.status !== 200 || !reply.body) {
      this.options.onWarning?.(`Unexpected answer to song-slides (HTTP ${reply.status})`)
      return 'busy'
    }

    const playing =
      this.dialect === 'v2' ? reply.body.playing === true : reply.body.code === 'SONG_PLAYING'
    if (!playing) return null

    const raw = this.dialect === 'v2' ? reply.body.slide : reply.body.message
    const text = tidy(raw ?? '')
    // v1 marks "no next slide" with a literal end marker.
    if (!text || (which === 'next' && text === '< FIM >')) return which === 'next' ? null : 'busy'
    return text
  }

  private async readVerse(): Promise<{ text: string; reference: string } | null> {
    const reply = await this.request('/api/v2/bible', { action: 'status' })
    if (reply.status !== 200 || !reply.body?.ready) return null

    // LouvorJA wraps the verse in quotation marks.
    const text = tidy(reply.body.text ?? '').replace(/^"(.*)"$/s, '$1')
    return text ? { text, reference: tidy(reply.body.reference ?? '') } : null
  }

  // --- turning observations into events ---

  private async publish(observed: Observed): Promise<void> {
    if (observed.kind === 'keep') return
    if (observed.kind === 'none') {
      this.endPresentation()
      return
    }

    if (this.presentation?.kind !== observed.kind) {
      this.endPresentation()
      this.startPresentation(observed)
    }

    const title = observed.kind === 'bible' ? observed.reference || null : null
    const key = slideKey(observed.kind, observed.text, title)
    if (key === this.lastSlideKey) return
    this.lastSlideKey = key

    const kind: SlideKind = observed.kind === 'bible' ? 'verse' : 'lyrics'
    this.eventListener?.({
      type: 'slide',
      slide: {
        id: `${this.presentation!.id}:${++this.slideCount}`,
        presentationId: this.presentation!.id,
        index: null,
        total: null,
        title,
        text: observed.text,
        nextText: observed.kind === 'song' ? observed.nextText : null,
        kind,
        receivedAt: this.at()
      }
    })
  }

  private startPresentation(observed: Extract<Observed, { kind: 'song' | 'bible' }>): void {
    const id = `${observed.kind}-${++this.presentationCount}`
    this.presentation = { id, kind: observed.kind }
    this.slideCount = 0
    // A song opens on its cover slide, whose first line is the song title.
    const title = observed.kind === 'song' ? (observed.text.split('\n')[0] ?? '') : ''
    this.eventListener?.({
      type: 'presentation-started',
      presentation: { id, title, startedAt: this.at() }
    })
  }

  private endPresentation(): void {
    if (!this.presentation) return
    this.eventListener?.({ type: 'presentation-ended', presentationId: this.presentation.id })
    this.presentation = null
    this.lastSlideKey = null
  }

  private at(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }

  // --- HTTP ---

  private async request(path: string, params: Record<string, string> = {}): Promise<Reply> {
    const { host, port, token } = this.endpoint
    const url = new URL(`http://${host}:${port}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    const headers: Record<string, string> = { accept: 'application/json' }
    if (token) {
      // The original API only reads the token from the URL; v2 prefers the header.
      if (this.dialect === 'v2') headers.authorization = `Bearer ${token}`
      else url.searchParams.set('token', token)
    }

    let response: Response
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 8000)
      })
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new ConnectionError('timeout')
      throw new ConnectionError('unreachable', (error as Error).message)
    }

    if (response.status === 401) {
      // Logged instead of guessed at: this is the shape of the token actually sent, without the
      // token itself, so a real report can be checked against what the person typed/pasted -
      // e.g. an unexpected length or a swapped case on the first letter would show up here even
      // though the token itself never leaves this machine (see docs/protocolo-louvorja.md,
      // "Token recusado" em alguns computadores).
      this.options.onWarning?.(
        `Token refused by ${this.dialect} (${describeToken(token)}) at ${path}`
      )
      throw new ConnectionError('unauthorized')
    }

    const parsed = envelope.safeParse(await response.json().catch(() => null))
    return { status: response.status, body: parsed.success ? parsed.data : null }
  }
}

/** The token's shape (never its value) for logs: length and its first/last character. */
function describeToken(token: string): string {
  if (!token) return 'no token sent'
  if (token.length === 1) return `1 char "${token}"`
  return `${token.length} chars "${token[0]}"…"${token[token.length - 1]}"`
}

function slideKey(kind: string, text: string, title: string | null): string {
  return `${kind}|${text}|${title ?? ''}`
}

/** Trims and unifies line breaks (the text may end with stray blanks). */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}
