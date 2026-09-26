import type { GlossToken, GlossTokenKind } from '../types/libras.types'

const DIRECTIONAL = /^[123][SP]_.+_[123][SP]$/
const NUMBER = /^\d+(?:,\d+)?$/

export function classifyToken(text: string): GlossTokenKind {
  if (DIRECTIONAL.test(text)) return 'directional'
  if (text.includes('&')) return 'disambiguated'
  if (NUMBER.test(text)) return 'number'
  if (text.includes('_')) return 'compound'
  return 'plain'
}

/** Splits a gloss ("DEUS AMOR AMAR NÓS") into tokens. Availability is filled in later. */
export function parseGloss(gloss: string): GlossToken[] {
  return gloss
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, kind: classifyToken(text), availability: 'unknown' as const }))
}

/** Joins tokens back into the text form used by the player. */
export function formatGloss(tokens: Pick<GlossToken, 'text'>[]): string {
  return tokens.map((token) => token.text).join(' ')
}

/**
 * Cleans a gloss typed by a person: one line, single spaces, upper case (glosses are always
 * upper case) and no stray punctuation that the player would not understand.
 */
export function normalizeGloss(input: string): string {
  return input
    .normalize('NFC')
    .toLocaleUpperCase('pt-BR')
    .replace(/[^\p{L}\p{N}_&,()+\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Key under which a text is cached / overridden: insensitive to case and spacing. */
export function textKey(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()
}
