import { z } from 'zod'
import { IpcChannels } from '../../../src/types/ipc'
import type { UpdaterService } from '../../services/UpdaterService'
import { handle } from './handle'

export function registerUpdaterIpc(updater: UpdaterService): void {
  handle(IpcChannels.updaterGetState, z.undefined(), () => updater.getState())
  handle(IpcChannels.updaterCheck, z.undefined(), () => updater.check())
  handle(IpcChannels.updaterInstall, z.undefined(), () => updater.install())
}
