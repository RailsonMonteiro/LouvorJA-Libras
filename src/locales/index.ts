import { createI18n } from 'vue-i18n'
import { DEFAULT_SETTINGS, type AppLocale } from '@/types/settings'
import en from './en.json'
import es from './es.json'
import ptBR from './pt-BR.json'

export type MessageSchema = typeof ptBR

/** Display name and flag (ISO 3166 country code) of each supported language. */
export const localeInfo: Record<AppLocale, { name: string; flag: string }> = {
  'pt-BR': { name: 'Português (Brasil)', flag: 'br' },
  es: { name: 'Español', flag: 'es' },
  en: { name: 'English', flag: 'us' }
}

export const i18n = createI18n<[MessageSchema], AppLocale>({
  legacy: false,
  locale: DEFAULT_SETTINGS.locale,
  fallbackLocale: 'en',
  messages: { 'pt-BR': ptBR, es, en }
})
