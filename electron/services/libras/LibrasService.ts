import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_SIGNS_INDEX_URL } from '../../../src/modules/libras/types/libras.types'
import type {
  CatalogStatus,
  TranslationResult
} from '../../../src/modules/libras/types/libras.types'
import type { AppSettings } from '../../../src/types/settings'
import type { LogService } from '../LogService'
import type { GlossEngine } from './engines/GlossEngine'
import { VLibrasOnlineEngine } from './engines/VLibrasOnlineEngine'
import { LocalRulesEngine } from './local/LocalRulesEngine'
import { LibrasRepository } from './LibrasRepository'
import { SignCatalogService } from './SignCatalogService'
import { TranslationService } from './TranslationService'

export interface LibrasServiceOptions {
  db: DatabaseSync
  /** Current settings; read on every call so changes apply without a restart. */
  settings: () => Pick<AppSettings, 'onlineTranslator' | 'translatorUrl' | 'signsIndexUrl'>
  logs?: LogService
  /** Replaces the engines built from the settings (tests). */
  engines?: () => GlossEngine[]
}

/** Facade used by the IPC layer: translation, manual glosses and the sign catalog. */
export class LibrasService {
  readonly repository: LibrasRepository
  readonly catalog: SignCatalogService
  readonly translation: TranslationService
  // The sign catalog is its dictionary; it is read on every translation, so it works as soon as
  // the catalog is downloaded.
  private readonly local = new LocalRulesEngine({ catalog: () => this.catalog.current })

  constructor(private readonly options: LibrasServiceOptions) {
    this.repository = new LibrasRepository(options.db)
    this.catalog = new SignCatalogService(this.repository, DEFAULT_SIGNS_INDEX_URL)
    this.translation = new TranslationService({
      repository: this.repository,
      catalog: this.catalog,
      engines: options.engines ?? (() => this.enginesFromSettings()),
      onWarning: (message, data) => options.logs?.warn('libras', message, data)
    })
  }

  translate(text: string): Promise<TranslationResult> {
    return this.translation.translate(text)
  }

  saveOverride(text: string, gloss: string): Promise<TranslationResult> {
    return this.translation.saveOverride(text, gloss)
  }

  removeOverride(text: string): Promise<TranslationResult> {
    return this.translation.removeOverride(text)
  }

  getCatalogStatus(): CatalogStatus {
    return this.catalog.getStatus()
  }

  async refreshCatalog(): Promise<CatalogStatus> {
    const { signsIndexUrl } = this.options.settings()
    const status = await this.catalog.refresh(signsIndexUrl)
    this.options.logs?.info('libras', `Sign catalog updated (${status.count} signs)`)
    return status
  }

  /** Housekeeping run at startup. */
  prune(): void {
    this.repository.pruneCache()
  }

  private enginesFromSettings(): GlossEngine[] {
    const { onlineTranslator, translatorUrl } = this.options.settings()
    // The online translator is better, so it goes first when the person allowed it.
    const online = onlineTranslator ? [new VLibrasOnlineEngine({ url: translatorUrl })] : []
    return [...online, this.local]
  }
}
