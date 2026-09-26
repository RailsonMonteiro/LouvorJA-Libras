import { z } from 'zod'
import { IpcChannels } from '../../../src/types/ipc'
import type { OverlayController } from '../windows/OverlayController'
import { handle } from './handle'

const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), gloss: z.string().max(2000) }),
  z.object({ type: z.literal('repeat') }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') })
])

export function registerOverlayIpc(overlay: OverlayController): void {
  handle(IpcChannels.overlayGetState, z.undefined(), () => overlay.getState())
  handle(IpcChannels.overlayOpen, z.number().int().nonnegative().nullable(), (displayId) =>
    overlay.open(displayId)
  )
  handle(IpcChannels.overlayClose, z.undefined(), () => overlay.close())
  handle(IpcChannels.overlayIdentify, z.undefined(), () => overlay.identify())
  handle(IpcChannels.overlayCommand, command, (payload) => overlay.command(payload))
}
