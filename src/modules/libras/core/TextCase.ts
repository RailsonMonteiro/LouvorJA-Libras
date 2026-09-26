/** Names that are always capitalised in Portuguese religious text. */
const SACRED_NAMES = ['deus', 'jesus', 'cristo', 'senhor', 'jeová', 'messias', 'emanuel']

const capitalise = (word: string): string =>
  word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR')

/**
 * LouvorJA sends slide text in UPPER CASE. Translators (the official one included) read
 * capitals as a hint for proper nouns and sentence starts, so an all-caps text gets its normal
 * casing back before it is translated. Text that already has lower-case letters is left alone.
 */
export function restoreCase(text: string): string {
  const upper = text.toLocaleUpperCase('pt-BR')
  const lower = text.toLocaleLowerCase('pt-BR')
  // Only touch text that is really all caps (and has letters at all).
  if (text !== upper || text === lower) return text

  let result = lower.replace(
    /(^\s*|[.!?]\s+)(\p{L})/gu,
    (_match, before: string, letter: string) => before + letter.toLocaleUpperCase('pt-BR')
  )
  for (const name of SACRED_NAMES) {
    result = result.replace(new RegExp(`(?<!\\p{L})${name}(?!\\p{L})`, 'giu'), capitalise)
  }
  return result.replace(/(?<!\p{L})espírito santo(?!\p{L})/giu, 'Espírito Santo')
}
