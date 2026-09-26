import { z } from 'zod'
import { REGION_CODES, isValidSignName } from '../../../src/modules/avatar/types/avatar.types'
import { IpcChannels } from '../../../src/types/ipc'
import type { SignCache } from '../../services/avatar/SignCache'
import { handle } from './handle'

const prefetch = z.object({
  region: z.enum(REGION_CODES),
  signs: z.array(z.string().refine(isValidSignName, 'Invalid sign name')).max(300)
})

export function registerAvatarIpc(signs: SignCache): void {
  handle(IpcChannels.avatarPrefetch, prefetch, ({ region, signs: names }) =>
    signs.prefetch(region, names)
  )
  handle(IpcChannels.avatarCacheStats, z.undefined(), () => signs.stats())
  handle(IpcChannels.avatarCacheClear, z.undefined(), async () => {
    await signs.clear()
    return signs.stats()
  })
}
