import { describe, expect, it } from 'vitest'
import {
  classifyToken,
  formatGloss,
  normalizeGloss,
  parseGloss,
  textKey
} from '@/modules/libras/core/GlossParser'
import { SignCatalog, extractSignsFromTrie } from '@/modules/libras/dictionary/SignCatalog'

describe('gloss parser', () => {
  it('classifies the token forms used by VLibras', () => {
    expect(classifyToken('AMOR')).toBe('plain')
    expect(classifyToken('ESPÍRITO_SANTO')).toBe('compound')
    expect(classifyToken('1S_AJUDAR_2S')).toBe('directional')
    expect(classifyToken('3P_DAR_1S')).toBe('directional')
    expect(classifyToken('ABAIXAR&OBJETO')).toBe('disambiguated')
    expect(classifyToken('TERCEIRO&ORDINAL')).toBe('disambiguated')
    expect(classifyToken('300')).toBe('number')
    expect(classifyToken('3,5')).toBe('number')
  })

  it('splits a gloss into tokens and joins it back', () => {
    const tokens = parseGloss('  DEUS   AMOR AMAR  NÓS ')
    expect(tokens.map((t) => t.text)).toEqual(['DEUS', 'AMOR', 'AMAR', 'NÓS'])
    expect(tokens.every((t) => t.availability === 'unknown')).toBe(true)
    expect(formatGloss(tokens)).toBe('DEUS AMOR AMAR NÓS')
    expect(parseGloss('')).toEqual([])
  })

  it('cleans a gloss typed by a person', () => {
    expect(normalizeGloss('  deus   amor,  amar!  nós ')).toBe('DEUS AMOR, AMAR NÓS')
    expect(normalizeGloss('espírito_santo ; 1s_ajudar_2s')).toBe('ESPÍRITO_SANTO 1S_AJUDAR_2S')
    expect(normalizeGloss('a<script>b')).toBe('A SCRIPT B')
  })

  it('builds a cache key that ignores case and spacing', () => {
    expect(textKey('  Deus   É  Amor ')).toBe('deus é amor')
    expect(textKey('DEUS É AMOR')).toBe(textKey('deus é amor'))
  })
})

describe('sign catalog', () => {
  const trie = {
    root: {
      children: {
        A: {
          end: true,
          children: {
            M: {
              children: {
                O: { end: true, children: {} },
                A: { end: false, children: { R: { end: true } } }
              }
            }
          }
        },
        D: { children: { E: { children: { U: { children: { S: { end: true } } } } } } },
        '1': { end: true },
        '3': { end: true },
        '0': { end: true }
      }
    }
  }

  it('lists every sign stored in the trie index', () => {
    expect(extractSignsFromTrie(trie)).toEqual(['0', '1', '3', 'A', 'AMAR', 'AMO', 'DEUS'])
  })

  it('rejects an index with an unexpected shape', () => {
    expect(() => extractSignsFromTrie({})).toThrow(/root/)
    expect(() => extractSignsFromTrie(null)).toThrow()
  })

  it('tells whether a token is a sign, can be spelled, or is missing', () => {
    const catalog = new SignCatalog([
      'DEUS',
      'A',
      'M',
      'O',
      'R',
      'Ç',
      'C',
      'E',
      '3',
      '0',
      'ESPÍRITO_SANTO'
    ])
    expect(catalog.availability('DEUS')).toBe('sign')
    expect(catalog.availability('ESPÍRITO_SANTO')).toBe('sign')
    expect(catalog.availability('AMOR')).toBe('spelled') // no sign of its own, letters exist
    expect(catalog.availability('300')).toBe('spelled') // numbers are spelled digit by digit
    expect(catalog.availability('AMOR&X')).toBe('missing')
    expect(catalog.availability('JESUS')).toBe('missing') // J, S, U have no letter sign here
    expect(catalog.availability('50%')).toBe('missing')
  })

  it('says "unknown" while the catalog is empty', () => {
    const empty = new SignCatalog()
    expect(empty.ready).toBe(false)
    expect(empty.availability('DEUS')).toBe('unknown')
  })

  it('annotates a token list without changing the original', () => {
    const catalog = new SignCatalog(['DEUS'])
    const tokens = parseGloss('DEUS ZZZ')
    const annotated = catalog.annotate(tokens)
    expect(annotated.map((t) => t.availability)).toEqual(['sign', 'missing'])
    expect(tokens[0]?.availability).toBe('unknown')
  })
})
