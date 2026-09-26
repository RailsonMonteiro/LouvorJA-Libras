import { describe, expect, it } from 'vitest'
import { AVATAR_ASPECT, avatarBox } from '@/modules/avatar/composables/placement'

const stage = { left: 100, top: 50, width: 1000, height: 500 }

describe('avatarBox', () => {
  it('stands on the bottom edge, as tall as the scale says', () => {
    const box = avatarBox(stage, 90, 'right')
    expect(box.height).toBe(450)
    expect(box.width).toBe(450 * AVATAR_ASPECT)
    expect(box.y + box.height).toBe(stage.top + stage.height)
  })

  it('puts the avatar at the left, centre or right with a small margin', () => {
    const left = avatarBox(stage, 100, 'left')
    const center = avatarBox(stage, 100, 'center')
    const right = avatarBox(stage, 100, 'right')

    expect(left.x).toBe(100 + 20) // 2% of the width
    expect(center.x + center.width / 2).toBe(100 + 1000 / 2)
    expect(right.x + right.width).toBe(100 + 1000 - 20)
  })

  it('scales with the stage: a smaller preview is a miniature of the full screen', () => {
    const screen = avatarBox({ left: 0, top: 0, width: 1920, height: 1080 }, 80, 'right')
    const preview = avatarBox({ left: 0, top: 0, width: 960, height: 540 }, 80, 'right')
    expect(preview.height / screen.height).toBeCloseTo(0.5)
    expect(preview.width / screen.width).toBeCloseTo(0.5)
    expect(preview.x / 960).toBeCloseTo(screen.x / 1920)
  })
})
