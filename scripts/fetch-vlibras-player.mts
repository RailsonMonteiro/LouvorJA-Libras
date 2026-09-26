// Run with: npm run player:fetch   (it also runs before `npm run dev` and `npm run build`)
//
// Downloads the official VLibras Unity player (LGPL-3.0, unmodified except for one build-time
// value, exactly like the upstream build does) into public/vlibras/. The files are pinned to a
// commit and checked against SHA-256, and they are not stored in git (about 20 MB of binaries).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const REPOSITORY = 'spbgovbr-vlibras/vlibras-web-browsers'
const COMMIT = 'be6fd0745dc24e851b96d59dbcc489c0f6009f41'

interface PlayerFile {
  /** Path inside the upstream repository. */
  from: string
  /** Path under public/vlibras/. */
  to: string
  sha256: string
}

const FILES: PlayerFile[] = [
  {
    from: 'public/unity/index.html',
    to: 'unity/index.html',
    sha256: 'f97d4a0bd597deb22e3a27cf3f54ebf065a8437a37087fd6f1a2570b7ca9d888'
  },
  {
    from: 'public/unity/unity-loader.js',
    to: 'unity/unity-loader.js',
    sha256: 'c1845b1e35a2784f237391802e36009872d9ae587a94c2ee5a66546696af4a88'
  },
  {
    from: 'public/unity/playerweb.data.unityweb',
    to: 'unity/playerweb.data.unityweb',
    sha256: '0c9897ea830739a09a8a2d132e219761d7017b22feae5ec9b2feb4ed075b1256'
  },
  {
    from: 'public/unity/playerweb.wasm.code.unityweb',
    to: 'unity/playerweb.wasm.code.unityweb',
    sha256: '4005cfe27f5252c8dafaccbca4c1338de9491c5076a62da8df2bfd036d6eeb4e'
  },
  {
    from: 'public/unity/playerweb.wasm.framework.unityweb',
    to: 'unity/playerweb.wasm.framework.unityweb',
    sha256: '7177d7748ffd7715e1150e202924f3d502df7531b672ccf6a39291cf8ccba3fb'
  },
  {
    from: 'src/player/unity/index.js',
    to: 'unity/index.js',
    sha256: 'af2051f59eed56d0bbdb83674e62efb89cc14b19c161aa0ce47a4b8d6bd0bf5e'
  },
  {
    from: 'src/player/unity/playerweb.json',
    to: 'unity/playerweb.json',
    sha256: '5974da454989392935df50e0750c5cfd124f80ed449862f95d52f5c01aa2bbad'
  },
  {
    from: 'LICENSE',
    to: 'LICENSE',
    sha256: 'da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768'
  }
]

const root = resolve(import.meta.dirname, '..')
const target = resolve(root, 'public/vlibras')
const marker = resolve(target, '.version')
const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

/** The upstream page loads its own cache-busting value; ours is the pinned commit. */
const finish = (file: PlayerFile, data: Buffer): Buffer =>
  file.to === 'unity/index.js'
    ? Buffer.from(data.toString('utf8').replace('__APP_VERSION__', COMMIT.slice(0, 8)))
    : data

function isComplete(): boolean {
  return (
    existsSync(marker) &&
    readFileSync(marker, 'utf8').trim() === COMMIT &&
    FILES.every((f) => existsSync(resolve(target, f.to)))
  )
}

if (isComplete()) {
  console.log(`VLibras player already present (${COMMIT.slice(0, 8)}).`)
  process.exit(0)
}

console.log(`Downloading the VLibras Unity player (${COMMIT.slice(0, 8)}, about 20 MB)...`)
try {
  for (const file of FILES) {
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${file.from}`
    const response = await fetch(url, { signal: AbortSignal.timeout(300_000) })
    if (!response.ok) throw new Error(`${file.from}: HTTP ${response.status}`)

    const data = Buffer.from(await response.arrayBuffer())
    if (sha256(data) !== file.sha256) {
      throw new Error(`${file.from}: checksum does not match the pinned one (file changed?)`)
    }

    const out = resolve(target, file.to)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, finish(file, data))
  }
  writeFileSync(
    resolve(target, 'SOURCE.txt'),
    `VLibras player (LGPL-3.0)\nhttps://github.com/${REPOSITORY}/tree/${COMMIT}\nDownloaded by scripts/fetch-vlibras-player.mts\n`
  )
  writeFileSync(marker, COMMIT)
  console.log('VLibras player downloaded.')
} catch (error) {
  // Not fatal: the app runs without the avatar and says so.
  console.warn(`Could not download the VLibras player: ${(error as Error).message}`)
  console.warn('The avatar will be unavailable. Run "npm run player:fetch" when online.')
}
