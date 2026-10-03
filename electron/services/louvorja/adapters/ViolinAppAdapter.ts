import { z } from 'zod'
import type {
  Endpoint,
  LouvorJAEvent,
  ServerInfo,
  SlideKind
} from '../../../../src/modules/louvorja/types/louvorja.types'
import { ConnectionError, type LouvorJAAdapter } from './LouvorJAAdapter'
import { describeError } from './errorDetail'

/**
 * Talks to violin-app's server - a from-scratch Electron rewrite of the same LouvorJA that reuses
 * its wire format for `/api/ping` but not for anything else: what is on screen is *pushed*
 * through a Server-Sent Events stream (`GET /events`), not polled. Everything this file knows
 * about that stream comes from reading violin-app's own source
 * (`electron/main/httpServer/events.js`, `src/composables/useMedia.ts`), written down in
 * docs/protocolo-louvorja.md.
 *
 * Only the two events that carry text handled here: `music_presentation_snapshot` (a song's
 * current/next slide) and `bible_verse`. `slide_change`/`slides_data` (the editor, with no song
 * actually "playing") are not - a deliberate first cut, not an oversight.
 */

export interface ViolinAppAdapterOptions {
  requestTimeoutMs?: number
  onWarning?: (message: string) => void
  now?: () => Date
}

const slideEnvelope = z.looseObject({ lyric: z.string().optional() }).nullable()
const snapshotEnvelope = z.looseObject({
  active: z.boolean().optional(),
  title: z.string().optional(),
  sessionId: z.string().optional(),
  slide: slideEnvelope.optional(),
  nextSlide: slideEnvelope.optional()
})
const musicMessage = z.looseObject({ snapshot: snapshotEnvelope.optional() })
const bibleMessage = z.looseObject({
  text: z.string().optional(),
  reference: z.string().optional(),
  active: z.boolean().optional()
})
const sseFrame = z.looseObject({ type: z.string(), payload: z.unknown().optional() })

interface OpenPresentation {
  id: string
  kind: 'song' | 'bible'
}

export class ViolinAppAdapter implements LouvorJAAdapter {
  private eventListener: ((event: LouvorJAEvent) => void) | null = null
  private closeListener: ((error: ConnectionError) => void) | null = null
  private version: string | null = null
  private controller: AbortController | null = null
  private stopped = true

  private presentation: OpenPresentation | null = null
  private songSessionId: string | null = null
  private presentationCount = 0
  private slideCount = 0
  private lastSlideKey: string | null = null

  constructor(
    private readonly endpoint: Endpoint,
    private readonly options: ViolinAppAdapterOptions = {}
  ) {}

  onEvent(listener: (event: LouvorJAEvent) => void): void {
    this.eventListener = listener
  }

  onClose(listener: (error: ConnectionError) => void): void {
    this.closeListener = listener
  }

  describe(): ServerInfo {
    return { version: this.version, protocol: 'violin' }
  }

  async connect(): Promise<void> {
    const ping = await this.request('/api/ping')
    if (ping.status === 401) throw new ConnectionError('unauthorized')
    if (ping.status !== 200 || ping.body?.app !== 'LouvorJA') {
      throw new ConnectionError('incompatible', 'the answer to ping is not from LouvorJA')
    }

    this.controller = new AbortController()
    let response: Response
    try {
      response = await fetch(this.url('/events'), {
        headers: { accept: 'text/event-stream' },
        signal: this.controller.signal
      })
    } catch (error) {
      const detail = describeError(error)
      this.options.onWarning?.(
        `Could not open /events at ${this.endpoint.host}:${this.endpoint.port}: ${detail}`
      )
      throw new ConnectionError('unreachable', detail)
    }
    if (response.status === 401) throw new ConnectionError('unauthorized')
    if (response.status !== 200 || !response.body) {
      throw new ConnectionError('http-status', String(response.status))
    }

    this.stopped = false
    void this.readLoop(response.body)
  }

  disconnect(): void {
    this.stopped = true
    this.controller?.abort()
    this.controller = null
  }

  private url(path: string): string {
    const url = new URL(`http://${this.endpoint.host}:${this.endpoint.port}${path}`)
    if (this.endpoint.token) url.searchParams.set('token', this.endpoint.token)
    return url.toString()
  }

  private async request(path: string): Promise<{ status: number; body: { app?: string } | null }> {
    try {
      const response = await fetch(this.url(path), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 8000)
      })
      const body = (await response.json().catch(() => null)) as { app?: string } | null
      return { status: response.status, body }
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new ConnectionError('timeout')
      const detail = describeError(error)
      this.options.onWarning?.(
        `Could not reach ${this.endpoint.host}:${this.endpoint.port}${path}: ${detail}`
      )
      throw new ConnectionError('unreachable', detail)
    }
  }

  // --- the SSE stream ---

  private async readLoop(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary: number
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          this.handleFrame(buffer.slice(0, boundary))
          buffer = buffer.slice(boundary + 2)
        }
      }
    } catch {
      // Falls through to the same "connection lost" report below, unless we caused it ourselves.
    }
    if (!this.stopped) {
      this.stopped = true
      this.closeListener?.(new ConnectionError('closed'))
    }
  }

  /** One `data: {...}` block (or a `:comment`/keepalive line, silently ignored). */
  private handleFrame(raw: string): void {
    const dataLines = raw.split('\n').filter((line) => line.startsWith('data:'))
    if (dataLines.length === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(dataLines.map((line) => line.slice(5).trimStart()).join('\n'))
    } catch {
      return
    }
    const frame = sseFrame.safeParse(parsed)
    if (!frame.success) return

    if (frame.data.type === 'music_presentation_snapshot') this.handleMusic(frame.data.payload)
    else if (frame.data.type === 'bible_verse') this.handleBible(frame.data.payload)
    else if (frame.data.type === 'media_close') this.endPresentation()
    // slide_change / slides_data (the editor, no song actually playing) and anything else:
    // not handled by this first version - see the class doc.
  }

  private handleMusic(payload: unknown): void {
    const parsed = musicMessage.safeParse(payload)
    const snapshot = parsed.success ? parsed.data.snapshot : undefined
    if (!snapshot?.active) {
      this.songSessionId = null
      this.endPresentation()
      return
    }
    if (this.presentation?.kind !== 'song' || this.songSessionId !== (snapshot.sessionId ?? null)) {
      this.endPresentation()
      this.songSessionId = snapshot.sessionId ?? null
      this.startPresentation('song', snapshot.title ?? '')
    }
    const text = stripHtml(snapshot.slide?.lyric ?? '')
    if (!text) return
    const nextText = snapshot.nextSlide ? stripHtml(snapshot.nextSlide.lyric ?? '') || null : null
    this.publishSlide('lyrics', text, nextText, null)
  }

  private handleBible(payload: unknown): void {
    const parsed = bibleMessage.safeParse(payload)
    if (!parsed.success || !parsed.data.text || parsed.data.active === false) {
      this.endPresentation()
      return
    }
    if (this.presentation?.kind !== 'bible') {
      this.endPresentation()
      this.startPresentation('bible', '')
    }
    const reference = stripHtml(parsed.data.reference ?? '') || null
    this.publishSlide('verse', stripHtml(parsed.data.text), null, reference)
  }

  private startPresentation(kind: 'song' | 'bible', title: string): void {
    const id = `${kind}-${++this.presentationCount}`
    this.presentation = { id, kind }
    this.slideCount = 0
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

  private publishSlide(
    kind: SlideKind,
    text: string,
    nextText: string | null,
    title: string | null
  ): void {
    if (!this.presentation) return
    const key = `${this.presentation.kind}|${text}|${title ?? ''}`
    if (key === this.lastSlideKey) return
    this.lastSlideKey = key
    this.eventListener?.({
      type: 'slide',
      slide: {
        id: `${this.presentation.id}:${++this.slideCount}`,
        presentationId: this.presentation.id,
        index: null,
        total: null,
        title,
        text,
        nextText,
        kind,
        receivedAt: this.at()
      }
    })
  }

  private at(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }
}

/** violin-app keeps line breaks as `<br>` (see its own `stripHtml` in `src/helpers/Libras.ts`). */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}
