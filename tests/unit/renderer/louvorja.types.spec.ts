import { describe, expect, it } from 'vitest'
import {
  endpointKey,
  isValidHost,
  isValidPort,
  isValidToken
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
