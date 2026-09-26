// Run with: npm run libras:benchmark
// Compares a translation engine with the official VLibras answers stored in
// tests/fixtures/libras/oracle.json (create it with `npm run libras:oracle`).
//
// The plain-words fallback is the BASELINE that every real engine has to beat. Add new engines to
// `engines` and compare.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FallbackEngine } from '../../electron/services/libras/engines/FallbackEngine.ts'
import { LocalRulesEngine } from '../../electron/services/libras/local/LocalRulesEngine.ts'
import { DEFAULT_SIGNS_INDEX_URL } from '../../src/modules/libras/types/libras.types.ts'
import { extractSignsFromTrie } from '../../src/modules/libras/dictionary/SignCatalog.ts'
import type { GlossEngine } from '../../electron/services/libras/engines/GlossEngine.ts'

const root = resolve(import.meta.dirname, '../..')
const oracle = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/libras/oracle.json'), 'utf8'))
  .entries as Record<string, string>

// The sign catalog is the local engine's dictionary for verbs and plurals. It is downloaded here
// the way the app does it (pass --no-catalog to skip it and measure the engine without one).
async function loadSigns(): Promise<Set<string> | null> {
  if (process.argv.includes('--no-catalog')) return null
  try {
    const response = await fetch(DEFAULT_SIGNS_INDEX_URL, { signal: AbortSignal.timeout(60_000) })
    return new Set(extractSignsFromTrie(await response.json()))
  } catch (error) {
    console.warn(`(sign catalog not available: ${(error as Error).message})`)
    return null
  }
}
const signs = await loadSigns()

const engines: Array<[label: string, engine: GlossEngine]> = [
  ['plain words', new FallbackEngine()],
  ['local rules, no catalog', new LocalRulesEngine()],
  ...(signs
    ? [
        [
          'local rules + sign catalog',
          new LocalRulesEngine({ catalog: () => ({ ready: true, has: (sign) => signs.has(sign) }) })
        ] as [string, GlossEngine]
      ]
    : [])
]
const verbose = process.argv.includes('--verbose')

const tokens = (gloss: string): string[] => gloss.split(/\s+/).filter(Boolean)

/** Multiset overlap of two token lists (each token counted as often as it appears in both). */
function overlap(a: string[], b: string[]): number {
  const counts = new Map<string, number>()
  for (const token of b) counts.set(token, (counts.get(token) ?? 0) + 1)
  let shared = 0
  for (const token of a) {
    const left = counts.get(token) ?? 0
    if (left > 0) {
      shared += 1
      counts.set(token, left - 1)
    }
  }
  return shared
}

for (const [label, engine] of engines) {
  let exact = 0
  let shared = 0
  let produced = 0
  let expected = 0
  const misses: string[] = []

  for (const [text, reference] of Object.entries(oracle)) {
    const gloss = await engine.translate(text)
    const got = tokens(gloss)
    const want = tokens(reference)
    if (gloss === reference) exact += 1
    else misses.push(`${text}\n    want: ${reference}\n    got:  ${gloss}`)
    shared += overlap(got, want)
    produced += got.length
    expected += want.length
  }

  const total = Object.keys(oracle).length
  const precision = produced ? shared / produced : 0
  const recall = expected ? shared / expected : 0
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
  const pct = (value: number): string => `${(value * 100).toFixed(1)}%`

  console.log(`
Engine "${label}" (${engine.id}) against ${total} official glosses`)
  console.log(`  exact sentence match : ${exact}/${total} (${pct(exact / total)})`)
  console.log(`  token precision      : ${pct(precision)}`)
  console.log(`  token recall         : ${pct(recall)}`)
  console.log(`  token F1             : ${pct(f1)}`)
  if (verbose) console.log(`\n${misses.join('\n')}`)
}
