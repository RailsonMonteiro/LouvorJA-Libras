<script setup lang="ts">
import { storeToRefs } from 'pinia'
import AppSidebar from '@/app/layout/AppSidebar.vue'
import AppTitlebar from '@/app/layout/AppTitlebar.vue'
import AvatarLayer from '@/modules/avatar/components/AvatarLayer.vue'
import { useAppearance } from '@/composables/useAppearance'
import { useOverlayStore } from '@/modules/overlay/stores/overlay.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUpdaterStore } from '@/stores/updater.store'

useAppearance()
void useOverlayStore().init()
void useUpdaterStore().init()
const { settings } = storeToRefs(useSettingsStore())
</script>

<template>
  <v-app id="app-container">
    <AppTitlebar />
    <AppSidebar />

    <v-main class="bg-main main-container">
      <div class="content" :class="{ 'sidebar-pinned': settings.sidebarPinned }">
        <!-- Only the page coming in fades; the one leaving is swapped out at once, not kept
             around and painted/composited at the same time as the new one - that overlap is what
             made switching tabs feel like it hitched on heavier pages (Projeção, Configurações).
             (Not mode="out-in": with Vite's dev server, that leaves the page blank the first real
             time a route opens - see docs/decisoes.md.) The leaving page still lingers in the DOM
             for a frame or two while Vue removes it (even with no transition to wait for), so it
             keeps position:absolute - out of flow - or it briefly pushes the incoming page down
             and anything measuring that page's layout on mount (the avatar's placement) reads the
             wrong numbers. -->
        <router-view v-slot="{ Component, route }">
          <Transition name="page">
            <component :is="Component" :key="String(route.name)" />
          </Transition>
        </router-view>
      </div>
    </v-main>

    <AvatarLayer />
  </v-app>
</template>

<style scoped>
.main-container {
  height: calc(100vh - var(--titlebar-height));
  padding: 0 !important;
  overflow: hidden;
}

.content {
  position: relative;
  height: 100%;
  margin-left: var(--sidebar-collapsed-width);
  padding: 24px;
  overflow-y: auto;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Only the incoming page animates - the outgoing one has no leave transition, so it is removed
   at once instead of lingering, absolutely positioned, painted on top of the new page for the
   length of a crossfade. That overlap (two full pages composited together, one of them often
   heavy - Projeção's avatar, Configurações' cards) was what made switching tabs feel like it
   hitched. A single, slower dim-to-full fade is still cheap on its own (no position:absolute,
   nothing else painted at the same time) - only its speed and depth changed, not the mechanism. */
.page-enter-active {
  transition: opacity 0.35s ease;
}

.page-enter-from {
  opacity: 0.45;
}

.page-leave-active {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.content.sidebar-pinned {
  margin-left: var(--sidebar-width);
}
</style>
