import { describe, expect, it } from 'vitest'
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import ptBR from '@/locales/pt-BR.json'
import { i18n, localeInfo } from '@/locales'
import { APP_LOCALES } from '@/types/settings'

function keys(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  )
}

describe('locales', () => {
  it('supports exactly Portuguese, Spanish and English', () => {
    expect([...APP_LOCALES]).toEqual(['pt-BR', 'es', 'en'])
    expect(Object.keys(localeInfo).sort()).toEqual([...APP_LOCALES].sort())
    expect([...i18n.global.availableLocales].sort()).toEqual([...APP_LOCALES].sort())
  })

  it.each([
    ['es', es],
    ['en', en]
  ])('%s has the same keys as pt-BR', (_name, messages) => {
    expect(keys(messages).sort()).toEqual(keys(ptBR).sort())
  })

  it('has no empty translations', () => {
    for (const messages of [ptBR, es, en]) {
      for (const key of keys(messages)) {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as never)[part], messages)
        expect(value, key).not.toBe('')
      }
    }
  })
})
