<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLibrasStore } from '../stores/libras.store'
import type { TokenAvailability, TranslationSource } from '../types/libras.types'

const props = defineProps<{ text: string }>()
const store = useLibrasStore()

const loading = ref(false)
const failed = ref(false)
const editing = ref(false)
const draft = ref('')

const translation = computed(() => store.get(props.text))

// Also runs again when the store forgets the translation (e.g. after the catalog was refreshed).
watch(
  () => [props.text, store.get(props.text) === null] as const,
  async ([text]) => {
    failed.value = false
    if (!text.trim() || store.get(text)) return
    loading.value = true
    failed.value = (await store.ensure(text)) === null
    loading.value = false
  },
  { immediate: true }
)

const sourceColor: Record<TranslationSource, string> = {
  manual: 'primary',
  cache: 'secondary',
  local: 'success',
  online: 'success',
  fallback: 'warning'
}

const tokenVisual: Record<TokenAvailability, { color: string; icon: string }> = {
  sign: { color: 'primary', icon: 'mdi-hand-wave' },
  spelled: { color: 'warning', icon: 'mdi-alphabetical-variant' },
  missing: { color: 'error', icon: 'mdi-alert-circle-outline' },
  unknown: { color: 'grey', icon: 'mdi-help-circle-outline' }
}

const catalogMissing = computed(
  () => store.catalog !== null && !store.catalog.ready && !!translation.value?.tokens.length
)

function startEditing(): void {
  draft.value = translation.value?.gloss ?? ''
  editing.value = true
}

async function save(): Promise<void> {
  await store.saveOverride(props.text, draft.value)
  editing.value = false
}

async function restore(): Promise<void> {
  await store.removeOverride(props.text)
  editing.value = false
}
</script>

<template>
  <div class="gloss-view" data-testid="gloss-view">
    <div class="d-flex align-center flex-wrap ga-2 mb-2">
      <h3 class="text-subtitle-1 font-weight-medium">{{ $t('libras.title') }}</h3>
      <v-chip
        v-if="translation"
        :color="sourceColor[translation.source]"
        size="small"
        label
        data-testid="gloss-source"
        :data-source="translation.source"
      >
        {{ $t(`libras.sources.${translation.source}`) }}
        <v-tooltip activator="parent" location="top">
          {{ $t(`libras.sourceHints.${translation.source}`) }}
        </v-tooltip>
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="translation?.edited"
        size="small"
        variant="text"
        prepend-icon="mdi-restore"
        data-testid="gloss-restore"
        @click="restore"
      >
        {{ $t('libras.restore') }}
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-pencil"
        :disabled="!translation"
        data-testid="gloss-edit"
        @click="startEditing"
      >
        {{ $t('libras.edit') }}
      </v-btn>
    </div>

    <p v-if="!text.trim()" class="text-medium-emphasis">{{ $t('libras.empty') }}</p>
    <p v-else-if="loading" class="text-medium-emphasis">
      <v-icon class="mdi-spin" size="small">mdi-loading</v-icon> {{ $t('libras.loading') }}
    </p>
    <v-alert
      v-else-if="failed"
      type="error"
      variant="tonal"
      density="compact"
      :text="$t('libras.error')"
    />

    <div v-else-if="translation" class="d-flex flex-wrap ga-2" data-testid="gloss-tokens">
      <v-chip
        v-for="(token, index) in translation.tokens"
        :key="`${index}-${token.text}`"
        :color="tokenVisual[token.availability].color"
        :prepend-icon="tokenVisual[token.availability].icon"
        variant="tonal"
        label
        data-testid="gloss-token"
        :data-availability="token.availability"
      >
        {{ token.text }}
        <v-tooltip activator="parent" location="top">
          {{ $t(`libras.availability.${token.availability}`) }}
        </v-tooltip>
      </v-chip>
    </div>

    <v-alert
      v-if="
        (translation?.source === 'fallback' || translation?.source === 'local') &&
        translation.tokens.length
      "
      type="info"
      variant="tonal"
      density="compact"
      class="mt-3"
      data-testid="gloss-fallback-hint"
    >
      {{ $t(translation.source === 'local' ? 'libras.localHint' : 'libras.fallbackHint') }}
      <template #append>
        <v-btn size="small" variant="text" :to="{ name: 'settings' }">
          {{ $t('libras.openSettings') }}
        </v-btn>
      </template>
    </v-alert>

    <v-alert
      v-if="catalogMissing"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-3"
      data-testid="gloss-catalog-hint"
    >
      {{ $t('libras.catalogHint') }}
      <template #append>
        <v-btn
          size="small"
          variant="text"
          :loading="store.catalogBusy"
          data-testid="gloss-download-catalog"
          @click="store.refreshCatalog()"
        >
          {{ $t('libras.downloadCatalog') }}
        </v-btn>
      </template>
    </v-alert>

    <v-dialog v-model="editing" max-width="560">
      <v-card :title="$t('libras.editTitle')">
        <v-card-text>
          <p class="text-medium-emphasis mb-3">{{ text }}</p>
          <v-textarea
            v-model="draft"
            :label="$t('libras.editLabel')"
            :hint="$t('libras.editHint')"
            persistent-hint
            variant="outlined"
            rows="3"
            auto-grow
            autofocus
            data-testid="gloss-draft"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editing = false">{{ $t('libras.cancel') }}</v-btn>
          <v-btn color="primary" data-testid="gloss-save" @click="save">{{
            $t('libras.save')
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
