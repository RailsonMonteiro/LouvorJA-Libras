<script setup lang="ts">
/**
 * A field for a web address: the name above it, a soft filled box with a link icon, and an accent
 * ring while it is being edited. Saving is up to the page: it hears "commit" when the field loses
 * focus or Enter is pressed.
 */
const address = defineModel<string>({ required: true })
defineProps<{ label: string; error?: string }>()
const emit = defineEmits<{ commit: [] }>()
</script>

<template>
  <div class="url-field">
    <label class="url-label">{{ label }}</label>
    <v-text-field
      v-model="address"
      :error-messages="error"
      variant="solo-filled"
      flat
      density="comfortable"
      hide-details="auto"
      prepend-inner-icon="mdi-link-variant"
      spellcheck="false"
      autocomplete="off"
      @blur="emit('commit')"
      @keydown.enter="emit('commit')"
    />
  </div>
</template>

<style scoped>
.url-label {
  display: block;
  margin: 0 2px 6px;
  color: var(--sidebar-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.url-field :deep(.v-field) {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
  font-size: 14px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.url-field :deep(.v-field:hover) {
  background: rgba(127, 127, 127, 0.11);
}

.url-field :deep(.v-field--focused) {
  border-color: var(--accent-blue);
  background: transparent;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
}

.url-field :deep(.v-field--error) {
  border-color: rgb(var(--v-theme-error));
}

/* The icon is only decoration: quiet until the field is in use. */
.url-field :deep(.v-field__prepend-inner .v-icon) {
  color: var(--sidebar-text-secondary);
  opacity: 0.8;
}

.url-field :deep(.v-field--focused .v-field__prepend-inner .v-icon) {
  color: var(--accent-blue);
  opacity: 1;
}
</style>
