import { app, session, shell, type Session } from 'electron'
import { contentSecurityPolicy } from './csp'
import { devServerUrl, isTrustedUrl } from './trustedOrigin'

/**
 * Dev only. Vite marks dependency modules ("?v=...") as immutable for a year, and Vuetify's styles
 * are virtual modules that only the running dev server knows. After a restart the window would
 * take the Vuetify scripts from its disk cache and ask the new server for styles it has never
 * heard of (404): a blank window. Nothing from the dev server may be reused from the cache.
 */
function noCache(headers: Record<string, string[]>): void {
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'cache-control') delete headers[name]
  }
  headers['Cache-Control'] = ['no-cache']
}

function isDevServerUrl(url: string): boolean {
  if (!devServerUrl) return false
  try {
    return new URL(url).origin === new URL(devServerUrl).origin
  } catch {
    return false
  }
}

export function applySessionSecurity(ses: Session): void {
  ses.webRequest.onHeadersReceived((details, callback) => {
    let pathname = '/'
    try {
      pathname = new URL(details.url).pathname
    } catch {
      // Not a URL we can read: the strict policy for the application applies.
    }
    const csp = contentSecurityPolicy(pathname, !!devServerUrl)
    const headers = { ...details.responseHeaders, 'Content-Security-Policy': [csp] }
    if (isDevServerUrl(details.url)) noCache(headers)
    callback({ responseHeaders: headers })
  })

  // The app needs no camera, microphone, geolocation, notifications, etc.
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
}

/** Blocks navigation away from the app, new windows and <webview>. */
export function registerWebContentsGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedUrl(url)) event.preventDefault()
    })

    contents.on('will-attach-webview', (event) => event.preventDefault())

    contents.setWindowOpenHandler(({ url }) => {
      // https for real links (About's developer credits, say), mailto for their email icon.
      if (/^(https:\/\/|mailto:)/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

export { isTrustedUrl }

/** Call once `app` is ready (the default session does not exist before that). */
export function applySecurity(): void {
  registerWebContentsGuards()
  applySessionSecurity(session.defaultSession)
}
