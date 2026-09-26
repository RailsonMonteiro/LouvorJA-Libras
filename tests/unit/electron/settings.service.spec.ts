import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../../electron/services/DatabaseService'
import { LogService } from '../../../electron/services/LogService'
import { SettingsService } from '../../../electron/services/SettingsService'
import { DEFAULT_SETTINGS } from '../../../src/types/settings'

describe('SettingsService', () => {
  it('returns the defaults on an empty database', () => {
    const service = new SettingsService(openDatabase(':memory:'))
    expect(service.getAll()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists and overwrites values', () => {
    const service = new SettingsService(openDatabase(':memory:'))
    service.set('theme', 'dark')
    expect(service.set('theme', 'light').theme).toBe('light')
    expect(service.set('locale', 'en').locale).toBe('en')
  })

  it('rejects invalid values', () => {
    const service = new SettingsService(openDatabase(':memory:'))
    expect(() => service.set('theme', 'neon' as never)).toThrow()
    expect(() => service.set('locale', 'fr' as never)).toThrow()
    expect(() => service.set('sidebarPinned', 'yes' as never)).toThrow()
  })

  it('stores the sidebar pin state', () => {
    const service = new SettingsService(openDatabase(':memory:'))
    expect(service.getAll().sidebarPinned).toBe(true)
    expect(service.set('sidebarPinned', false).sidebarPinned).toBe(false)
  })

  it('falls back to the default when a stored value is invalid or corrupted', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('theme', '"neon"')
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('locale', '{not json')
    expect(new SettingsService(db).getAll()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('SettingsService avatar settings', () => {
  const make = () => new SettingsService(openDatabase(':memory:'))

  it('has sensible avatar defaults', () => {
    expect(make().getAll()).toMatchObject({
      avatar: 'icaro',
      avatarSpeed: 1,
      signRegion: 'BR',
      autoInterpret: true,
      avatarPosition: 'right',
      avatarScale: 90,
      stageShowSlide: true
    })
  })

  it('stores valid choices', () => {
    const service = make()
    expect(service.set('avatar', 'hosana').avatar).toBe('hosana')
    expect(service.set('avatarSpeed', 2.5).avatarSpeed).toBe(2.5)
    expect(service.set('signRegion', 'SP').signRegion).toBe('SP')
    expect(service.set('avatarPosition', 'left').avatarPosition).toBe('left')
    expect(service.set('avatarScale', 30).avatarScale).toBe(30)
  })

  it('rejects values outside what the player offers', () => {
    const service = make()
    expect(() => service.set('avatar', 'robo' as never)).toThrow()
    expect(() => service.set('avatarSpeed', 3 as never)).toThrow()
    expect(() => service.set('signRegion', 'XX' as never)).toThrow()
    expect(() => service.set('avatarPosition', 'top' as never)).toThrow()
    expect(() => service.set('avatarScale', 10)).toThrow()
    expect(() => service.set('avatarScale', 101)).toThrow()
  })

  it('always keeps a trailing slash on the dictionary address and refuses non-http ones', () => {
    const service = make()
    expect(service.set('dictionaryUrl', 'https://example.org/signs').dictionaryUrl).toBe(
      'https://example.org/signs/'
    )
    expect(() => service.set('dictionaryUrl', 'file:///c:/signs/')).toThrow()
    expect(() => service.set('dictionaryUrl', 'not a url')).toThrow()
  })
})

describe('LogService', () => {
  it('stores entries and prunes old ones', () => {
    const db = openDatabase(':memory:')
    const logs = new LogService(db)
    logs.info('test', 'recent', { a: 1 })
    db.prepare(
      "INSERT INTO logs (level, scope, message, created_at) VALUES ('info', 'test', 'old', '2000-01-01T00:00:00.000Z')"
    ).run()

    expect(logs.prune(30)).toBe(1)
    const rows = db.prepare('SELECT message FROM logs').all()
    expect(rows.map((row) => row.message)).toEqual(['recent'])
  })
})

describe('SettingsService interpretation delay', () => {
  const make = () => new SettingsService(openDatabase(':memory:'))

  it('starts without delay and stores whole and half seconds, both to delay and to advance', () => {
    const service = make()
    expect(service.getAll().interpretDelay).toBe(0)
    expect(service.set('interpretDelay', 3).interpretDelay).toBe(3)
    expect(service.set('interpretDelay', 2.5).interpretDelay).toBe(2.5)
    expect(service.set('interpretDelay', 15).interpretDelay).toBe(15)
    expect(service.set('interpretDelay', -1).interpretDelay).toBe(-1)
    expect(service.set('interpretDelay', -2.5).interpretDelay).toBe(-2.5)
  })

  it('rejects values past either end and odd values', () => {
    const service = make()
    expect(() => service.set('interpretDelay', -3)).toThrow()
    expect(() => service.set('interpretDelay', 16)).toThrow()
    expect(() => service.set('interpretDelay', 1.3)).toThrow()
    expect(() => service.set('interpretDelay', '3' as never)).toThrow()
  })
})

describe('SettingsService overlay settings', () => {
  const make = () => new SettingsService(openDatabase(':memory:'))

  it('starts with an automatic screen and no auto-open', () => {
    expect(make().getAll()).toMatchObject({
      overlayDisplayId: null,
      overlayAutoOpen: false,
      overlayOnlyDuringPresentation: true
    })
  })

  it('stores a screen and goes back to automatic', () => {
    const service = make()
    expect(service.set('overlayDisplayId', 2528732444).overlayDisplayId).toBe(2528732444)
    expect(service.set('overlayDisplayId', null).overlayDisplayId).toBeNull()
    expect(service.set('overlayAutoOpen', true).overlayAutoOpen).toBe(true)
  })

  it('rejects an invalid screen', () => {
    const service = make()
    expect(() => service.set('overlayDisplayId', -1)).toThrow()
    expect(() => service.set('overlayDisplayId', 1.5)).toThrow()
    expect(() => service.set('overlayDisplayId', '1' as never)).toThrow()
  })
})
