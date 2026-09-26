import { ref } from 'vue'

/** The sections of the settings page, one tab each. */
export const SETTINGS_SECTIONS = ['general', 'translator', 'overlay'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SETTINGS_SECTION_ICONS: Record<SettingsSection, string> = {
  general: 'mdi-tune',
  translator: 'mdi-hand-wave',
  overlay: 'mdi-layers-outline'
}

/** The open tab. It lives here, not in the page, so leaving and coming back finds the same one. */
export const openSection = ref<SettingsSection>('general')
