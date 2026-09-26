<script setup lang="ts">
// Icons from Flaticon's UIcons (see NOTICE.md for the required credit): "regular rounded" for
// the "Conexão" nav item (and its page header, see ModuleHeader.vue), "solid rounded" for the
// same info icon used everywhere else (see HelpIcon.vue), here on the "Sobre" nav item. Only
// these two families are loaded, not the full icon set.
import '@flaticon/flaticon-uicons/css/regular/rounded.css'
import '@flaticon/flaticon-uicons/css/solid/rounded.css'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { navItems } from '@/app/navigation'
import logoUrl from '@/assets/images/logo.svg'
import { useSettingsStore } from '@/stores/settings.store'

/** Flaticon icons ("fi fi-rr-...") are plain classes, not a Vuetify icon name for <v-icon>. */
const isFlaticon = (icon: string): boolean => icon.startsWith('fi ')

const route = useRoute()
const store = useSettingsStore()
const { settings } = storeToRefs(store)
const hovered = ref(false)

const pinned = computed(() => settings.value.sidebarPinned)
const collapsed = computed(() => !pinned.value && !hovered.value)

const mainItems = navItems.filter((item) => item.area === 'main')
const footerItems = navItems.filter((item) => item.area === 'footer')

function togglePin(): void {
  void store.update('sidebarPinned', !pinned.value)
}
</script>

<template>
  <nav
    class="dashboard-sidebar"
    :class="{ 'is-collapsed': collapsed, 'is-pinned': pinned }"
    data-testid="sidebar"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div class="sidebar-header">
      <div class="logo-container">
        <img :src="logoUrl" alt="" class="logo-svg" data-testid="logo" />
        <span class="logo-title">{{ $t('app.name').toUpperCase() }}</span>
      </div>
      <button
        class="sidebar-pin-btn"
        :class="{ pinned }"
        :title="pinned ? $t('sidebar.unpin') : $t('sidebar.pin')"
        :aria-label="pinned ? $t('sidebar.unpin') : $t('sidebar.pin')"
        data-testid="sidebar-pin"
        @click="togglePin"
      >
        <v-icon size="16">{{ pinned ? 'mdi-pin' : 'mdi-pin-outline' }}</v-icon>
      </button>
    </div>

    <div class="sidebar-nav-main">
      <router-link
        v-for="item in mainItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="nav-item main-item"
        :class="{ active: route.name === item.name }"
        :data-testid="`nav-${item.name}`"
      >
        <i v-if="isFlaticon(item.icon)" class="nav-icon nav-icon-fi" :class="item.icon" />
        <v-icon v-else class="nav-icon">{{ item.icon }}</v-icon>
        <span class="nav-text">{{ $t(item.label) }}</span>
      </router-link>
    </div>

    <div class="sidebar-footer">
      <router-link
        v-for="item in footerItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="nav-item"
        :class="{ active: route.name === item.name }"
        :data-testid="`nav-${item.name}`"
      >
        <i v-if="isFlaticon(item.icon)" class="nav-icon nav-icon-fi" :class="item.icon" />
        <v-icon v-else class="nav-icon">{{ item.icon }}</v-icon>
        <span class="nav-text">{{ $t(item.label) }}</span>
      </router-link>
    </div>
  </nav>
</template>

<style lang="scss">
.dashboard-sidebar {
  position: fixed;
  top: var(--titlebar-height);
  left: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  height: calc(100vh - var(--titlebar-height));
  overflow: hidden;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  .logo-title,
  .nav-text {
    max-width: 200px;
    overflow: hidden;
    white-space: nowrap;
    opacity: 1;
    transition:
      opacity 0.3s ease 0.1s,
      max-width 0.3s ease;
  }

  .sidebar-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    transition: padding 0.3s ease;

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
    }

    /* The LouvorJA mark with the Libras hands over it: one image, wider than tall. */
    .logo-svg {
      width: auto;
      height: 38px;
      flex-shrink: 0;
      transition: height 0.3s ease;
    }

    .logo-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.8px;
      /* Black in the light theme, white in the dark one (the same colour as the rest of the menu). */
      color: var(--sidebar-text);
    }

    .sidebar-pin-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border: 0;
      border-radius: 6px;
      background: none;
      color: var(--sidebar-text-secondary);
      cursor: pointer;
      transition:
        var(--transition),
        opacity 0.2s ease;

      &:hover {
        background: var(--sidebar-hover);
        color: var(--accent-blue);
      }

      &.pinned {
        color: var(--accent-blue);
      }
    }
  }

  .sidebar-nav-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    padding: 20px 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .sidebar-footer {
    padding: 16px 0 24px;
    border-top: 1px solid var(--sidebar-border);
  }

  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 4px 16px;
    padding: 8px 16px;
    border-radius: var(--border-radius);
    color: var(--sidebar-text);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: var(--transition);

    &.main-item {
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
    }

    .nav-icon {
      min-width: 22px;
      font-size: 22px;
      color: var(--accent-blue);
      transition: var(--transition);
    }

    /* The Flaticon icon is a plain <i>, not Vuetify's <v-icon>: centre it the same way by hand. */
    .nav-icon-fi {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* Under the mouse, not the page you are on: a soft indigo tint. */
    &:hover {
      background: var(--sidebar-hover);
    }

    /* The page you are on: a solid gradient fill, not just a line. */
    &.active {
      background: var(--sidebar-active);
      color: #fff;

      .nav-icon {
        color: #fff;
      }
    }
  }

  &.is-collapsed {
    width: var(--sidebar-collapsed-width);

    .logo-title,
    .nav-text {
      max-width: 0;
      margin: 0;
      opacity: 0;
      pointer-events: none;
      transition:
        opacity 0.2s ease,
        max-width 0.2s ease;
    }

    .sidebar-header {
      padding: 24px 16px;

      .logo-container {
        gap: 0;
      }

      /* The narrow rail: the same logo, a little smaller. */
      .logo-svg {
        height: 30px;
      }

      .sidebar-pin-btn {
        opacity: 0;
        pointer-events: none;
      }
    }

    .nav-item {
      justify-content: center;
      gap: 0;
      margin: 4px 12px;
      padding: 12px;
    }
  }
}
</style>
