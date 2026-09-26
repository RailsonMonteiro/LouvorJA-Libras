import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import type { IpcChannel } from '../../../src/types/ipc'
import { isTrustedUrl } from '../security'

/**
 * Registers an IPC handler that (1) only accepts calls from our own renderer pages and
 * (2) validates the payload with zod before it reaches any application code.
 */
export function handle<S extends z.ZodType>(
  channel: IpcChannel,
  schema: S,
  handler: (payload: z.output<S>, event: IpcMainInvokeEvent) => unknown
): void {
  ipcMain.handle(channel, (event, payload: unknown) => {
    const url = event.senderFrame?.url
    if (!url || !isTrustedUrl(url)) throw new Error(`IPC ${channel}: untrusted sender`)
    return handler(schema.parse(payload), event)
  })
}
