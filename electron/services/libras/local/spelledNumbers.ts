/**
 * Numbers written in words become digits: "três" -> "3", "trezentos e vinte e um" -> "321",
 * "dois mil" -> "2000". The official translator does the same before anything else, and the
 * signs for numbers are made from digits.
 *
 * Only whole numbers up to the billions are handled. "um" and "uma" are numbers only inside a
 * longer expression ("vinte e um", "um milhão"); alone they are articles.
 */

const UNITS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  três: 3,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900
}

/** Multipliers: "dois mil", "três milhões". */
const SCALES: Record<string, number> = {
  mil: 1_000,
  milhão: 1_000_000,
  milhao: 1_000_000,
  milhões: 1_000_000,
  milhoes: 1_000_000,
  bilhão: 1_000_000_000,
  bilhao: 1_000_000_000,
  bilhões: 1_000_000_000,
  bilhoes: 1_000_000_000
}

const isNumberWord = (word: string): boolean => word in UNITS || word in SCALES

/**
 * Replaces every run of number words in `words` (lower case) with its digits.
 * A run is number words joined by "e" ("cento e vinte e três").
 */
export function replaceSpelledNumbers(words: string[]): string[] {
  const out: string[] = []
  let index = 0

  while (index < words.length) {
    const word = words[index]!
    if (!isNumberWord(word)) {
      out.push(word)
      index += 1
      continue
    }

    // Collect the run: number words, with a single "e" allowed between two of them.
    let end = index + 1
    while (end < words.length) {
      const next = words[end]!
      if (isNumberWord(next)) end += 1
      else if (next === 'e' && end + 1 < words.length && isNumberWord(words[end + 1]!)) end += 2
      else break
    }

    const run = words.slice(index, end).filter((item) => item !== 'e')
    const alone = run.length === 1 && (word === 'um' || word === 'uma')
    if (alone) out.push(word)
    else out.push(...runToDigits(run))
    index = end
  }

  return out
}

/** "dois mil e trezentos" -> ["2300"]. A run that does not read as one number is split. */
function runToDigits(run: string[]): string[] {
  let total = 0
  let current = 0
  let previousScale = Infinity

  for (const word of run) {
    const scale = SCALES[word]
    if (scale !== undefined) {
      // "mil" after "milhão" is fine ("um milhão e duzentos mil"); the reverse is not one number.
      if (scale > previousScale) return run.flatMap((item) => runToDigits([item]))
      total += (current === 0 ? 1 : current) * scale
      current = 0
      previousScale = scale
    } else {
      current += UNITS[word]!
    }
  }
  return [String(total + current)]
}
