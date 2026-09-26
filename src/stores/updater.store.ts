import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import type { UpdaterState } from '@/types/ipc'

const IDLE: UpdaterState = { status: 'idle', version: null, progressPercent: null, error: null }

/** The auto-updater (see UpdaterService in the main process) as the interface sees it. */
export const useUpdaterStore = defineStore('updater', () => {
  const state = ref<UpdaterState>(IDLE)
  let started = false

  const checking = computed(
    () => state.value.status === 'checking' || state.value.status === 'downloading'
  )

  /** Subscribes first and asks afterwards, so a state the main process already reached (the
   *  silent check on startup, say) is not missed. */
  async function init(): Promise<void> {
    if (started) return
    started = true
    api().updater.onStateChange((next) => (state.value = next))
    state.value = await api().updater.getState()
  }

  async function check(): Promise<void> {
    state.value = await api().updater.check()
  }

  function install(): void {
    void api().updater.install()
  }

  return { state, checking, init, check, install }
})
