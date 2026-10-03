// Shared by the main process (adapters/services), the preload and the renderer.

/** Port the LouvorJA "Transmitir" tab uses by default (see docs/protocolo-louvorja.md). */
export const DEFAULT_PORT = 7070

export interface Endpoint {
  host: string
  port: number
  /**
   * Token shown in the LouvorJA "Transmitir" tab. Only needed when connecting from another
   * computer: LouvorJA does not ask for it on the machine where it runs.
   */
  token: string
}

export const CONNECTION_STATES = [
  'disconnected',
  'connecting',
  'connected',
  'reconnecting'
] as const
export type ConnectionState = (typeof CONNECTION_STATES)[number]

/** Machine readable failure reason; the renderer translates it. */
export const CONNECTION_ERROR_CODES = [
  'unreachable',
  'timeout',
  'closed',
  'http-status',
  /** The token was refused. Retrying cannot fix it. */
  'unauthorized',
  /** Something answered, but it is not (a compatible) LouvorJA. Retrying cannot fix it. */
  'incompatible'
] as const
export type ConnectionErrorCode = (typeof CONNECTION_ERROR_CODES)[number]

export interface ConnectionErrorInfo {
  code: ConnectionErrorCode
  detail: string | null
}

/**
 * What the connected server said about itself, so the user can check it is the right one.
 * `v2`/`v1` are the original (Delphi) LouvorJA's own APIs; `violin` and `piano` are other
 * distributions of LouvorJA with their own servers (see docs/protocolo-louvorja.md).
 */
export interface ServerInfo {
  version: string | null
  protocol: 'v2' | 'v1' | 'violin' | 'piano'
}

export interface ConnectionStatus {
  state: ConnectionState
  endpoint: Endpoint | null
  /** 1-based number of the current/last connection attempt, 0 while connected or idle. */
  attempt: number
  lastError: ConnectionErrorInfo | null
  /** Delay until the next automatic retry, when one is scheduled. */
  retryInMs: number | null
  connectedAt: string | null
  /** Set while connected. */
  server: ServerInfo | null
}

export const SLIDE_KINDS = ['lyrics', 'verse', 'text', 'image', 'other'] as const
export type SlideKind = (typeof SLIDE_KINDS)[number]

export interface Presentation {
  id: string
  title: string
  startedAt: string
}

export interface Slide {
  id: string
  presentationId: string | null
  /** 0-based position inside the presentation, when the source reports it. */
  index: number | null
  total: number | null
  title: string | null
  text: string
  /** Text of the slide that comes next, when the source tells it (used to translate ahead). */
  nextText: string | null
  kind: SlideKind
  receivedAt: string
}

export interface SavedConnection extends Endpoint {
  id: number
  lastConnectedAt: string | null
}

export const CONNECTION_EVENT_TYPES = ['connected', 'disconnected', 'error'] as const
export type ConnectionEventType = (typeof CONNECTION_EVENT_TYPES)[number]

export interface ConnectionEvent {
  id: number
  host: string
  port: number
  event: ConnectionEventType
  message: string | null
  createdAt: string
}

export interface ConnectionHistory {
  connections: SavedConnection[]
  events: ConnectionEvent[]
}

/** Snapshot of everything the UI needs to render the integration. */
export interface IntegrationState {
  status: ConnectionStatus
  presentation: Presentation | null
  currentSlide: Slide | null
  recentSlides: Slide[]
}

/** Pushed from the main process to every window. */
export type IntegrationPushEvent =
  | { kind: 'status'; status: ConnectionStatus }
  | { kind: 'presentation'; presentation: Presentation | null }
  | { kind: 'slide'; slide: Slide }

/** Events produced by an adapter, already independent from the wire protocol. */
export type LouvorJAEvent =
  | { type: 'presentation-started'; presentation: Presentation }
  | { type: 'slide'; slide: Slide }
  | { type: 'presentation-ended'; presentationId: string }

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const HOSTNAME =
  /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

/** IPv4 address or plain hostname. Rejects anything that could alter the URL (paths, ports, users). */
export function isValidHost(host: string): boolean {
  if (IPV4.test(host)) return host.split('.').every((octet) => Number(octet) <= 255)
  // Digits and dots that are not a full IPv4 address (e.g. "1.2.3") are not a hostname either.
  if (/^[\d.]+$/.test(host)) return false
  return HOSTNAME.test(host)
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/** The token is a short code (letters and digits). Empty is fine: it is not needed locally. */
export function isValidToken(token: string): boolean {
  return /^[A-Za-z0-9._~-]{0,64}$/.test(token)
}

/**
 * LouvorJA's own "Copiar Link" button (Transmitir tab) copies exactly this -
 * `http://<host>:<port>/?token=<token>` - to the clipboard. Recognizing it lets someone paste
 * that whole link into any field of the connection form instead of retyping the token by hand:
 * the token never passes through a keyboard (or an OS-level autocorrect/autocapitalize feature)
 * at all, which a hand-typed token is exposed to no matter what the input field's own
 * autocapitalize/autocorrect attributes say (see docs/protocolo-louvorja.md).
 */
const LOUVORJA_LINK = /^https?:\/\/([^/:?#\s]+):(\d{1,5})\/?(?:\?.*?\btoken=([^&\s]+))?/i

export function parseLouvorJALink(text: string): Partial<Endpoint> | null {
  const match = LOUVORJA_LINK.exec(text.trim())
  if (!match) return null

  const port = Number(match[2])
  if (!isValidPort(port)) return null

  const endpoint: Partial<Endpoint> = { host: match[1], port }
  if (match[3]) endpoint.token = decodeURIComponent(match[3])
  return endpoint
}

export function endpointKey(endpoint: Pick<Endpoint, 'host' | 'port'>): string {
  return `${endpoint.host.toLowerCase()}:${endpoint.port}`
}
