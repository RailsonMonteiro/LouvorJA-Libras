<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SegmentedPicker from '@/components/SegmentedPicker.vue'
import { THEME_MODES, type ThemeMode } from '@/types/settings'

/** The themes in one compact strip, each with an icon. */
defineProps<{ modelValue: ThemeMode }>()
const emit = defineEmits<{ 'update:modelValue': [theme: ThemeMode] }>()

const { t } = useI18n()

const ICONS: Record<ThemeMode, string> = {
  system: 'mdi-theme-light-dark',
  light: 'mdi-white-balance-sunny',
  dark: 'mdi-weather-night'
}

// Recomputed when the language changes, so the names follow it.
const options = computed(() =>
  THEME_MODES.map((value) => ({ value, label: t(`settings.themes.${value}`) }))
)
</script>

<template>
  <SegmentedPicker
    :model-value="modelValue"
    :options="options"
    test-id="setting-theme"
    option-test-id="theme"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #option="{ option }">
      <v-icon size="18">{{ ICONS[option.value] }}</v-icon>
    </template>
  </SegmentedPicker>
</template>
