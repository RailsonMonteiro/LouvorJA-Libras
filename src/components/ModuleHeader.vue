<script setup lang="ts">
const props = withDefaults(defineProps<{ title: string; icon?: string; testId?: string }>(), {
  icon: 'mdi-puzzle',
  testId: 'module-title'
})

/** Flaticon icons ("fi fi-...") are plain classes, not a Vuetify icon name for <v-icon>. */
const isFlaticon = props.icon.startsWith('fi ')
</script>

<template>
  <header class="module-header d-flex align-center justify-space-between flex-wrap ga-4">
    <div class="d-flex align-center">
      <div class="module-icon-box d-flex align-center justify-center mr-4">
        <i v-if="isFlaticon" class="module-icon-fi" :class="icon" />
        <v-icon v-else :icon="icon" size="24" />
      </div>
      <h1 class="module-title gradient-text" :data-testid="testId">{{ title }}</h1>
      <slot name="title-actions" />
    </div>
    <div class="d-flex align-center justify-end flex-grow-1">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.module-header {
  padding-bottom: 24px;
}

.module-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.module-icon-fi {
  font-size: 24px;
}
</style>
