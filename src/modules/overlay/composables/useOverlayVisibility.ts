import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** How long the avatar stays after the last text, so it does not vanish in mid-gesture. */
export const OVERLAY_HOLD_MS = 1500

/**
 * Whether the overlay shows the avatar. With `onlyDuringPresentation` on it appears when the
 * presentation starts (`active`) and goes away `holdMs` after it ends; with it off it is always there.
 */
export function useOverlayVisibility(
  active: Ref<boolean>,
  onlyDuringPresentation: Ref<boolean>,
  holdMs: number = OVERLAY_HOLD_MS
): Ref<boolean> {
  const visible = ref(!onlyDuringPresentation.value || active.value)
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  watch(
    [active, onlyDuringPresentation],
    ([isActive, only]) => {
      cancel()
      if (!only || isActive) {
        visible.value = true
      } else {
        timer = setTimeout(() => {
          visible.value = false
          timer = null
        }, holdMs)
      }
    },
    { flush: 'sync' }
  )

  if (getCurrentInstance()) onBeforeUnmount(cancel)
  return visible
}
