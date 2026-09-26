import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { SIGNS_PROXY_PATH, type RegionCode } from '../../src/modules/avatar/types/avatar.types'
import type { SignCache } from '../services/avatar/SignCache'
import { contentSecurityPolicy } from './security/csp'

export const APP_SCHEME = 'app'
/** The only host of the `app://` scheme. */
export const APP_HOST = 'renderer'

/**
 * `app://` serves the packaged interface (instead of `file://`, where the Unity player cannot
 * load its files) and the sign proxy. It must be declared before the app is ready.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
    }
  ])
}

/** Maps a request path to a file inside `rendererDir`, or `null` if it would leave that folder. */
export function resolveRendererFile(rendererDir: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null

  const root = resolve(rendererDir)
  const file = resolve(root, decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, ''))
  return file.startsWith(root + sep) ? file : null
}

/** Splits `/__signs__/<region>/<sign>` into its parts. */
export function parseSignPath(pathname: string): { region: string; sign: string } | null {
  if (!pathname.startsWith(SIGNS_PROXY_PATH)) return null
  const [region, ...rest] = pathname.slice(SIGNS_PROXY_PATH.length).split('/')
  if (!region || rest.length === 0) return null
  try {
    return { region, sign: decodeURIComponent(rest.join('/')) }
  } catch {
    return null
  }
}

export interface AppProtocolOptions {
  /** Folder with the built interface. Only used when `serveInterface` is on. */
  rendererDir: string
  /** Off while the Vite dev server provides the interface. The sign proxy is always on. */
  serveInterface: boolean
  signs: SignCache
}

export function handleAppProtocol({
  rendererDir,
  serveInterface,
  signs
}: AppProtocolOptions): void {
  const notFound = (): Response => new Response('Not found', { status: 404 })

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return notFound()

    const sign = parseSignPath(url.pathname)
    if (sign) {
      const result = await signs.get(sign.region as RegionCode, sign.sign)
      // The player page may be served from the dev server, so the answer must allow that origin.
      const headers = { 'access-control-allow-origin': '*' }
      if (result.status !== 200) return new Response(null, { status: result.status, headers })
      return new Response(new Uint8Array(result.body), {
        status: 200,
        headers: { ...headers, 'content-type': 'application/octet-stream' }
      })
    }

    if (!serveInterface) return notFound()
    const file = resolveRendererFile(rendererDir, url.pathname)
    if (!file) return notFound()

    const response = await net.fetch(pathToFileURL(file).toString()).catch(() => null)
    if (!response?.ok) return notFound()

    const headers = new Headers(response.headers)
    headers.set('content-security-policy', contentSecurityPolicy(url.pathname, false))
    return new Response(response.body, { status: 200, headers })
  })
}
