// Shared by the main process (translation engines), the preload and the renderer.

/** Where a translation came from, from most to least trustworthy. */
export const TRANSLATION_SOURCES = ['manual', 'cache', 'local', 'online', 'fallback'] as const
export type TranslationSource = (typeof TRANSLATION_SOURCES)[number]

/**
 * - `plain`: an ordinary sign (`AMOR`).
 * - `compound`: several words signed as one (`ESPÍRITO_SANTO`).
 * - `directional`: a verb inflected for who does it to whom (`1S_AJUDAR_2S`).
 * - `disambiguated`: a sign chosen among homonyms (`ABAIXAR&OBJETO`).
 * - `number`: written with digits (`300`).
 */
export const GLOSS_TOKEN_KINDS = [
  'plain',
  'compound',
  'directional',
  'disambiguated',
  'number'
] as const
export type GlossTokenKind = (typeof GLOSS_TOKEN_KINDS)[number]

/**
 * - `sign`: the dictionary has a sign for it.
 * - `spelled`: no sign, but it can be fingerspelled letter by letter (or digit by digit).
 * - `missing`: cannot be signed at all.
 * - `unknown`: the sign catalog is not loaded yet, so nothing can be said.
 */
export const TOKEN_AVAILABILITY = ['sign', 'spelled', 'missing', 'unknown'] as const
export type TokenAvailability = (typeof TOKEN_AVAILABILITY)[number]

export interface GlossToken {
  /** As written in the gloss. */
  text: string
  kind: GlossTokenKind
  availability: TokenAvailability
}

export interface TranslationResult {
  /** The text that was translated. */
  text: string
  gloss: string
  tokens: GlossToken[]
  source: TranslationSource
  /** True when the gloss was written or fixed by a person (a manual override). */
  edited: boolean
}

export interface CatalogStatus {
  ready: boolean
  count: number
  updatedAt: string | null
  url: string
}

/** The public VLibras services. Both can be replaced in the settings (e.g. a self-hosted instance). */
export const DEFAULT_TRANSLATOR_URL = 'https://traducao2.vlibras.gov.br/translate'
export const DEFAULT_SIGNS_INDEX_URL =
  'https://dicionario2.vlibras.gov.br/static/TREES/2018.3.1.json'

/** Longest text accepted for translation. Slides are short; this only blocks abuse. */
export const MAX_TRANSLATION_TEXT_LENGTH = 2000

/** True for a well-formed http(s) address (used for the configurable service URLs). */
export function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}
