<script setup lang="ts">
import LanguageFlag from '@/components/LanguageFlag.vue'
import SegmentedPicker from '@/components/SegmentedPicker.vue'
import { localeInfo } from '@/locales'
import { APP_LOCALES, type AppLocale } from '@/types/settings'

/** The languages, each with its flag, in one compact strip. */
defineProps<{ modelValue: AppLocale }>()
const emit = defineEmits<{ 'update:modelValue': [locale: AppLocale] }>()

const options = APP_LOCALES.map((value) => ({ value, label: localeInfo[value].name }))
</script>

<template>
  <SegmentedPicker
    :model-value="modelValue"
    :options="options"
    test-id="setting-locale"
    option-test-id="locale"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #option="{ option }">
      <LanguageFlag :locale="option.value" size="small" />
    </template>
  </SegmentedPicker>
</template>
