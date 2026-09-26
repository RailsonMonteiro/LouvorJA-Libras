// Simulated LouvorJA "Transmitir" server, used by the tests and by `npm run mock:louvorja`.
// It reproduces what the real program does (see docs/protocolo-louvorja.md), including its quirks.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface MockOptions {
  host?: string
  port?: number
  /**
   * When set, every /api request must carry it, like a request from another computer does in the
   * real program (from the same machine the real program asks for no token).
   */
  token?: string
  /** `v1` imitates an old LouvorJA that only has the original API. */
  dialect?: 'v2' | 'v1'
}

export interface MockRequest {
  method: string
  path: string
  query: Record<string, string>
  authorization: string | null
}

export interface MockServer {
  host: string
  port: number
  /** Every request received, oldest first. */
  requests: MockRequest[]
  /** Starts (or replaces) the song on screen. The first slide is shown. */
  playSong(slides: string[]): void
  nextSlide(): void
  previousSlide(): void
  stopSong(): void
  /** Bible verse on screen (as the "Bíblia" tab keeps it). */
  showVerse(verse: { text: string; reference: string }): void
  clearVerse(): void
  /** While busy, the calls that need LouvorJA's screen answer 503, like with a modal window open. */
  setBusy(busy: boolean): void
  close(): Promise<void>
}

const APP_VERSION = '26.8.9716.65265'

export async function startMockServer(options: MockOptions = {}): Promise<MockServer> {
  const host = options.host ?? '127.0.0.1'
  const dialect = options.dialect ?? 'v2'
  let slides: string[] = []
  let index = 0
  let verse: { text: string; reference: string } | null = null
  let busy = false
  const requests: MockRequest[] = []

  const json = (response: ServerResponse, status: number, body: object | string): void => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
  const v2Error = (response: ServerResponse, status: number, action: string, code: string): void =>
    json(response, status, { status: 'error', action, code, message: code })

  const playing = (): boolean => slides.length > 0
  const current = (): string => slides[index] ?? ''
  const next = (): string => slides[index + 1] ?? ''

  function handleV2(url: URL, response: ServerResponse): void {
    const action = url.pathname.replace('/api/v2/', '').replace(/\/$/, '')
    const what = url.searchParams.get('action')

    if (action === 'ping') {
      return json(response, 200, {
        status: 'ok',
        action,
        code: 'PONG',
        app: 'LouvorJA',
        version: APP_VERSION
      })
    }

    if (action === 'song-slides') {
      if (busy) return v2Error(response, 503, action, 'UI_BUSY')
      if (what !== 'slide') return v2Error(response, 400, action, 'INVALID_ACTION')
      if (!playing()) {
        return json(response, 200, {
          status: 'ok',
          action,
          code: 'NO_SONG_PLAYING',
          message: 'Nenhuma música em exibição',
          playing: false
        })
      }
      const which = url.searchParams.get('slide') === 'next' ? 'next' : 'current'
      const text = which === 'next' ? next() : current()
      return json(response, 200, {
        status: 'ok',
        action,
        code: 'SONG_PLAYING',
        playing: true,
        slide: text,
        which,
        ...(which === 'next' ? { is_last: text === '' } : {})
      })
    }

    if (action === 'bible' && what === 'status') {
      if (busy) return v2Error(response, 503, action, 'UI_BUSY')
      return json(response, 200, {
        status: 'ok',
        action,
        code: 'BIBLE_STATUS',
        version: 'ARA',
        book: verse ? 43 : 0,
        book_name: verse ? 'João' : '',
        chapter: verse ? 3 : 0,
        verse: verse ? 16 : 0,
        text: verse ? `"${verse.text}"` : '',
        reference: verse?.reference ?? '',
        ready: verse !== null
      })
    }

    return v2Error(response, 404, action, 'NOT_FOUND')
  }

  function handleV1(url: URL, response: ServerResponse): void {
    const path = url.pathname.replace(/\/$/, '')

    if (path === '/api/ping') return json(response, 200, { status: 'ok', app: 'LouvorJA' })

    if (path === '/api/song-slides') {
      const what = url.searchParams.get('action')
      if (what === 'get-slide') {
        if (!playing()) {
          return json(response, 200, { status: 'ok', message: '', code: 'NO_SONG_PLAYING' })
        }
        const which = url.searchParams.get('slide')
        const text = which === 'next' ? (next() === '' ? '< FIM >' : next()) : current()
        return json(response, 200, { status: 'ok', message: text, code: 'SONG_PLAYING' })
      }
      return json(response, 400, { status: 'error', code: 'MISSING_ACTION' })
    }

    // Quirk of the real program: an unknown route falls through to its static-file code, which
    // answers 200 with the 404 page (here still labelled as JSON, as it was set for /api).
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end('<html><body>404</body></html>')
  }

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', `http://${host}`)
    const query = Object.fromEntries(url.searchParams)
    const authorization = request.headers.authorization ?? null
    requests.push({ method: request.method ?? 'GET', path: url.pathname, query, authorization })

    if (url.pathname.startsWith('/api')) {
      if (options.token !== undefined) {
        // v1 only reads ?token=; v2 also accepts "Authorization: Bearer".
        const viaHeader = authorization === `Bearer ${options.token}`
        const viaUrl = query.token === options.token
        const accepted = url.pathname.startsWith('/api/v2') ? viaHeader || viaUrl : viaUrl
        if (!accepted) {
          return json(response, 401, {
            status: 'error',
            code: 'INVALID_TOKEN',
            message: 'Token ausente ou inválido'
          })
        }
      }
      const isV2 = url.pathname === '/api/v2' || url.pathname.startsWith('/api/v2/')
      if (dialect === 'v2' && isV2) return handleV2(url, response)
      return handleV1(url, response)
    }

    response.writeHead(200, { 'content-type': 'text/html' }).end('<html>LouvorJA</html>')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, host, resolve)
  })

  return {
    host,
    port: (server.address() as AddressInfo).port,
    requests,
    playSong(next) {
      slides = next
      index = 0
    },
    nextSlide() {
      if (index < slides.length - 1) index += 1
    },
    previousSlide() {
      if (index > 0) index -= 1
    },
    stopSong() {
      slides = []
      index = 0
    },
    showVerse(next) {
      verse = next
    },
    clearVerse() {
      verse = null
    },
    setBusy(value) {
      busy = value
    },
    close() {
      return new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
    }
  }
}
