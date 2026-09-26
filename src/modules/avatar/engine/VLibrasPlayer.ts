import type { AvatarId, AvatarSpeed } from '../types/avatar.types'

/**
 * Talks to the official VLibras Unity player, which runs in an iframe of its own and is driven
 * with `postMessage` (the same contract its widget uses; see docs/avatar.md).
 */

/** What is sent to the player page: it forwards it to Unity's `SendMessage`. */
export interface UnityMessage {
  type: 'unity'
  object: 'PlayerManager'
  method: string
  params?: string | number
}

/** Where messages go. In the app it is the iframe's window; tests use a fake. */
export interface PlayerTransport {
  post(message: UnityMessage): void
}

export type PlayerEvent =
  /** Loading progress, 0 to 1. */
  | { type: 'progress'; value: number }
  | { type: 'loaded' }
  | { type: 'state'; playing: boolean; paused: boolean; loading: boolean }
  /** Which sign of the gloss is being made (1-based) out of how many. */
  | { type: 'count'; count: number; max: number }
  | { type: 'avatar'; avatar: string }
  | { type: 'error'; reason: string }

type Listener = (event: PlayerEvent) => void

export class VLibrasPlayer {
  private readonly listeners = new Set<Listener>()

  constructor(private readonly transport: PlayerTransport) {}

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // --- commands ---

  /** Where the player downloads signs from (the app's sign proxy, per region). */
  setBaseUrl(url: string): void {
    this.send('setBaseUrl', url)
  }

  play(gloss: string): void {
    if (gloss.trim()) this.send('playNow', gloss.trim())
  }

  stop(): void {
    this.send('stopAll')
  }

  pause(): void {
    this.send('setPauseState', 1)
  }

  resume(): void {
    this.send('setPauseState', 0)
  }

  setSpeed(speed: AvatarSpeed): void {
    this.send('setSlider', speed)
  }

  setAvatar(avatar: AvatarId): void {
    this.send('Change', avatar)
  }

  /**
   * The player can write the word it is signing above the avatar's head; this app always keeps
   * that off (not a setting - nothing here ever turns it on). Without this, the player defaults
   * to showing it, which is what the whole call exists to prevent.
   */
  hideCaptions(): void {
    this.send('setSubtitlesState', 0)
  }

  // --- events coming from the page ---

  /** Feed every `message` event that comes from the player iframe. Anything else is ignored. */
  handleMessage(data: unknown): void {
    if (typeof data !== 'object' || data === null) return
    const message = data as { type?: unknown; event?: unknown; data?: unknown }
    if (message.type !== 'unity_event' || typeof message.event !== 'string') return

    switch (message.event) {
      case 'update_progress': {
        const value = Number(message.data)
        if (Number.isFinite(value)) this.emit({ type: 'progress', value: clamp(value, 0, 1) })
        break
      }
      case 'on_load_player':
        this.emit({ type: 'loaded' })
        break
      case 'on_playing_state_change': {
        // ["isPlaying", "isPaused", "isPlayingIntervalAnimation", "isLoading", "isRepeatable"]
        const states = Array.isArray(message.data) ? message.data.map((s) => s === 'True') : []
        this.emit({
          type: 'state',
          playing: states[0] === true,
          paused: states[1] === true,
          loading: states[3] === true
        })
        break
      }
      case 'counter_gloss': {
        const [count, max] = Array.isArray(message.data) ? message.data.map(Number) : []
        if (Number.isFinite(count) && Number.isFinite(max)) {
          this.emit({ type: 'count', count: count!, max: max! })
        }
        break
      }
      case 'get_avatar':
        if (typeof message.data === 'string') this.emit({ type: 'avatar', avatar: message.data })
        break
      case 'on_error':
        this.emit({ type: 'error', reason: String(message.data) })
        break
    }
  }

  private send(method: string, params?: string | number): void {
    this.transport.post({ type: 'unity', object: 'PlayerManager', method, params })
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
