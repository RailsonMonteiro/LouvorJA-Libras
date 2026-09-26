import { z } from 'zod'
import { MAX_TRANSLATION_TEXT_LENGTH } from '../../../src/modules/libras/types/libras.types'
import { IpcChannels } from '../../../src/types/ipc'
import type { LibrasService } from '../../services/libras/LibrasService'
import { handle } from './handle'

const text = z.string().max(MAX_TRANSLATION_TEXT_LENGTH)
const override = z.object({ text, gloss: z.string().max(MAX_TRANSLATION_TEXT_LENGTH) })

export function registerLibrasIpc(service: LibrasService): void {
  handle(IpcChannels.librasTranslate, text, (value) => service.translate(value))
  handle(IpcChannels.librasSaveOverride, override, ({ text: value, gloss }) =>
    service.saveOverride(value, gloss)
  )
  handle(IpcChannels.librasRemoveOverride, text, (value) => service.removeOverride(value))
  handle(IpcChannels.librasCatalogStatus, z.undefined(), () => service.getCatalogStatus())
  handle(IpcChannels.librasCatalogRefresh, z.undefined(), () => service.refreshCatalog())
}
