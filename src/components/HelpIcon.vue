<script setup lang="ts">
// The only place that uses the "solid rounded" Flaticon family (see NOTICE.md for the required
// credit): a single info icon, reused everywhere a block of help text used to sit inline as a
// permanent alert. Click opens a small popover instead of taking up space all the time.
import '@flaticon/flaticon-uicons/css/solid/rounded.css'

defineProps<{ title: string; text: string; testId?: string }>()
</script>

<template>
  <v-menu :close-on-content-click="false" location="bottom start" :max-width="360">
    <template #activator="{ props: menuProps }">
      <button
        type="button"
        class="help-icon-btn"
        v-bind="menuProps"
        :aria-label="title"
        :data-testid="testId"
      >
        <i class="fi fi-sr-info" />
      </button>
    </template>

    <div class="help-popover" :data-testid="testId ? `${testId}-content` : undefined">
      <div class="help-popover-title">{{ title }}</div>
      <div class="help-popover-text">{{ text }}</div>
    </div>
  </v-menu>
</template>

<style scoped>
.help-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: rgb(var(--v-theme-info));
  font-size: 17px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.help-icon-btn:hover,
.help-icon-btn:focus-visible {
  background: rgba(var(--v-theme-info), 0.12);
}

.help-popover {
  max-width: 360px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--card-bg);
  box-shadow: var(--shadow-hover);
}

.help-popover-title {
  margin-bottom: 4px;
  color: rgb(var(--v-theme-info));
  font-size: 14px;
  font-weight: 600;
}

.help-popover-text {
  color: var(--sidebar-text);
  font-size: 13px;
  line-height: 1.5;
}
</style>
