import { describe, expect, it } from 'vitest'
import { restoreCase } from '@/modules/libras/core/TextCase'

describe('restoreCase', () => {
  it('gives sentence casing back to LouvorJA all-caps text', () => {
    expect(restoreCase('O SENHOR É O MEU PASTOR')).toBe('O Senhor é o meu pastor')
    expect(restoreCase('GLÓRIA A DEUS NAS ALTURAS')).toBe('Glória a Deus nas alturas')
    expect(restoreCase('CORO\nDEUS É AMOR')).toBe('Coro\ndeus é amor'.replace('deus', 'Deus'))
  })

  it('capitalises after a sentence end and keeps sacred names capitalised', () => {
    expect(restoreCase('JESUS VIVE. CRISTO REINA! O ESPÍRITO SANTO NOS GUIA')).toBe(
      'Jesus vive. Cristo reina! O Espírito Santo nos guia'
    )
    // Not inside other words.
    expect(restoreCase('DEUSES E SENHORIO')).toBe('Deuses e senhorio')
  })

  it('leaves text that is not all caps exactly as it is', () => {
    expect(restoreCase('Deus é amor')).toBe('Deus é amor')
    expect(restoreCase('deus é amor')).toBe('deus é amor')
    expect(restoreCase('Amém, ALELUIA')).toBe('Amém, ALELUIA')
  })

  it('does nothing without letters', () => {
    expect(restoreCase('')).toBe('')
    expect(restoreCase('123 ... 45')).toBe('123 ... 45')
  })
})
