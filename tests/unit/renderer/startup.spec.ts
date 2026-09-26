// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { hideSplash, removeSplash, setSplash } from '@/app/splash'
import { AVATAR_WAIT_MS, runWithProgress, whenAvatarSettled } from '@/app/startup'

const avatarLike = (status: string, progress = 0) =>
  reactive({ status, progress }) as unknown as Parameters<typeof whenAvatarSettled>[0]

describe('whenAvatarSettled', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits while the player loads and reports its progress', async () => {
    const avatar = avatarLike('loading', 10)
    const progress: number[] = []
    const settled = vi.fn()
    void whenAvatarSettled(avatar, (p) => progress.push(p)).then(settled)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(settled).not.toHaveBeenCalled()

    avatar.progress = 60
    await vi.advanceTimersByTimeAsync(0)
    expect(progress).toEqual([10, 60])
    expect(settled).not.toHaveBeenCalled()

    avatar.progress = 100
    avatar.status = 'ready'
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalled()
  })

  it.each(['ready', 'unavailable', 'error'])(
    'does not wait when the player is %s',
    async (status) => {
      const settled = vi.fn()
      void whenAvatarSettled(avatarLike(status), () => undefined).then(settled)
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toHaveBeenCalled()
    }
  )

  it('gives up after the time limit, so the app never stays on the opening screen', async () => {
    const settled = vi.fn()
    void whenAvatarSettled(avatarLike('loading'), () => undefined).then(settled)
    await vi.advanceTimersByTimeAsync(AVATAR_WAIT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(settled).toHaveBeenCalled()
  })

  it('stops watching once settled', async () => {
    const avatar = avatarLike('checking')
    const progress = vi.fn()
    void whenAvatarSettled(avatar, progress)
    avatar.status = 'ready'
    await vi.advanceTimersByTimeAsync(0)
    progress.mockClear()
    avatar.progress = 50
    await vi.advanceTimersByTimeAsync(0)
    expect(progress).not.toHaveBeenCalled()
  })
})

describe('runWithProgress', () => {
  it('runs everything and counts each finished task', async () => {
    const steps: string[] = []
    await runWithProgress([async () => 1, async () => 2, async () => 3], (done, total) =>
      steps.push(`${done}/${total}`)
    )
    expect(steps).toEqual(['0/3', '1/3', '2/3', '3/3'])
  })

  it('does not fail because one task failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const last: number[] = []
    await runWithProgress([async () => Promise.reject(new Error('boom')), async () => 1], (done) =>
      last.push(done)
    )
    expect(last.at(-1)).toBe(2)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('opening screen', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="splash"><div id="splash-progress"></div><div id="splash-status"></div></div>'
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('moves the bar within 0 and 100 and changes the text', () => {
    setSplash(42.4, 'Carregando')
    expect(document.getElementById('splash-progress')!.style.width).toBe('42%')
    expect(document.getElementById('splash-status')!.textContent).toBe('Carregando')

    setSplash(250)
    expect(document.getElementById('splash-progress')!.style.width).toBe('100%')
    setSplash(-5)
    expect(document.getElementById('splash-progress')!.style.width).toBe('0%')
    // No text given: the last one stays.
    expect(document.getElementById('splash-status')!.textContent).toBe('Carregando')
  })

  it('fades out and is removed', async () => {
    const done = hideSplash()
    expect(document.getElementById('splash')!.classList.contains('leaving')).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    await done
    expect(document.getElementById('splash')).toBeNull()
  })

  it('can be called when it is already gone', async () => {
    removeSplash()
    expect(document.getElementById('splash')).toBeNull()
    await expect(hideSplash()).resolves.toBeUndefined()
    expect(() => setSplash(10, 'x')).not.toThrow()
  })
})
