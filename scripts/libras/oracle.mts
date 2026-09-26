// Run with: npm run libras:oracle
// Asks the official VLibras translation service for the gloss of every sentence in
// tests/fixtures/libras/corpus.txt and stores the answers in tests/fixtures/libras/oracle.json.
//
// The answers are the reference ("oracle") used by `npm run libras:benchmark` to measure how close
// our own translator is to the official one. Nothing at runtime depends on this script.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const corpusPath = resolve(root, 'tests/fixtures/libras/corpus.txt')
const oraclePath = resolve(root, 'tests/fixtures/libras/oracle.json')
const endpoint = process.env.VLIBRAS_TRANSLATE_URL ?? 'https://traducao2.vlibras.gov.br/translate'

interface OracleFile {
  source: string
  generatedAt: string
  entries: Record<string, string>
}

const sentences = readFileSync(corpusPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

let previous: OracleFile | null = null
try {
  previous = JSON.parse(readFileSync(oraclePath, 'utf8')) as OracleFile
} catch {
  // first run
}
const entries: Record<string, string> = { ...previous?.entries }

let requested = 0
for (const text of sentences) {
  if (entries[text]) continue // already known: be gentle with the public service (300 requests/window)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30_000)
  })
  if (response.status === 429) {
    console.error('Rate limited - stopping (progress is kept)')
    break
  }
  if (!response.ok) {
    // The public service sometimes fails on a sentence; the next run tries it again.
    console.error(`HTTP ${response.status} for "${text}" - skipped`)
    continue
  }
  entries[text] = (await response.text()).trim()
  requested += 1
  console.log(`${text}  ->  ${entries[text]}`)
  await new Promise((resolve) => setTimeout(resolve, 400))
}

const out: OracleFile = {
  source: endpoint,
  generatedAt: new Date().toISOString(),
  entries
}
writeFileSync(oraclePath, JSON.stringify(out, null, 2) + '\n')
console.log(
  `\n${Object.keys(entries).length}/${sentences.length} sentences stored (${requested} requested now)`
)
