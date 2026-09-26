import {
  createRouter,
  createWebHashHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw
} from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/modules/dashboard/DashboardView.vue')
  },
  {
    path: '/louvorja',
    name: 'louvorja',
    component: () => import('@/modules/louvorja/LouvorJAView.vue')
  },
  {
    path: '/slides',
    name: 'slides',
    component: () => import('@/modules/slides/SlidesView.vue')
  },
  {
    path: '/projection',
    name: 'projection',
    component: () => import('@/modules/projection/ProjectionView.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/modules/settings/SettingsView.vue')
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/modules/about/AboutView.vue')
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

// Hash history: the packaged app is served from file://, where history mode does not work.
export const router = createRouter({ history: createWebHashHistory(), routes })

/**
 * Loads every page's code. Pages are split from the main script and normally load the first time
 * they are opened; the opening screen loads them all before the app shows, so no page stutters
 * the first time it is visited.
 */
export const pageLoaders: Array<() => Promise<unknown>> = routes.flatMap((route) =>
  typeof route.component === 'function' ? [route.component as () => Promise<unknown>] : []
)

/** A page is loaded when it is first opened; the dev server can fail that request (busy, proxy). */
const isLoadFailure = (error: unknown): boolean =>
  error instanceof TypeError &&
  /dynamically imported module|Importing a module script failed/i.test(error.message)

const MAX_RETRIES = 3
let retries = 0

// A page that fails to load is asked for again a little later, instead of leaving a blank screen.
router.onError((error, to: RouteLocationNormalized) => {
  if (!isLoadFailure(error) || retries >= MAX_RETRIES) {
    console.error('Navigation failed', error)
    return
  }
  retries += 1
  setTimeout(() => void router.replace(to.fullPath), retries * 1500)
})
router.afterEach((_to, _from, failure) => {
  if (!failure) retries = 0
})
