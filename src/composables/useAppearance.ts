import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, useLocale } from 'vuetify'
import { useSettingsStore } from '@/stores/settings.store'
import type { AppLocale } from '@/types/settings'

const vuetifyLocales: Record<AppLocale, string> = { 'pt-BR': 'pt', es: 'es', en: 'en' }

/** Keeps vue-i18n, Vuetify's locale/theme and <html lang> in sync with the stored settings. */
export function useAppearance(): void {
  const { settings } = storeToRefs(useSettingsStore())
  const { locale } = useI18n()
  const theme = useTheme()
  const vuetifyLocale = useLocale()

  watch(
    () => settings.value.locale,
    (value) => {
      locale.value = value
      vuetifyLocale.current.value = vuetifyLocales[value]
      document.documentElement.lang = value
    },
    { immediate: true }
  )

  watch(
    () => settings.value.theme,
    (value) => theme.change(value),
    { immediate: true }
  )
}
