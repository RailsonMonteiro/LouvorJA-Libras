import { describe, expect, it } from 'vitest'
import { describeDisplays, pickScreen } from '../../../../electron/main/windows/displays'

const screen = (id: number, width = 1920, height = 1080, x = 0) => ({
  id,
  bounds: { x, y: 0, width, height }
})

describe('pickScreen', () => {
  const laptop = screen(1)
  const projector = screen(2, 1280, 720, 1920)

  it('uses the screen that was asked for', () => {
    expect(pickScreen([laptop, projector], 1, 1)).toBe(laptop)
    expect(pickScreen([laptop, projector], 1, 2)).toBe(projector)
  })

  it('chooses the second screen by itself, which is usually the audience one', () => {
    expect(pickScreen([laptop, projector], 1, null)).toBe(projector)
  })

  it('falls back to the automatic choice when the chosen screen was unplugged', () => {
    expect(pickScreen([laptop, projector], 1, 99)).toBe(projector)
    expect(pickScreen([laptop], 1, 2)).toBe(laptop)
  })

  it('uses the only screen there is, and nothing when there is none', () => {
    expect(pickScreen([laptop], 1, null)).toBe(laptop)
    expect(pickScreen([], 1, null)).toBeNull()
  })

  it('does not depend on the order of the list', () => {
    expect(pickScreen([projector, laptop], 1, null)).toBe(projector)
  })
})

describe('describeDisplays', () => {
  it('numbers the screens, gives the size and marks the main one', () => {
    expect(describeDisplays([screen(7), screen(9, 1280, 720, 1920)], 7)).toEqual([
      { id: 7, label: '1 · 1920×1080', width: 1920, height: 1080, primary: true },
      { id: 9, label: '2 · 1280×720', width: 1280, height: 720, primary: false }
    ])
  })
})
