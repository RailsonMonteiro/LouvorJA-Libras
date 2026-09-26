import type { OverlayDisplay } from '../../../src/types/ipc'

/** What is needed of a screen; `Electron.Display` has it (and more). */
export interface ScreenInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
}

/** "1 · 1920×1080": the position in the list and the size, as the person sees it in the system. */
export function describeDisplays(screens: ScreenInfo[], primaryId: number): OverlayDisplay[] {
  return screens.map((screen, index) => ({
    id: screen.id,
    label: `${index + 1} · ${screen.bounds.width}×${screen.bounds.height}`,
    width: screen.bounds.width,
    height: screen.bounds.height,
    primary: screen.id === primaryId
  }))
}

/**
 * The screen the overlay goes to: the one asked for if it still exists; otherwise a second screen
 * (the audience's, usually) or, with only one, that one.
 */
export function pickScreen<T extends ScreenInfo>(
  screens: T[],
  primaryId: number,
  requestedId: number | null
): T | null {
  if (screens.length === 0) return null
  const asked = screens.find((screen) => screen.id === requestedId)
  if (asked) return asked
  return screens.find((screen) => screen.id !== primaryId) ?? screens[0]!
}
