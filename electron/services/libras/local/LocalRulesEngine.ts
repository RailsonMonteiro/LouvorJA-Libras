import type { GlossEngine } from '../engines/GlossEngine.ts'
import { CatalogLemmatizer, type SignLookup } from './CatalogLemmatizer.ts'
import { irregularLemma } from './irregularVerbs.ts'
import { replaceSpelledNumbers } from './spelledNumbers.ts'
import { LATIN_CHARS, preprocess, removeEnclise } from './textPreprocessing.ts'
import { EXPRESSIONS_RAW, FAMOUS_RAW, PLACES_RAW, SYNONYMS_RAW } from './vlibras-data.ts'

/**
 * Words that Libras does not sign and the official translator drops: articles, "um/uma", the
 * prepositions "de" and "em", the conjunction "e", and the contractions that hide one of them
 * ("do" is "de o", "na" is "em a", "ao" is "a o").
 */
const DROPPED = new Set([
  ...['o', 'os', 'a', 'as', 'um', 'uns', 'uma', 'umas', 'de', 'em', 'e'],
  ...['do', 'dos', 'da', 'das', 'no', 'nos', 'na', 'nas', 'ao', 'aos', 'à', 'às'],
  ...['num', 'numa', 'nuns', 'numas', 'dum', 'duma', 'duns', 'dumas']
])

/** Contractions that keep a word: "dele" is "de ele", so "ele" remains. */
const CONTRACTIONS: Record<string, string> = {
  dele: 'ele',
  dela: 'ela',
  deles: 'eles',
  delas: 'elas',
  nele: 'ele',
  nela: 'ela',
  neles: 'eles',
  nelas: 'elas',
  deste: 'este',
  desta: 'esta',
  destes: 'estes',
  destas: 'estas',
  desse: 'esse',
  dessa: 'essa',
  desses: 'esses',
  dessas: 'essas',
  daquele: 'aquele',
  daquela: 'aquela',
  neste: 'este',
  nesta: 'esta',
  nesse: 'esse',
  nessa: 'essa',
  naquele: 'aquele',
  naquela: 'aquela',
  comigo: 'com eu',
  contigo: 'com tu',
  consigo: 'com tu',
  conosco: 'com nós',
  convosco: 'com vós'
}

/** Feminine possessives are signed as the masculine ones. */
const POSSESSIVES: Record<string, string> = {
  minha: 'meu',
  minhas: 'meus',
  tua: 'teu',
  tuas: 'teus',
  sua: 'seu',
  suas: 'seus',
  nossa: 'nosso',
  nossas: 'nossos',
  vossa: 'vosso',
  vossas: 'vossos'
}

/** Feminine quantifiers are signed as the masculine ones ("todas as manhãs" is TODO MANHÃ). */
const QUANTIFIERS: Record<string, string> = {
  toda: 'todo',
  todas: 'todo',
  muita: 'muito',
  muitas: 'muitos',
  pouca: 'pouco',
  poucas: 'poucos'
}

/** Pronouns glued to a verb keep their place, before it: "alegrem-se" is "se alegrem". */
const KEPT_CLITICS = new Set(['me', 'te', 'se', 'nos', 'vos', 'lhe', 'lhes'])

type Replacement = [pattern: RegExp, value: string]

/**
 * Translates Portuguese into a Libras gloss with rules alone, no network. Port of the parts of
 * `vlibras-translate` (LAViD/UFPB, LGPL-3.0) that do not depend on its part-of-speech tagger and
 * lemmatizer: text cleaning, numbers, dropped words, and the tables of compound words, synonyms,
 * places and famous people.
 *
 * What it does not do yet, and the official translator does: put verbs in the infinitive (except
 * the irregular ones), singularize nouns and adjectives, and tell an article from a preposition
 * "a". See docs/tradutor-libras.md.
 */
export class LocalRulesEngine implements GlossEngine {
  /** Bump when the output changes, so results cached by an older version are not reused. */
  readonly id = 'local:0.2'
  readonly cacheable = false

  private readonly synonyms = compile(SYNONYMS_RAW, ';')
  private readonly expressions = compile(EXPRESSIONS_RAW, ';')
  /**
   * Expressions whose words must not be dropped or changed ("em breve", "de repente", names of
   * places and people). The official translator treats them the same way.
   */
  private readonly protectedPhrases = [
    ...EXPRESSIONS_RAW.split('\n'),
    ...PLACES_RAW.split('\n'),
    ...FAMOUS_RAW.split('\n')
  ]
    .map((line) => line.split(/[;:]/)[0]!.toLowerCase().split(' '))
    .filter((words) => words.length > 1)

  private readonly catalog: (() => SignLookup) | null

  /**
   * @param catalog The sign catalog, read on every translation (it may be downloaded later). It
   *   is the dictionary that puts verbs in the infinitive and nouns in the singular; without it
   *   (or before it is downloaded) those words are left as written.
   */
  constructor(options: { catalog?: () => SignLookup } = {}) {
    this.catalog = options.catalog ?? null
  }

  translate(text: string): Promise<string> {
    return Promise.resolve(this.run(text))
  }

  run(text: string): string {
    const words = this.tokenize(preprocess(text)).map((word) => word.toLowerCase())
    const kept = this.reduce(replaceSpelledNumbers(words))
    return this.applyTables(kept.join(' ').toUpperCase())
  }

  /** Splits into words and numbers; punctuation is not signed. */
  private tokenize(text: string): string[] {
    const tokens: string[] = []
    const pattern = new RegExp(`\\d+(?:\\.\\d+)?|[${LATIN_CHARS}]+(?:-[${LATIN_CHARS}]+)*`, 'g')

    for (const match of text.matchAll(pattern)) {
      const token = match[0]
      if (/^\d/.test(token)) {
        // Decimal numbers are signed as "3 vírgula 5".
        const [whole, decimals] = token.split('.')
        tokens.push(whole!)
        if (decimals) tokens.push('vírgula', decimals)
      } else {
        tokens.push(...splitEnclise(token).flatMap((part) => part.split('-')))
      }
    }
    return tokens
  }

  /** Drops what is not signed and rewrites what has a fixed replacement. */
  private reduce(words: string[]): string[] {
    const protectedAt = this.findProtected(words)
    const lemmatizer = this.catalog ? new CatalogLemmatizer(this.catalog()) : null
    const out: string[] = []
    let previousWasVerb = false

    words.forEach((word, index) => {
      if (DROPPED.has(word) && !protectedAt.has(index)) return // dropped; what came before still counts

      if (protectedAt.has(index) || /^\d/.test(word)) {
        out.push(word)
        previousWasVerb = false
      } else if (word in CONTRACTIONS) {
        out.push(CONTRACTIONS[word]!)
        previousWasVerb = false
      } else if (word in POSSESSIVES) {
        out.push(POSSESSIVES[word]!)
        previousWasVerb = false
      } else if (word in QUANTIFIERS) {
        out.push(QUANTIFIERS[word]!)
        previousWasVerb = false
      } else {
        const irregular = irregularLemma(word)
        const lemma =
          irregular ?? lemmatizer?.lemma(word, words[index - 1] ?? null, previousWasVerb) ?? word
        // A verb form turned into an infinitive (or an irregular one) is a verb.
        previousWasVerb = irregular !== null || (lemma !== word && lemma.endsWith('r'))
        out.push(lemma)
      }
    })
    return out
  }

  /** Positions covered by an expression such as "em breve" or "de repente" (kept as written). */
  private findProtected(words: string[]): Set<number> {
    const covered = new Set<number>()
    for (const phrase of this.protectedPhrases) {
      for (let start = 0; start + phrase.length <= words.length; start += 1) {
        if (phrase.every((word, offset) => words[start + offset] === word)) {
          for (let offset = 0; offset < phrase.length; offset += 1) covered.add(start + offset)
        }
      }
    }
    return covered
  }

  private applyTables(gloss: string): string {
    let result = gloss
    for (const table of [this.synonyms, this.expressions]) {
      for (const [pattern, value] of table) result = result.replace(pattern, () => value)
    }
    return result
  }
}

/** "alegrem-se" -> ["se", "alegrem"]; other glued pronouns are dropped ("amar-te" is not signed). */
function splitEnclise(token: string): string[] {
  const glued = /^([\p{L}]+)-(lhes|lhe|nos|vos|me|te|se)$/u.exec(token)
  if (glued && KEPT_CLITICS.has(glued[2]!)) return [glued[2]!, glued[1]!]
  return [removeEnclise(token)]
}

/**
 * One table as ordered replacements, longest key first, first line wins for a repeated key. A key
 * matches only as a whole word (`_` and letters count as part of a word), like the original.
 */
function compile(raw: string, separator: string): Replacement[] {
  const seen = new Set<string>()
  const entries: [string, string][] = []
  for (const line of raw.split('\n')) {
    const at = line.indexOf(separator)
    if (at < 0) continue
    const key = line.slice(0, at)
    if (!key || seen.has(key)) continue
    seen.add(key)
    entries.push([key, line.slice(at + 1)])
  }
  entries.sort((a, b) => b[0].length - a[0].length)

  return entries.map(([key, value]) => [
    new RegExp(`(?<![${LATIN_CHARS}_])${escapeRegExp(key)}(?![${LATIN_CHARS}_])`, 'g'),
    value
  ])
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
