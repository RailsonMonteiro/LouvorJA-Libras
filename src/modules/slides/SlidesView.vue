<script setup lang="ts">
import { computed, ref } from 'vue'
import ModuleHeader from '@/components/ModuleHeader.vue'
import SlidePreview from '@/components/SlidePreview.vue'
import GlossView from '@/modules/libras/components/GlossView.vue'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'

const store = useLouvorJAStore()

/** Slide picked from the history for viewing; null follows the live slide. */
const selectedKey = ref<string | null>(null)
const keyOf = (slide: { id: string; receivedAt: string }): string =>
  `${slide.id}@${slide.receivedAt}`

const history = computed(() => [...store.recentSlides].reverse())
const selected = computed(
  () => history.value.find((slide) => keyOf(slide) === selectedKey.value) ?? null
)
const shown = computed(() => selected.value ?? store.currentSlide)
const isLive = computed(() => selected.value === null)
</script>

<template>
  <div class="page-container">
    <ModuleHeader :title="$t('slides.title')" icon="mdi-presentation" test-id="slides-title" />

    <v-card v-if="!store.currentSlide" data-testid="slides-empty">
      <v-card-text class="text-center py-12">
        <v-icon size="64" class="mb-4" color="primary">mdi-presentation-play</v-icon>
        <h2 class="text-h6 mb-2">{{ $t('slides.empty') }}</h2>
        <p class="text-medium-emphasis mb-6">{{ $t('slides.emptyHint') }}</p>
        <v-btn :to="{ name: 'louvorja' }" color="primary" prepend-icon="mdi-lan-connect">
          {{ $t('slides.goToIntegration') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-row v-else>
      <v-col cols="12" lg="8">
        <v-card :title="$t('slides.current')" prepend-icon="mdi-presentation">
          <template #append>
            <v-chip v-if="isLive" color="error" size="small" label data-testid="live-chip">
              <v-icon start size="small">mdi-circle</v-icon>{{ $t('slides.live') }}
            </v-chip>
            <v-btn
              v-else
              size="small"
              variant="tonal"
              color="primary"
              data-testid="back-to-live"
              @click="selectedKey = null"
            >
              {{ $t('slides.backToLive') }}
            </v-btn>
          </template>
          <v-card-text>
            <SlidePreview :slide="shown" test-id="slides-current" />
            <p class="text-medium-emphasis mt-3 mb-0">
              <span v-if="store.presentation">
                {{
                  $t('slides.presentation', {
                    title: store.presentation.title || $t('slides.untitled')
                  })
                }}
              </span>
              <span v-else>{{ $t('slides.noPresentation') }}</span>
              <template v-if="shown?.index !== null && shown?.total">
                ·
                {{ $t('slides.position', { n: (shown?.index ?? 0) + 1, total: shown?.total }) }}
              </template>
              <template v-if="shown"> · {{ $t(`slides.kinds.${shown.kind}`) }}</template>
            </p>
          </v-card-text>
        </v-card>

        <v-card class="mt-6" data-testid="gloss-card">
          <v-card-text>
            <GlossView :text="shown?.text ?? ''" />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" lg="4">
        <v-card :title="$t('slides.received')" prepend-icon="mdi-format-list-bulleted">
          <v-list bg-color="transparent" density="compact" data-testid="slides-history">
            <v-list-item
              v-for="slide in history"
              :key="keyOf(slide)"
              :active="shown !== null && keyOf(slide) === keyOf(shown)"
              :title="slide.text.split('\n')[0]"
              :subtitle="slide.title ?? $t(`slides.kinds.${slide.kind}`)"
              @click="selectedKey = slide === store.currentSlide ? null : keyOf(slide)"
            />
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
