<script setup lang="ts" generic="T extends string">
/**
 * A compact "pick one" control: the choices side by side in one rounded strip, the chosen one
 * raised and in the accent colour. Each choice can show an icon or a flag before its name.
 */
export interface SegmentedOption<V extends string> {
  value: V
  label: string
  /** For screen readers, when the visible content is not enough. */
  ariaLabel?: string
}

defineProps<{
  modelValue: T
  options: SegmentedOption<T>[]
  disabled?: boolean
  testId?: string
  optionTestId?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div class="segmented" role="radiogroup" :class="{ disabled }" :data-testid="testId">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="segment"
      :class="{ selected: modelValue === option.value }"
      :disabled="disabled"
      :aria-checked="modelValue === option.value"
      :aria-label="option.ariaLabel ?? option.label"
      :data-testid="optionTestId ? `${optionTestId}-${option.value}` : undefined"
      @click="emit('update:modelValue', option.value)"
    >
      <slot name="option" :option="option" :selected="modelValue === option.value" />
      <span class="label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.07);
}

.segment {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--sidebar-text-secondary);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.segment:hover {
  color: var(--sidebar-text);
}

.segment:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 1px;
}

.segment.selected {
  background: var(--card-bg);
  color: var(--accent-blue);
  font-weight: 600;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(99, 102, 241, 0.35);
}

.segmented.disabled .segment {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
