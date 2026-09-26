import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// The module only needs Electron when the handlers are installed, which these tests never do.
vi.mock('electron', () => ({ net: {}, protocol: {} }))

import { parseSignPath, resolveRendererFile } from '../../../../electron/main/protocol'
import { contentSecurityPolicy } from '../../../../electron/main/security/csp'

const root = resolve('/app/renderer')

describe('resolveRendererFile', () => {
  it('maps paths into the renderer folder and / to index.html', () => {
    expect(resolveRendererFile(root, '/')).toBe(resolve(root, 'index.html'))
    expect(resolveRendererFile(root, '/assets/app.js')).toBe(resolve(root, 'assets/app.js'))
    expect(resolveRendererFile(root, '/vlibras/unity/index.html')).toBe(
      resolve(root, 'vlibras/unity/index.html')
    )
  })

  it('refuses anything that escapes the folder', () => {
    for (const path of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
      '/..%2f..%2fsecret',
      '/%5c..%5c..%5csecret',
      '/a\0b',
      '/%00',
      '/%E0%A4%A'
    ]) {
      expect(resolveRendererFile(root, path), path).toBeNull()
    }
  })

  it('does not treat a sibling folder with the same prefix as inside', () => {
    expect(resolveRendererFile(root, '/../renderer-evil/x')).toBeNull()
  })
})

describe('parseSignPath', () => {
  it('splits region and sign, decoding the name', () => {
    expect(parseSignPath('/__signs__/BR/DEUS')).toEqual({ region: 'BR', sign: 'DEUS' })
    expect(parseSignPath('/__signs__/SP/GL%C3%93RIA')).toEqual({ region: 'SP', sign: 'GLÓRIA' })
  })

  it('ignores other paths and malformed ones', () => {
    expect(parseSignPath('/index.html')).toBeNull()
    expect(parseSignPath('/__signs__/')).toBeNull()
    expect(parseSignPath('/__signs__/BR')).toBeNull()
    expect(parseSignPath('/__signs__/BR/%E0%A4%A')).toBeNull()
  })
})

describe('contentSecurityPolicy', () => {
  it('is strict for the application', () => {
    const csp = contentSecurityPolicy('/index.html', false)
    expect(csp).toContain("script-src 'self'")
    expect(csp.split('; ').find((part) => part.startsWith('script-src'))).toBe("script-src 'self'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-src 'self'")
  })

  it('lets only the dev server run inline scripts and talk to localhost', () => {
    expect(contentSecurityPolicy('/', true)).toContain("script-src 'self' 'unsafe-inline'")
    expect(contentSecurityPolicy('/', true)).toContain('ws://localhost:*')
    expect(contentSecurityPolicy('/', false)).not.toContain('localhost')
  })

  it('gives eval and WebAssembly to the player page and nothing else', () => {
    const csp = contentSecurityPolicy('/vlibras/unity/index.html', false)
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain("'wasm-unsafe-eval'")
    expect(csp).toContain('connect-src')
    expect(csp).toContain('app://renderer')
    expect(csp).toContain("frame-src 'none'")
    expect(csp).not.toMatch(/https?:\/\//)
  })
})
