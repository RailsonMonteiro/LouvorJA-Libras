import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/settings'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })

  async function load(): Promise<void> {
    settings.value = await api().settings.getAll()
  }

  /** Follows changes made in any other window (the overlay shows what the main window sets). */
  function watchChanges(): void {
    api().settings.onChange((all) => (settings.value = all))
  }

  async function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    settings.value = await api().settings.set(key, value)
  }

  return { settings, load, watchChanges, update }
})
