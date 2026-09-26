import {
  SignCatalog,
  extractSignsFromTrie
} from '../../../src/modules/libras/dictionary/SignCatalog'
import type { CatalogStatus } from '../../../src/modules/libras/types/libras.types'
import type { LibrasRepository } from './LibrasRepository'

/** The sign catalog kept in SQLite, downloaded on demand from the (configurable) sign index. */
export class SignCatalogService {
  private catalog: SignCatalog

  constructor(
    private readonly repository: LibrasRepository,
    private readonly defaultUrl: string,
    private readonly now: () => Date = () => new Date()
  ) {
    this.catalog = new SignCatalog(repository.listSigns())
  }

  get current(): SignCatalog {
    return this.catalog
  }

  getStatus(): CatalogStatus {
    return {
      ready: this.catalog.ready,
      count: this.catalog.size,
      updatedAt: this.repository.getMeta('signs_updated_at'),
      url: this.repository.getMeta('signs_url') ?? this.defaultUrl
    }
  }

  /** Downloads the sign index and replaces the stored catalog. Throws if anything looks wrong. */
  async refresh(
    url: string,
    signal: AbortSignal = AbortSignal.timeout(60_000)
  ): Promise<CatalogStatus> {
    const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`Sign index answered HTTP ${response.status}`)

    const signs = extractSignsFromTrie(await response.json())
    // A truncated or wrong file must not wipe a good catalog.
    if (signs.length < 100) throw new Error(`Sign index has only ${signs.length} signs`)

    this.repository.replaceSigns(signs, url, this.now())
    this.catalog = new SignCatalog(signs)
    return this.getStatus()
  }
}
