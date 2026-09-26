import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import {
  AVATARS,
  AVATAR_POSITIONS,
  AVATAR_SPEEDS,
  REGION_CODES,
  type AvatarSpeed
} from '../../src/modules/avatar/types/avatar.types'
import { isHttpUrl } from '../../src/modules/libras/types/libras.types'
import {
  APP_LOCALES,
  INTERPRET_DELAY_RANGE,
  AVATAR_SCALE_RANGE,
  DEFAULT_SETTINGS,
  THEME_MODES,
  type AppSettings
} from '../../src/types/settings'

const httpUrl = z.string().trim().max(300).refine(isHttpUrl, 'Must be an http(s) URL')

/** A base address is always kept with a trailing slash, so file names can be appended to it. */
const baseUrl = httpUrl.transform((value) => (value.endsWith('/') ? value : `${value}/`))

export const settingSchemas = {
  theme: z.enum(THEME_MODES),
  locale: z.enum(APP_LOCALES),
  sidebarPinned: z.boolean(),
  autoConnect: z.boolean(),
  runInBackground: z.boolean(),
  onlineTranslator: z.boolean(),
  translatorUrl: httpUrl,
  signsIndexUrl: httpUrl,
  avatar: z.enum(AVATARS),
  avatarSpeed: z
    .number()
    .refine((value): value is AvatarSpeed => AVATAR_SPEEDS.includes(value as AvatarSpeed)),
  signRegion: z.enum(REGION_CODES),
  autoInterpret: z.boolean(),
  interpretDelay: z
    .number()
    .min(INTERPRET_DELAY_RANGE.min)
    .max(INTERPRET_DELAY_RANGE.max)
    // Half seconds are the finest the settings page offers.
    .refine((value) => Number.isInteger(value * 2), 'Must be a multiple of 0.5'),
  avatarPosition: z.enum(AVATAR_POSITIONS),
  avatarScale: z.number().int().min(AVATAR_SCALE_RANGE.min).max(AVATAR_SCALE_RANGE.max),
  stageShowSlide: z.boolean(),
  dictionaryUrl: baseUrl,
  overlayDisplayId: z.number().int().nonnegative().nullable(),
  overlayAutoOpen: z.boolean(),
  overlayOnlyDuringPresentation: z.boolean()
} satisfies { [K in keyof AppSettings]: z.ZodType<AppSettings[K]> }

export class SettingsService {
  constructor(private readonly db: DatabaseSync) {}

  /** Stored values merged over the defaults. Invalid stored values fall back to the default. */
  getAll(): AppSettings {
    const settings: AppSettings = { ...DEFAULT_SETTINGS }
    const rows = this.db.prepare('SELECT key, value FROM settings').all()

    for (const row of rows) {
      const key = String(row.key)
      if (!isSettingKey(key)) continue
      try {
        const parsed = settingSchemas[key].safeParse(JSON.parse(String(row.value)))
        if (parsed.success) assign(settings, key, parsed.data)
      } catch {
        // Corrupted JSON: keep the default.
      }
    }
    return settings
  }

  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): AppSettings {
    const parsed = settingSchemas[key].parse(value)
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      )
      .run(key, JSON.stringify(parsed))
    return this.getAll()
  }
}

export function isSettingKey(key: string): key is keyof AppSettings {
  return key in settingSchemas
}

function assign<K extends keyof AppSettings>(target: AppSettings, key: K, value: unknown): void {
  target[key] = value as AppSettings[K]
}
