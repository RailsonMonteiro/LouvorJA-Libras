import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'
import type { AppInfo } from '@/types/ipc'

export const useAppStore = defineStore('app', () => {
  const info = ref<AppInfo | null>(null)

  async function load(): Promise<void> {
    info.value = await api().app.getInfo()
  }

  return { info, load }
})
