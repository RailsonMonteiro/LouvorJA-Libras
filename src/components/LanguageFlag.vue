<script setup lang="ts">
import CountryFlag from 'vue-country-flag-next'
import { localeInfo } from '@/locales'
import type { AppLocale } from '@/types/settings'

withDefaults(defineProps<{ locale: AppLocale; size?: 'small' | 'normal' | 'big' }>(), {
  size: 'normal'
})
</script>

<template>
  <CountryFlag :country="localeInfo[locale].flag" :size="size" style="margin: 0; padding: 0" />
</template>
