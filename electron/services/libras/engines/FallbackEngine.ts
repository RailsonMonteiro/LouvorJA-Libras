import type { GlossEngine } from './GlossEngine'

/**
 * The last resort, and what the official VLibras player also does when translation fails: the
 * words themselves, upper case, without punctuation. It is not a real translation (no grammar,
 * no verb forms), so its result is flagged as such and never cached.
 */
export class FallbackEngine implements GlossEngine {
  readonly id = 'fallback'

  translate(text: string): Promise<string> {
    const words = text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []
    return Promise.resolve(words.map((word) => word.toLocaleUpperCase('pt-BR')).join(' '))
  }
}
