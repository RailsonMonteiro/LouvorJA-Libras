<script setup lang="ts">
import { ref } from 'vue'
import ModuleHeader from '@/components/ModuleHeader.vue'
import SettingsSection from '@/modules/settings/SettingsSection.vue'
import logoUrl from '@/assets/images/logo.svg'
import { useAppStore } from '@/stores/app.store'
import { useUpdaterStore } from '@/stores/updater.store'

const app = useAppStore()
const updater = useUpdaterStore()

/** Keys of `about.manual` in the locale files, each with its own panel and icon in the dialog. */
const MANUAL_SECTIONS = ['connection', 'slides', 'projection', 'settings'] as const

/** Same icons as the matching sidebar entries (navigation.ts), so they read as the same place. */
const MANUAL_ICONS: Record<(typeof MANUAL_SECTIONS)[number], string> = {
  connection: 'mdi-link-variant',
  slides: 'mdi-presentation',
  projection: 'mdi-projector-screen',
  settings: 'mdi-cog'
}

const manualOpen = ref(false)
</script>

<template>
  <div class="page-container">
    <ModuleHeader :title="$t('nav.about')" icon="fi fi-sr-info" test-id="about-title" />

    <v-row justify="center">
      <v-col cols="12">
        <v-card class="about-card">
          <div class="about-glow" />
          <v-card-text class="d-flex flex-column align-center text-center pt-8 pb-8">
            <div class="about-identity">
              <img :src="logoUrl" alt="" class="about-logo" />
              <div class="about-name gradient-text" data-testid="about-name">
                {{ $t('app.name') }}
              </div>
            </div>
            <div class="about-version mt-4" data-testid="about-version">
              {{ $t('about.version', { version: app.info?.version ?? '' }) }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-2" justify="center">
      <v-col cols="12" md="7" lg="5">
        <SettingsSection
          icon="mdi-book-open-variant"
          :title="$t('about.manual.title')"
          :description="$t('about.manual.description')"
        >
          <div class="action-list">
            <button
              type="button"
              class="action-tile"
              data-testid="about-manual-open"
              @click="manualOpen = true"
            >
              <span class="action-icon action-icon-manual">
                <v-icon size="22">mdi-book-open-page-variant-outline</v-icon>
              </span>
              <span class="action-text">
                <span class="action-title">{{ $t('about.manual.open') }}</span>
                <span class="action-hint">{{ $t('about.manual.openHint') }}</span>
              </span>
              <v-icon class="action-chevron" size="20">mdi-chevron-right</v-icon>
            </button>

            <button
              type="button"
              class="action-tile"
              data-testid="about-check-updates"
              :disabled="updater.checking"
              @click="updater.check()"
            >
              <span class="action-icon action-icon-updates">
                <v-icon v-if="updater.checking" size="22" class="mdi-spin">mdi-loading</v-icon>
                <v-icon v-else size="22">mdi-cloud-refresh-outline</v-icon>
              </span>
              <span class="action-text">
                <span class="action-title">{{ $t('about.updates.check') }}</span>
                <span class="action-hint">{{ $t('about.updates.checkHint') }}</span>
              </span>
              <v-icon class="action-chevron" size="20">mdi-chevron-right</v-icon>
            </button>
          </div>

          <p
            v-if="updater.state.status !== 'idle'"
            class="update-status"
            data-testid="about-updates-status"
            :data-status="updater.state.status"
          >
            <v-icon size="16" class="mr-1">
              {{
                updater.state.status === 'error'
                  ? 'mdi-alert-circle-outline'
                  : 'mdi-information-outline'
              }}
            </v-icon>
            <template v-if="updater.state.status === 'checking'">
              {{ $t('about.updates.checking') }}
            </template>
            <template v-else-if="updater.state.status === 'downloading'">
              {{ $t('about.updates.downloading', { percent: updater.state.progressPercent ?? 0 }) }}
            </template>
            <template v-else-if="updater.state.status === 'downloaded'">
              {{ $t('about.updates.downloaded', { version: updater.state.version ?? '' }) }}
            </template>
            <template v-else-if="updater.state.status === 'upToDate'">
              {{ $t('about.updates.upToDate') }}
            </template>
            <template v-else-if="updater.state.status === 'error'">
              {{ $t('about.updates.error') }}
            </template>
            <template v-else>
              {{ $t('about.updates.unavailable') }}
            </template>
          </p>
          <v-progress-linear
            v-if="updater.state.status === 'downloading'"
            :model-value="updater.state.progressPercent ?? 0"
            color="primary"
            height="6"
            rounded
            class="mt-2"
          />
          <v-btn
            v-if="updater.state.status === 'downloaded'"
            color="primary"
            variant="tonal"
            prepend-icon="mdi-restart"
            block
            class="mt-3"
            data-testid="about-install-update"
            @click="updater.install()"
          >
            {{ $t('about.updates.install') }}
          </v-btn>
        </SettingsSection>
      </v-col>
    </v-row>

    <v-dialog v-model="manualOpen" max-width="640" data-testid="about-manual-dialog">
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon>mdi-book-open-variant</v-icon>
          {{ $t('about.manual.title') }}
        </v-card-title>
        <v-card-text>
          <v-expansion-panels variant="accordion" data-testid="about-manual">
            <v-expansion-panel v-for="key in MANUAL_SECTIONS" :key="key" :value="key">
              <v-expansion-panel-title>
                <v-icon class="mr-3" color="primary">{{ MANUAL_ICONS[key] }}</v-icon>
                {{ $t(`about.manual.${key}.title`) }}
              </v-expansion-panel-title>
              <v-expansion-panel-text>{{ $t(`about.manual.${key}.text`) }}</v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" data-testid="about-manual-close" @click="manualOpen = false">
            {{ $t('about.manual.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
/* Hugs its content instead of a fixed column width, so it is never narrower than the (unwrapped)
   name next to the logo - centered by the row around it either way. */
.about-card {
  position: relative;
  overflow: hidden;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
}

/* A quiet colour wash behind the logo, so the card is not just flat white/navy. */
.about-glow {
  position: absolute;
  inset: -40% -20% auto -20%;
  height: 220px;
  background: radial-gradient(
    ellipse at top,
    rgba(99, 102, 241, 0.16) 0%,
    rgba(20, 184, 166, 0.1) 45%,
    transparent 75%
  );
  pointer-events: none;
}

.about-identity {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.about-logo {
  height: 96px;
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.18));
}

/* Same gradient treatment as every page's own title (.gradient-text, main.scss) - the app's own
   signature, not the plain black/white text this used to be. */
.about-name {
  position: relative;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  white-space: nowrap;
}

.about-version {
  position: relative;
  padding: 4px 14px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.1);
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* A tappable row, not a plain button: icon badge, title + hint, and a chevron hinting it opens
   something - the same language as a settings list on a phone. */
.action-tile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.05);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;
}

.action-tile:hover {
  border-color: rgba(99, 102, 241, 0.4);
  background: var(--sidebar-hover);
  transform: translateY(-1px);
}

.action-tile:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}

.action-tile:disabled {
  cursor: default;
  opacity: 0.7;
}

.action-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: #fff;
}

.action-icon-manual {
  background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-blue-dark) 100%);
}

.action-icon-updates {
  background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
}

.action-text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.action-title {
  font-size: 14px;
  font-weight: 600;
}

.action-hint {
  color: var(--sidebar-text-secondary);
  font-size: 12px;
}

.action-chevron {
  flex-shrink: 0;
  color: var(--sidebar-text-secondary);
}

.update-status {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 14px 0 0;
  color: var(--sidebar-text-secondary);
  font-size: 13px;
}

.update-status[data-status='error'] {
  color: rgb(var(--v-theme-error));
}
</style>
