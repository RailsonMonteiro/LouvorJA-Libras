import { watch } from 'vue'
import type { useAvatarStore } from '@/modules/avatar/stores/avatar.store'

/** The avatar player takes a few seconds; beyond this the app opens without waiting for it. */
export const AVATAR_WAIT_MS = 20_000

/**
 * Resolves when the avatar player is ready to sign, or cannot be (not installed, failed to
 * start), or when `timeoutMs` has passed: the app must never stay on the opening screen for good.
 * `onProgress` gets the player's own loading progress (0 to 100).
 */
export function whenAvatarSettled(
  avatar: ReturnType<typeof useAvatarStore>,
  onProgress: (percent: number) => void,
  timeoutMs: number = AVATAR_WAIT_MS
): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let stop: (() => void) | null = null

    const finish = (): void => {
      if (timer) clearTimeout(timer)
      timer = null
      stop?.()
      resolve()
    }

    stop = watch(
      () => [avatar.status, avatar.progress] as const,
      ([status, progress]) => {
        onProgress(progress)
        if (status === 'ready' || status === 'unavailable' || status === 'error') finish()
      },
      { immediate: true }
    )
    timer = setTimeout(finish, timeoutMs)
  })
}

/** Runs the tasks together and reports how many have finished (for the progress bar). */
export async function runWithProgress(
  tasks: Array<() => Promise<unknown>>,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  let done = 0
  onProgress(0, tasks.length)
  await Promise.all(
    tasks.map(async (task) => {
      try {
        await task()
      } catch (error) {
        // A page that cannot be preloaded is loaded when it is opened (and retried there).
        console.warn('Preload failed', error)
      } finally {
        done += 1
        onProgress(done, tasks.length)
      }
    })
  )
}
