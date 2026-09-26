// Static (not dynamic) on purpose: Vite bundles a CSS file reached this way straight into the
// built index.html as a stylesheet <link>, loaded before main.ts itself runs. That is what lets
// the opening screen (index.html) use Roboto from its very first frame, with no later swap.
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { removeSplash } from '@/app/splash'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { useSettingsStore } from '@/stores/settings.store'

/** The overlay window loads this same page with this route; it shows only the avatar. */
const isOverlay = window.location.hash.startsWith('#/overlay')

/** Stores every window needs, loaded in the order they depend on each other. */
async function startStores(pinia: ReturnType<typeof createPinia>): Promise<void> {
  const settings = useSettingsStore(pinia)
  settings.watchChanges()
  await Promise.all([settings.load(), useLouvorJAStore(pinia).init()])
  // The translator watches the live slide, so it needs the integration state loaded first.
  await useLibrasStore(pinia).init()
  // The avatar follows the translated slides, so it comes after the translator.
  await useAvatarStore(pinia).init()
}

async function bootstrapOverlay(): Promise<void> {
  removeSplash() // the opening screen is for the main window only
  const { default: OverlayApp } = await import('@/modules/overlay/OverlayApp.vue')
  const pinia = createPinia()
  const app = createApp(OverlayApp)
  app.use(pinia)
  await startStores(pinia)
  app.mount('#app')
}

/**
 * The opening screen (index.html) stays up while everything the app needs is loaded: settings,
 * the state of the connection, every page's code, the fonts and the avatar player. Then it fades
 * out and the app is already ready to use, with nothing left to load in the middle of a service.
 */
async function bootstrapApp(): Promise<void> {
  const { setSplash, hideSplash } = await import('@/app/splash')
  const { pageLoaders, router } = await import('@/app/router')
  const { runWithProgress, whenAvatarSettled } = await import('@/app/startup')
  setSplash(6)

  const [{ default: App }, { vuetify }, { i18n }, { useAppStore }] = await Promise.all([
    import('@/app/App.vue'),
    import('@/app/plugins/vuetify'),
    import('@/locales'),
    import('@/stores/app.store')
  ])
  await import('@/styles/main.scss')
  setSplash(20)

  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia).use(router).use(i18n).use(vuetify)

  // Load persisted settings first so the first paint already uses the right language and theme.
  await Promise.all([useAppStore(pinia).load(), startStores(pinia)])
  const { locale } = useSettingsStore(pinia).settings
  const say = (key: 'pages' | 'avatar' | 'ready'): string =>
    i18n.global.t(`splash.${key}`, {}, { locale })
  setSplash(38, say('pages'))

  // Every page's code, so none of them has to be fetched the first time it is opened.
  await runWithProgress(pageLoaders, (done, total) => setSplash(38 + (done / total) * 22))
  setSplash(60, say('avatar'))

  app.mount('#app')

  // The avatar player starts loading now that the app is on the page (it takes some seconds).
  const avatar = useAvatarStore(pinia)
  await whenAvatarSettled(avatar, (percent) => setSplash(60 + (percent / 100) * 34))
  await router.isReady()
  await document.fonts.ready
  setSplash(100, say('ready'))
  await hideSplash()
}

void (isOverlay ? bootstrapOverlay() : bootstrapApp())
