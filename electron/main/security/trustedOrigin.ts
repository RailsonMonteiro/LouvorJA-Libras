import { join } from 'node:path'

/** URL of the Vite dev server, only defined while running `npm run dev`. */
export const devServerUrl: string | undefined = process.env['ELECTRON_RENDERER_URL']

/** Folder with the built interface (served through the `app://` scheme). */
export const rendererDir = join(__dirname, '../renderer')

/** True for URLs that belong to this application (dev server or the packaged `app://` pages). */
export function isTrustedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin
    return parsed.protocol === 'app:' && parsed.host === 'renderer'
  } catch {
    return false
  }
}
