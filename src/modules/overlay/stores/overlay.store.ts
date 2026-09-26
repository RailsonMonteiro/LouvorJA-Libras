import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { useSettingsStore } from '@/stores/settings.store'
import type { OverlayCommand, OverlayState } from '@/types/ipc'

/** The overlay window (see OverlayController in the main process) as the interface sees it. */
export const useOverlayStore = defineStore('overlay', () => {
  const settings = useSettingsStore()
  const state = ref<OverlayState>({ open: false, displayId: null, displays: [] })
  let started = false

  const open = computed(() => state.value.open)
  const displays = computed(() => state.value.displays)
  /** The screen that would be used now: the chosen one, or the one the app picks by itself. */
  const currentDisplay = computed(
    () => state.value.displays.find((display) => display.id === state.value.displayId) ?? null
  )

  /** Subscribes first and asks afterwards, so no change is lost in between. */
  async function init(): Promise<void> {
    if (started) return
    started = true
    api().overlay.onStateChange((next) => (state.value = next))
    state.value = await api().overlay.getState()
  }

  async function show(): Promise<void> {
    state.value = await api().overlay.open(settings.settings.overlayDisplayId)
  }

  async function hide(): Promise<void> {
    state.value = await api().overlay.close()
  }

  /** Remembers the screen and, if the overlay is open, moves it there. */
  async function chooseDisplay(id: number | null): Promise<void> {
    await settings.update('overlayDisplayId', id)
    if (state.value.open) await show()
  }

  /** Shows a number on each screen for a few seconds, to tell which is which. */
  function identify(): void {
    void api().overlay.identify()
  }

  /** Repeats a command in the overlay window (ignored by the main process while it is closed). */
  function mirror(command: OverlayCommand): void {
    if (state.value.open) void api().overlay.command(command)
  }

  return {
    state,
    open,
    displays,
    currentDisplay,
    init,
    show,
    hide,
    chooseDisplay,
    identify,
    mirror
  }
})
