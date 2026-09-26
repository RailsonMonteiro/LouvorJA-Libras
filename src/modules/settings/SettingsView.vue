<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import { isHttpUrl } from '@/modules/libras/types/libras.types'
import OverlayPanel from '@/modules/overlay/components/OverlayPanel.vue'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import { useSettingsStore } from '@/stores/settings.store'
import LanguagePicker from './LanguagePicker.vue'
import SettingsSection from './SettingsSection.vue'
import UrlField from './UrlField.vue'
import ThemePicker from './ThemePicker.vue'
import { openSection, SETTINGS_SECTION_ICONS, SETTINGS_SECTIONS } from './sections'
import type { AppSettings } from '@/types/settings'

// The content slides the way the tabs are laid out: forward to a tab on the right, back to one
// on the left. (Set before the page redraws, so the transition already knows the direction.)
const direction = ref<'forward' | 'back'>('forward')
watch(openSection, (now, before) => {
  direction.value =
    SETTINGS_SECTIONS.indexOf(now) >= SETTINGS_SECTIONS.indexOf(before) ? 'forward' : 'back'
})

const { t } = useI18n()
const store = useSettingsStore()
const { settings } = storeToRefs(store)
const libras = useLibrasStore()
const avatar = useAvatarStore()
const { locale } = useI18n()
const error = ref('')

// The two service addresses are edited as text and saved when the field loses focus.
const translatorUrl = ref(settings.value.translatorUrl)
const signsIndexUrl = ref(settings.value.signsIndexUrl)
const dictionaryUrl = ref(settings.value.dictionaryUrl)
watch(
  () => [settings.value.translatorUrl, settings.value.signsIndexUrl, settings.value.dictionaryUrl],
  ([translator, signs, dictionary]) => {
    translatorUrl.value = translator!
    signsIndexUrl.value = signs!
    dictionaryUrl.value = dictionary!
  }
)

async function commitUrl(
  key: 'translatorUrl' | 'signsIndexUrl' | 'dictionaryUrl',
  value: string
): Promise<void> {
  const clean = value.trim()
  if (clean !== settings.value[key] && isHttpUrl(clean)) await change(key, clean)
}

const catalogInfo = computed(() => {
  const status = libras.catalog
  if (!status?.ready) return t('settings.libras.catalogEmpty')
  const date = status.updatedAt ? new Date(status.updatedAt).toLocaleDateString(locale.value) : '-'
  return t('settings.libras.catalogInfo', {
    count: status.count.toLocaleString(locale.value),
    date
  })
})

void avatar.refreshCacheStats().catch(() => undefined)

const cacheInfo = computed(() => {
  const { files, bytes } = avatar.cacheStats
  if (files === 0) return t('settings.avatar.cacheEmpty')
  const size = `${(bytes / 1_048_576).toLocaleString(locale.value, { maximumFractionDigits: 1 })} MB`
  return t('settings.avatar.cacheInfo', { count: files.toLocaleString(locale.value), size })
})

async function change<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  error.value = ''
  try {
    await store.update(key, value)
  } catch {
    error.value = t('settings.saveError')
  }
}
</script>

<template>
  <div class="page-container">
    <v-tabs
      v-model="openSection"
      color="primary"
      class="settings-tabs mb-6"
      show-arrows
      data-testid="settings-tabs"
    >
      <v-tab
        v-for="name in SETTINGS_SECTIONS"
        :key="name"
        :value="name"
        :prepend-icon="SETTINGS_SECTION_ICONS[name]"
        :data-testid="`settings-tab-${name}`"
      >
        {{ $t(`settings.tabs.${name}`) }}
      </v-tab>
    </v-tabs>

    <Transition :name="`settings-tab-${direction}`" mode="out-in">
      <div :key="openSection">
        <div v-if="openSection === 'general'" class="d-flex flex-column ga-5">
          <v-card :title="$t('settings.general')" prepend-icon="mdi-tune">
            <v-card-text>
              <v-alert v-if="error" type="error" class="mb-4" :text="error" />

              <div class="text-subtitle-2 mb-2">{{ $t('settings.language') }}</div>
              <LanguagePicker
                class="mb-6"
                :model-value="settings.locale"
                @update:model-value="change('locale', $event)"
              />

              <div class="text-subtitle-2 mb-2">{{ $t('settings.theme') }}</div>
              <ThemePicker
                class="mb-6"
                :model-value="settings.theme"
                @update:model-value="change('theme', $event)"
              />

              <v-switch
                :model-value="settings.autoConnect"
                :label="$t('settings.autoConnect')"
                color="primary"
                hide-details
                data-testid="setting-auto-connect"
                @update:model-value="change('autoConnect', Boolean($event))"
              />

              <v-switch
                :model-value="settings.runInBackground"
                :label="$t('settings.runInBackground')"
                :hint="$t('settings.runInBackgroundTesting')"
                persistent-hint
                color="primary"
                class="mt-4"
                disabled
                data-testid="setting-run-in-background"
                @update:model-value="change('runInBackground', Boolean($event))"
              />
            </v-card-text>
          </v-card>
        </div>

        <div v-else-if="openSection === 'translator'" class="d-flex flex-column ga-5">
          <SettingsSection
            icon="mdi-translate"
            :title="$t('settings.libras.sections.online.title')"
            :description="$t('settings.libras.onlineHint')"
          >
            <v-switch
              :model-value="settings.onlineTranslator"
              :label="$t('settings.libras.online')"
              color="primary"
              hide-details
              density="comfortable"
              data-testid="setting-online-translator"
              @update:model-value="change('onlineTranslator', Boolean($event))"
            />

            <UrlField
              v-model="translatorUrl"
              :label="$t('settings.libras.translatorUrl')"
              :error="isHttpUrl(translatorUrl) ? '' : $t('settings.libras.invalidUrl')"
              data-testid="setting-translator-url"
              @commit="commitUrl('translatorUrl', translatorUrl)"
            />
          </SettingsSection>

          <SettingsSection
            icon="mdi-book-open-variant"
            :title="$t('settings.libras.catalog')"
            :description="$t('settings.libras.sections.catalog.description')"
          >
            <UrlField
              v-model="signsIndexUrl"
              :label="$t('settings.libras.signsIndexUrl')"
              :error="isHttpUrl(signsIndexUrl) ? '' : $t('settings.libras.invalidUrl')"
              data-testid="setting-signs-url"
              @commit="commitUrl('signsIndexUrl', signsIndexUrl)"
            />

            <div class="status-row">
              <v-icon :color="libras.catalog?.ready ? 'success' : 'warning'" size="22">
                {{ libras.catalog?.ready ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
              </v-icon>
              <div class="status-text" data-testid="catalog-info">{{ catalogInfo }}</div>
              <v-btn
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-download"
                :loading="libras.catalogBusy"
                data-testid="catalog-refresh"
                @click="libras.refreshCatalog()"
              >
                {{ $t('settings.libras.refresh') }}
              </v-btn>
            </div>
            <v-alert
              v-if="libras.catalogError"
              type="error"
              variant="tonal"
              density="compact"
              data-testid="catalog-error"
              :text="$t('settings.libras.refreshError')"
            />
          </SettingsSection>

          <SettingsSection
            icon="mdi-database-outline"
            :title="$t('settings.libras.sections.dictionary.title')"
            :description="$t('settings.libras.sections.dictionary.description')"
          >
            <UrlField
              v-model="dictionaryUrl"
              :label="$t('settings.avatar.dictionaryUrl')"
              :error="isHttpUrl(dictionaryUrl) ? '' : $t('settings.libras.invalidUrl')"
              data-testid="setting-dictionary-url"
              @commit="commitUrl('dictionaryUrl', dictionaryUrl)"
            />

            <div class="status-row">
              <v-icon color="primary" size="22">mdi-content-save-outline</v-icon>
              <div class="status-text">
                <div class="text-caption text-medium-emphasis">
                  {{ $t('settings.avatar.cache') }}
                </div>
                <div data-testid="avatar-cache-info">{{ cacheInfo }}</div>
              </div>
              <v-btn
                variant="tonal"
                size="small"
                prepend-icon="mdi-delete-outline"
                :disabled="avatar.cacheStats.files === 0"
                data-testid="avatar-cache-clear"
                @click="avatar.clearCache()"
              >
                {{ $t('settings.avatar.clear') }}
              </v-btn>
            </div>
          </SettingsSection>
        </div>

        <OverlayPanel v-else />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* One line of state with its action on the right: what is there now, and a button to change it. */
.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
}

.status-text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

/* A short slide and fade when the tab changes; nothing moves for people who ask for less motion. */
.settings-tab-forward-enter-active,
.settings-tab-forward-leave-active,
.settings-tab-back-enter-active,
.settings-tab-back-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.settings-tab-forward-enter-from,
.settings-tab-back-leave-to {
  opacity: 0;
  transform: translateX(28px);
}

.settings-tab-forward-leave-to,
.settings-tab-back-enter-from {
  opacity: 0;
  transform: translateX(-28px);
}

@media (prefers-reduced-motion: reduce) {
  .settings-tab-forward-enter-active,
  .settings-tab-forward-leave-active,
  .settings-tab-back-enter-active,
  .settings-tab-back-leave-active {
    transition: opacity 0.2s ease;
  }

  .settings-tab-forward-enter-from,
  .settings-tab-forward-leave-to,
  .settings-tab-back-enter-from,
  .settings-tab-back-leave-to {
    transform: none;
  }
}
</style>
