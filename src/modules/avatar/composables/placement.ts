import type { AvatarPosition } from '../types/avatar.types'

/** The avatar is taller than wide: its box is this many times as wide as it is tall. */
export const AVATAR_ASPECT = 0.75

export interface Area {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where the avatar stands on a stage (the preview) or on a whole screen (the overlay): on the
 * bottom edge, at the left, centre or right, and `scalePercent` of the stage's height tall.
 */
export function avatarBox(
  stage: Area,
  scalePercent: number,
  position: AvatarPosition
): { x: number; y: number; width: number; height: number } {
  const height = stage.height * (scalePercent / 100)
  const width = height * AVATAR_ASPECT
  const margin = stage.width * 0.02

  const x = {
    left: stage.left + margin,
    center: stage.left + (stage.width - width) / 2,
    right: stage.left + stage.width - width - margin
  }[position]

  return { x, y: stage.top + stage.height - height, width, height }
}
