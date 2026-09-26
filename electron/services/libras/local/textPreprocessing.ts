/**
 * Cleans the text before translation: stray symbols, decimal separators and commas that are not
 * inside numbers. Port of `char_preprocessing.py` of vlibras-translate (LAViD/UFPB, LGPL-3.0).
 */

export const LATIN_CHARS = 'A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇa-záéíóúàâêôãõüç'

/** Symbols that never carry meaning for the signs. */
const USELESS_CHARS = '\\/{}*"\':;@¹²³£#$%¢¨¬§|“”«»–’‘'
/** Removed too, except when the text is already a gloss. */
const BRACKETS_AND_JOINERS = '[]()+_&'

export function preprocess(sentence: string): string {
  let text = fixDecimals(sentence)
  // Some ordinal numbers use "°".
  text = text.replaceAll('°', 'º')
  return removeUselessChars(text)
}

function fixDecimals(sentence: string): string {
  // Commas that are not followed by a digit are just punctuation.
  let text = sentence.replace(/,(?=\D)|,$/g, '')
  // ".5" or ",5" -> "0,5"
  text = text.replace(/^[.,](?=\d)|(?<=\s)[.,](?=\d)/g, '0,')
  // Numbers keep one decimal separator (a comma) and lose the thousands separators.
  return text.replace(/\d+[.,\d]+\d+/g, keepOnlyDecimalSeparator)
}

function keepOnlyDecimalSeparator(number: string): string {
  const commas = (number.match(/,/g) ?? []).length
  const dots = (number.match(/\./g) ?? []).length

  if (dots > 0 && commas > 0) {
    // "1.234,56": dots group thousands, the last comma is the decimal separator.
    const withoutDots = number.replaceAll('.', '')
    const last = withoutDots.lastIndexOf(',')
    return withoutDots.slice(0, last).replaceAll(',', '') + '.' + withoutDots.slice(last + 1)
  }
  if (commas > 0) return number.replaceAll(',', '.')
  if (dots > 1) return number.replaceAll('.', '')
  return number
}

function removeUselessChars(sentence: string): string {
  const chars = USELESS_CHARS + BRACKETS_AND_JOINERS
  let text = ''
  for (const char of sentence) if (!chars.includes(char)) text += char

  // "amor--vida" -> "amor-vida"
  text = text.replace(new RegExp(`([${LATIN_CHARS}]+)-{2,}([${LATIN_CHARS}]+)`, 'g'), '$1-$2')
  // Only "word-word" hyphens stay.
  text = text.replace(/((^|\b|\s+)[-\s]+(-\b|\s+|$))/g, ' ')
  return text.replace(/(?<=\d)-(?=\d)/g, '')
}

/**
 * "amar-te" -> "amar", "dá-lo-ei" -> "dá": drops the pronouns glued to a verb with a hyphen.
 */
export function removeEnclise(word: string): string {
  return word.replace(
    new RegExp(
      `([${LATIN_CHARS}]+)-(lhes|lhe|nas|nos|vos|as|me|no|na|os|se|te|a|o)(-([${LATIN_CHARS}]+)|(?![${LATIN_CHARS}]))`,
      'g'
    ),
    (_match, verb: string, _pronoun: string, _tail: string, rest?: string) => verb + (rest ?? '')
  )
}
