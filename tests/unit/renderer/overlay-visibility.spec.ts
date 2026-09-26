import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  OVERLAY_HOLD_MS,
  useOverlayVisibility
} from '@/modules/overlay/composables/useOverlayVisibility'

describe('useOverlayVisibility', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is always visible when the avatar is not meant to hide', () => {
    const active = ref(false)
    const only = ref(false)
    const visible = useOverlayVisibility(active, only)
    expect(visible.value).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(visible.value).toBe(true)
  })

  it('starts hidden and shows the avatar the moment it starts signing', () => {
    const active = ref(false)
    const visible = useOverlayVisibility(active, ref(true))
    vi.advanceTimersByTime(OVERLAY_HOLD_MS + 1)
    expect(visible.value).toBe(false)

    active.value = true
    expect(visible.value).toBe(true)
  })

  it('stays a little after the last sign, then goes away', () => {
    const active = ref(true)
    const visible = useOverlayVisibility(active, ref(true))
    expect(visible.value).toBe(true)

    active.value = false
    vi.advanceTimersByTime(OVERLAY_HOLD_MS - 1)
    expect(visible.value).toBe(true)
    vi.advanceTimersByTime(2)
    expect(visible.value).toBe(false)
  })

  it('does not hide if the next slide starts before the pause is over', () => {
    const active = ref(true)
    const visible = useOverlayVisibility(active, ref(true))

    active.value = false
    vi.advanceTimersByTime(OVERLAY_HOLD_MS - 100)
    active.value = true // next slide
    vi.advanceTimersByTime(OVERLAY_HOLD_MS * 3)
    expect(visible.value).toBe(true)

    active.value = false
    vi.advanceTimersByTime(OVERLAY_HOLD_MS + 1)
    expect(visible.value).toBe(false)
  })

  it('follows the setting when it is changed while the overlay is open', () => {
    const active = ref(false)
    const only = ref(true)
    const visible = useOverlayVisibility(active, only)
    vi.advanceTimersByTime(OVERLAY_HOLD_MS + 1)
    expect(visible.value).toBe(false)

    only.value = false
    expect(visible.value).toBe(true)

    only.value = true
    vi.advanceTimersByTime(OVERLAY_HOLD_MS + 1)
    expect(visible.value).toBe(false)
  })
})
