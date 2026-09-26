/**
 * The opening screen lives in index.html (so it is on screen before any script runs). These
 * functions only move its progress bar and take it away.
 */

const FADE_MS = 400

/** Moves the bar (0 to 100), shows it as a percentage, and, when given, changes the status line. */
export function setSplash(percent: number, status?: string): void {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const bar = document.getElementById('splash-progress')
  if (bar) bar.style.width = `${clamped}%`
  const number = document.getElementById('splash-percent')
  if (number) number.textContent = `${clamped}%`
  if (status !== undefined) {
    const text = document.getElementById('splash-status')
    if (text) text.textContent = status
  }
}

/** Fades the opening screen out and removes it. Safe to call when it is already gone. */
export function hideSplash(): Promise<void> {
  const splash = document.getElementById('splash')
  if (!splash) return Promise.resolve()
  setSplash(100)
  splash.classList.add('leaving')
  return new Promise((resolve) => {
    setTimeout(() => {
      splash.remove()
      resolve()
    }, FADE_MS)
  })
}

/** Removes it at once, without a transition (windows that never show it, like the overlay). */
export function removeSplash(): void {
  document.getElementById('splash')?.remove()
}
