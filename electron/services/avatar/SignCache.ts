import { mkdir, readFile, rename, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isRegionCode,
  isValidSignName,
  type RegionCode
} from '../../../src/modules/avatar/types/avatar.types'

export type SignResult =
  | { status: 200; body: Buffer; from: 'cache' | 'network' }
  /** The dictionary does not have this sign. */
  | { status: 404 }
  /** The sign is not cached and the dictionary cannot be reached (or answered nonsense). */
  | { status: 502 }
  /** The request itself is malformed. */
  | { status: 400 }

export interface SignCacheOptions {
  /** Folder for the cached signs. */
  dir: string
  /** Base of the dictionary (read on every request, so a settings change applies at once). */
  dictionaryUrl: () => string
  timeoutMs?: number
  /** How long a "no such sign" answer is remembered, to avoid asking again and again. */
  missingTtlMs?: number
  now?: () => number
}

/** Unity asset bundles (the format of every sign) start with this word. */
const BUNDLE_MAGIC = 'UnityFS'

/**
 * Serves the signs the avatar player asks for. Each one is downloaded from the dictionary the
 * first time and kept on disk, so a sign that was used once (or prefetched) works offline.
 */
export class SignCache {
  private readonly inFlight = new Map<string, Promise<SignResult>>()
  private readonly missing = new Map<string, number>()

  constructor(private readonly options: SignCacheOptions) {}

  async get(region: string, sign: string): Promise<SignResult> {
    if (!isRegionCode(region) || !isValidSignName(sign)) return { status: 400 }

    const key = `${region}/${sign}`
    const pending = this.inFlight.get(key)
    if (pending) return pending

    const work = this.load(region, sign, key).finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, work)
    return work
  }

  /** Downloads the signs that are not on disk yet. Never throws; reports what happened. */
  async prefetch(
    region: RegionCode,
    signs: string[],
    concurrency = 4
  ): Promise<{ cached: number; downloaded: number; failed: number }> {
    const unique = [...new Set(signs)]
    const result = { cached: 0, downloaded: 0, failed: 0 }
    let next = 0

    const worker = async (): Promise<void> => {
      while (next < unique.length) {
        const sign = unique[next++]!
        const answer = await this.get(region, sign)
        if (answer.status === 200) result[answer.from === 'cache' ? 'cached' : 'downloaded'] += 1
        else result.failed += 1
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker))
    return result
  }

  async stats(): Promise<{ files: number; bytes: number }> {
    let files = 0
    let bytes = 0
    for (const region of await readdir(this.options.dir).catch(() => [])) {
      for (const file of await readdir(join(this.options.dir, region)).catch(() => [])) {
        const info = await stat(join(this.options.dir, region, file)).catch(() => null)
        if (info?.isFile() && file.endsWith('.bundle')) {
          files += 1
          bytes += info.size
        }
      }
    }
    return { files, bytes }
  }

  async clear(): Promise<void> {
    this.missing.clear()
    await rm(this.options.dir, { recursive: true, force: true })
  }

  private async load(region: RegionCode, sign: string, key: string): Promise<SignResult> {
    const path = this.pathFor(region, sign)
    const cached = await readFile(path).catch(() => null)
    if (cached) return { status: 200, body: cached, from: 'cache' }

    const now = (this.options.now ?? Date.now)()
    if ((this.missing.get(key) ?? 0) > now) return { status: 404 }

    const fetched = await this.download(region, sign)
    if (fetched.status === 404) {
      this.missing.set(key, now + (this.options.missingTtlMs ?? 5 * 60_000))
      return fetched
    }
    if (fetched.status !== 200) return fetched

    await this.store(path, fetched.body)
    return { status: 200, body: fetched.body, from: 'network' }
  }

  private async download(region: RegionCode, sign: string): Promise<SignResult> {
    const base = this.options.dictionaryUrl()
    let response: Response
    try {
      response = await fetch(`${base}${region}/${encodeURIComponent(sign)}`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000)
      })
    } catch {
      return { status: 502 }
    }

    if (response.status === 404) return { status: 404 }
    if (!response.ok) return { status: 502 }

    const body = Buffer.from(await response.arrayBuffer())
    // An error page or anything else that is not a bundle must never be cached as a sign.
    if (body.subarray(0, BUNDLE_MAGIC.length).toString('latin1') !== BUNDLE_MAGIC) {
      return { status: 502 }
    }
    return { status: 200, body, from: 'network' }
  }

  private async store(path: string, body: Buffer): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true })
    // Write then rename, so a crash never leaves a half-written sign that would be served later.
    const partial = `${path}.${process.pid}.tmp`
    await writeFile(partial, body)
    await rename(partial, path)
  }

  /** base64url keeps names with different case (or odd characters) apart on any file system. */
  private pathFor(region: RegionCode, sign: string): string {
    const file = `${Buffer.from(sign, 'utf8').toString('base64url')}.bundle`
    return join(this.options.dir, region, file)
  }
}
