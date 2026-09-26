import { BrowserWindow } from 'electron'
import { z } from 'zod'
import {
  isValidHost,
  isValidPort,
  isValidToken
} from '../../../src/modules/louvorja/types/louvorja.types'
import { IpcChannels } from '../../../src/types/ipc'
import type { LouvorJAService } from '../../services/louvorja/LouvorJAService'
import { handle } from './handle'

const endpointSchema = z.object({
  host: z.string().trim().refine(isValidHost, 'Invalid host'),
  port: z.number().refine(isValidPort, 'Invalid port'),
  token: z.string().trim().refine(isValidToken, 'Invalid token')
})

export function registerLouvorJAIpc(service: LouvorJAService): void {
  handle(IpcChannels.louvorjaGetState, z.undefined(), () => service.getState())
  handle(IpcChannels.louvorjaConnect, endpointSchema, (endpoint) => service.connect(endpoint))
  handle(IpcChannels.louvorjaDisconnect, z.undefined(), () => service.disconnect())
  handle(IpcChannels.louvorjaGetHistory, z.undefined(), () => service.getHistory())
  handle(IpcChannels.louvorjaRemoveConnection, z.number().int(), (id) =>
    service.removeConnection(id)
  )

  // Every open window (main today; presentation and overlay later) gets the same events.
  service.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.louvorjaEvent, event)
    }
  })
}
