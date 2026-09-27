import { describe, expect, it } from 'vitest'
import {
  endpointKey,
  isValidHost,
  isValidPort,
  isValidToken,
  parseLouvorJALink
} from '@/modules/louvorja/types/louvorja.types'

describe('endpoint validation', () => {
  it.each([
    '192.168.0.10',
    '10.0.0.1',
    'localhost',
    'louvorja.local',
    'pc-igreja',
    'a.b.c.d.example.org'
  ])('accepts host %s', (host) => expect(isValidHost(host)).toBe(true))

  it.each([
    '',
    ' ',
    '999.1.1.1',
    '1.2.3',
    '192.168.0.10:8080',
    'host/path',
    'user@host',
    'host?x=1',
    'ho st',
    '-bad.example',
    'bad-.example',
    'http://host',
    '[::1]'
  ])('rejects host %j', (host) => expect(isValidHost(host)).toBe(false))

  it.each([1, 80, 8080, 65535])('accepts port %i', (port) => expect(isValidPort(port)).toBe(true))
  it.each([0, -1, 65536, 1.5, Number.NaN])('rejects port %s', (port) =>
    expect(isValidPort(port)).toBe(false)
  )

  it.each(['', 'AB12c', 'a.b_c-d~9'])('accepts token %j', (token) =>
    expect(isValidToken(token)).toBe(true)
  )
  it.each(['a b', 'x'.repeat(65), 'ab\ncd', 'não', 'a/b'])('rejects token %j', (token) =>
    expect(isValidToken(token)).toBe(false)
  )

  it('builds a case-insensitive endpoint key', () => {
    expect(endpointKey({ host: 'PC.Local', port: 7070 })).toBe('pc.local:7070')
  })
})

describe('parseLouvorJALink', () => {
  it('reads host, port and token from the link LouvorJA copies', () => {
    expect(parseLouvorJALink('http://192.168.0.10:7070/?token=aB12c')).toEqual({
      host: '192.168.0.10',
      port: 7070,
      token: 'aB12c'
    })
  })

  it('accepts a hostname, extra query params and no trailing slash', () => {
    expect(parseLouvorJALink('http://pc-igreja:7070?other=1&token=x9Z&more=2')).toEqual({
      host: 'pc-igreja',
      port: 7070,
      token: 'x9Z'
    })
  })

  it('decodes a percent-encoded token', () => {
    expect(parseLouvorJALink('http://127.0.0.1:7070/?token=a%2Bb')).toEqual({
      host: '127.0.0.1',
      port: 7070,
      token: 'a+b'
    })
  })

  it('still reads host and port without a token (same-machine link)', () => {
    expect(parseLouvorJALink('http://127.0.0.1:7070/')).toEqual({
      host: '127.0.0.1',
      port: 7070
    })
  })

  it('ignores surrounding whitespace, as a real paste would have', () => {
    expect(parseLouvorJALink('  http://192.168.0.10:7070/?token=aB12c\n')).toEqual({
      host: '192.168.0.10',
      port: 7070,
      token: 'aB12c'
    })
  })

  it.each([
    'AB12c',
    '192.168.0.10',
    'not a link at all',
    'http://192.168.0.10:999999/?token=x',
    ''
  ])('returns null for %j (a plain paste, not a link)', (text) =>
    expect(parseLouvorJALink(text)).toBeNull()
  )
})
