// Run with: npm run brand:avatars   (needs `npm run build` first, and the player: npm run player:fetch)
// Takes a portrait of each VLibras avatar from the real player, on a transparent background, and
// saves it as src/assets/images/avatars/<avatar>.png (used by the avatar picker).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { AVATARS } from '../../src/modules/avatar/types/avatar.types.ts'

const root = resolve(import.meta.dirname, '../..')
const out = resolve(root, 'src/assets/images/avatars')
mkdirSync(out, { recursive: true })

const env = { ...process.env } as Record<string, string>
delete env.ELECTRON_RUN_AS_NODE
env.LOUVORJA_USER_DATA = mkdtempSync(join(tmpdir(), 'avatars-'))

const app = await electron.launch({ args: [root], env })
try {
  const main = await app.firstWindow()
  await main.locator('#splash').waitFor({ state: 'detached', timeout: 90_000 })

  // The overlay shows the avatar alone on a transparent page; keep it visible without a slide.
  await main.evaluate("window.louvorja.settings.set('overlayOnlyDuringPresentation', false)")
  await main.evaluate("window.louvorja.settings.set('avatarPosition', 'center')")
  await main.evaluate('window.louvorja.overlay.open(null)')
  await main.waitForTimeout(500)
  const overlay = app.windows().find((w) => w.url().includes('#/overlay'))
  if (!overlay) throw new Error('The overlay window did not open')
  const layer = overlay.getByTestId('avatar-layer')
  await layer.waitFor({ timeout: 90_000 })

  for (const id of AVATARS) {
    await main.evaluate(`window.louvorja.settings.set('avatar', '${id}')`)
    await overlay.waitForTimeout(6_000) // the player loads the other avatar's model
    // The whole avatar, then a square of head and shoulders found from where the head starts: the
    // avatars have different heights (Guga is a boy), so a fixed crop would cut or miss them.
    const full = await layer.screenshot({ omitBackground: true })
    const cropped = await main.evaluate(`(async () => {
      const image = new Image()
      image.src = 'data:image/png;base64,${full.toString('base64')}'
      await image.decode()
      const { width, height } = image
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      const alpha = ctx.getImageData(0, 0, width, height).data
      const opaque = (x, y) => alpha[(y * width + x) * 4 + 3] > 40
      let top = 0
      search: for (; top < height; top++) for (let x = 0; x < width; x++) if (opaque(x, top)) break search
      const side = Math.round(0.62 * (height - top))
      const y0 = Math.max(0, top - Math.round(0.03 * side))
      let left = width, right = 0
      for (let y = y0; y < Math.min(height, y0 + side); y++) for (let x = 0; x < width; x++) if (opaque(x, y)) { left = Math.min(left, x); right = Math.max(right, x) }
      const x0 = Math.round((left + right) / 2 - side / 2)
      const out = document.createElement('canvas')
      out.width = out.height = 320
      const octx = out.getContext('2d')
      octx.imageSmoothingQuality = 'high'
      octx.drawImage(canvas, x0, y0, side, side, 0, 0, 320, 320)
      return out.toDataURL('image/png').split(',')[1]
    })()`)
    const png = Buffer.from(cropped as string, 'base64')
    writeFileSync(join(out, `${id}.png`), png)
    console.log(`${id}.png (${png.length} bytes)`)
  }
} finally {
  await app.close()
}
