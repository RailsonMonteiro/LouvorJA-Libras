import { describe, expect, it } from 'vitest'
import {
  VLibrasPlayer,
  type PlayerEvent,
  type UnityMessage
} from '@/modules/avatar/engine/VLibrasPlayer'

function setup() {
  const sent: UnityMessage[] = []
  const events: PlayerEvent[] = []
  const player = new VLibrasPlayer({ post: (message) => sent.push(message) })
  player.onEvent((event) => events.push(event))
  return { player, sent, events }
}

const fromUnity = (event: string, data?: unknown): unknown => ({ type: 'unity_event', event, data })

describe('VLibrasPlayer commands', () => {
  it('speaks the message contract of the official player', () => {
    const { player, sent } = setup()
    player.setBaseUrl('app://renderer/__signs__/BR/')
    player.play('  DEUS AMOR ')
    player.setSpeed(1.5)
    player.setAvatar('hosana')
    player.hideCaptions()
    player.pause()
    player.resume()
    player.stop()

    expect(sent).toEqual([
      {
        type: 'unity',
        object: 'PlayerManager',
        method: 'setBaseUrl',
        params: 'app://renderer/__signs__/BR/'
      },
      { type: 'unity', object: 'PlayerManager', method: 'playNow', params: 'DEUS AMOR' },
      { type: 'unity', object: 'PlayerManager', method: 'setSlider', params: 1.5 },
      { type: 'unity', object: 'PlayerManager', method: 'Change', params: 'hosana' },
      { type: 'unity', object: 'PlayerManager', method: 'setSubtitlesState', params: 0 },
      { type: 'unity', object: 'PlayerManager', method: 'setPauseState', params: 1 },
      { type: 'unity', object: 'PlayerManager', method: 'setPauseState', params: 0 },
      { type: 'unity', object: 'PlayerManager', method: 'stopAll', params: undefined }
    ])
  })

  it('does not send an empty gloss', () => {
    const { player, sent } = setup()
    player.play('   ')
    expect(sent).toEqual([])
  })
})

describe('VLibrasPlayer events', () => {
  it('turns the messages of the player page into events', () => {
    const { player, events } = setup()
    player.handleMessage(fromUnity('update_progress', 0.3))
    player.handleMessage(fromUnity('get_avatar', 'icaro'))
    player.handleMessage(fromUnity('on_load_player'))
    player.handleMessage(
      fromUnity('on_playing_state_change', ['True', 'False', 'False', 'True', 'True'])
    )
    player.handleMessage(
      fromUnity('on_playing_state_change', ['False', 'True', 'False', 'False', 'True'])
    )
    player.handleMessage(fromUnity('counter_gloss', [1, 2]))
    player.handleMessage(fromUnity('on_error', 'unsupported'))

    expect(events).toEqual([
      { type: 'progress', value: 0.3 },
      { type: 'avatar', avatar: 'icaro' },
      { type: 'loaded' },
      { type: 'state', playing: true, paused: false, loading: true },
      { type: 'state', playing: false, paused: true, loading: false },
      { type: 'count', count: 1, max: 2 },
      { type: 'error', reason: 'unsupported' }
    ])
  })

  it('clamps the progress and ignores malformed or foreign messages', () => {
    const { player, events } = setup()
    player.handleMessage(fromUnity('update_progress', 7))
    player.handleMessage(fromUnity('update_progress', 'abc'))
    player.handleMessage(fromUnity('counter_gloss', ['x']))
    player.handleMessage(fromUnity('get_avatar', 42))
    player.handleMessage(fromUnity('something_new'))
    player.handleMessage({ type: 'other', event: 'on_load_player' })
    player.handleMessage('on_load_player')
    player.handleMessage(null)

    expect(events).toEqual([{ type: 'progress', value: 1 }])
  })

  it('stops delivering events to a listener that unsubscribed', () => {
    const { player, events } = setup()
    const extra: PlayerEvent[] = []
    const off = player.onEvent((event) => extra.push(event))
    player.handleMessage(fromUnity('on_load_player'))
    off()
    player.handleMessage(fromUnity('on_load_player'))

    expect(extra).toHaveLength(1)
    expect(events).toHaveLength(2)
  })
})
