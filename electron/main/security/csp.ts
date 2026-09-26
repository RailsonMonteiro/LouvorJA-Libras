import { SIGNS_PROXY_ORIGIN } from '../../../src/modules/avatar/types/avatar.types'

/** Where the official player's page and scripts live (see scripts/fetch-vlibras-player.mts). */
export const PLAYER_PATH = '/vlibras/'

/**
 * The content security policy for a page, chosen by its path.
 *
 * The application itself is strict. The Unity player (a separate page inside an iframe) is not
 * ours to change and needs `eval` and WebAssembly, so only that page gets those, and it stays
 * cut off from everything except our own files and the sign proxy.
 */
export function contentSecurityPolicy(pathname: string, dev: boolean): string {
  const directives = pathname.startsWith(PLAYER_PATH) ? player() : application(dev)
  return directives.join('; ')
}

function application(dev: boolean): string[] {
  return [
    "default-src 'self'",
    // The dev server needs inline scripts and a websocket for hot reload.
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Vuetify applies inline styles at runtime
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    dev
      ? `connect-src 'self' ws://localhost:* http://localhost:* ${SIGNS_PROXY_ORIGIN}`
      : "connect-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    // The avatar player is a page of our own inside an iframe.
    "frame-src 'self'",
    "form-action 'none'"
  ]
}

function player(): string[] {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${SIGNS_PROXY_ORIGIN} data: blob:`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'"
  ]
}
