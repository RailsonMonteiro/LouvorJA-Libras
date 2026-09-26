import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

const projectRoot = resolve(__dirname, '../..')

/** Launches the built app against an isolated profile, and cleans everything up afterwards. */
export function createAppSession() {
  let userData = ''
  const apps: ElectronApplication[] = []

  return {
    /** Call in `beforeEach`. */
    setup(): void {
      userData = mkdtempSync(join(tmpdir(), 'louvorja-libras-e2e-'))
    },
    async launch(): Promise<ElectronApplication> {
      // Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would make
      // the app boot as plain Node.
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const app = await electron.launch({
        args: [projectRoot],
        env: { ...env, LOUVORJA_USER_DATA: userData }
      })
      apps.push(app)
      return app
    },
    /** Call in `afterEach`. */
    async teardown(): Promise<void> {
      await Promise.all(apps.splice(0).map((app) => app.close().catch(() => undefined)))
      rmSync(userData, { recursive: true, force: true })
    }
  }
}

/** Opens the LouvorJA page and connects to a (mock) LouvorJA through the form. */
export async function connectThroughUi(
  page: Page,
  target: { host: string; port: number },
  token = ''
): Promise<void> {
  await page.getByTestId('nav-louvorja').click()
  await page.getByTestId('field-host').locator('input').fill(target.host)
  await page.getByTestId('field-port').locator('input').fill(String(target.port))
  await page.getByTestId('field-token').locator('input').fill(token)
  await page.getByTestId('connect-button').click()
}

export interface LibrasServer {
  url: string
  /** Texts received by the translation endpoint. */
  translated: string[]
  /** Number of times the sign index was downloaded. */
  indexDownloads: number
  close(): Promise<void>
}

/** A fake VLibras: POST /translate answers from `glosses`, GET /signs.json is the sign index. */
export async function startLibrasServer(
  glosses: Record<string, string>,
  signs: string[]
): Promise<LibrasServer> {
  const index: { root: { children: Record<string, unknown> } } = { root: { children: {} } }
  for (const sign of signs) {
    let node = index.root as { children: Record<string, unknown>; end?: boolean }
    for (const char of sign) {
      node.children[char] ??= { children: {} }
      node = node.children[char] as typeof node
    }
    node.end = true
  }

  const state = { translated: [] as string[], indexDownloads: 0 }
  const server: Server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      if (request.method === 'POST' && request.url === '/translate') {
        const { text } = JSON.parse(body) as { text: string }
        state.translated.push(text)
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(glosses[text] ?? text.toUpperCase())
      } else if (request.url === '/signs.json') {
        state.indexDownloads += 1
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(index))
      } else {
        response.writeHead(404).end()
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  return {
    url,
    get translated() {
      return state.translated
    },
    get indexDownloads() {
      return state.indexDownloads
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}
