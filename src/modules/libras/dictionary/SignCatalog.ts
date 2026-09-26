import type { GlossToken, TokenAvailability } from '../types/libras.types'

/** Shape of the public sign index: a trie where `end: true` marks the end of a sign name. */
interface TrieNode {
  end?: boolean
  children?: Record<string, TrieNode>
}

/** Lists every sign name stored in the VLibras trie index (iterative: names can be long). */
export function extractSignsFromTrie(index: unknown): string[] {
  const root = (index as { root?: TrieNode } | null)?.root
  if (!root) throw new Error('Unexpected sign index format (no "root")')

  const signs: string[] = []
  const stack: Array<[TrieNode, string]> = [[root, '']]
  while (stack.length > 0) {
    const [node, prefix] = stack.pop()!
    if (node.end && prefix) signs.push(prefix)
    for (const [char, child] of Object.entries(node.children ?? {})) {
      stack.push([child, prefix + char])
    }
  }
  return signs.sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

const SPELLABLE = /^[A-ZÇ0-9]+$/

/**
 * The set of signs the player can perform. A word without its own sign is not lost: it is
 * fingerspelled, and so is any number, as long as every letter or digit has a sign.
 */
export class SignCatalog {
  private readonly signs: Set<string>

  constructor(signs: Iterable<string> = []) {
    this.signs = new Set(signs)
  }

  get size(): number {
    return this.signs.size
  }

  get ready(): boolean {
    return this.signs.size > 0
  }

  has(sign: string): boolean {
    return this.signs.has(sign)
  }

  availability(token: string): TokenAvailability {
    if (!this.ready) return 'unknown'
    if (this.signs.has(token)) return 'sign'
    // "%" and accents have no letter sign: only plain letters and digits can be spelled.
    const letters = token.normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (SPELLABLE.test(letters) && [...letters].every((char) => this.signs.has(char))) {
      return 'spelled'
    }
    return 'missing'
  }

  annotate(tokens: GlossToken[]): GlossToken[] {
    return tokens.map((token) => ({ ...token, availability: this.availability(token.text) }))
  }
}
