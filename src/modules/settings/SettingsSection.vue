<script setup lang="ts">
/**
 * A block of related settings: a round icon, a title, a line about what it is for, then the
 * controls. Something small can sit on the right of the header (a state, for example).
 */
defineProps<{ icon: string; title: string; description?: string }>()
</script>

<template>
  <section class="settings-section">
    <header class="section-header">
      <span class="section-badge">
        <v-icon size="20">{{ icon }}</v-icon>
      </span>
      <div class="section-heading">
        <h2 class="section-title">{{ title }}</h2>
        <p v-if="description" class="section-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="section-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  padding: 20px 22px 22px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--card-bg);
  box-shadow: var(--shadow);
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}

.section-badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(20, 184, 166, 0.18) 100%);
  color: var(--accent-blue);
}

.section-heading {
  flex: 1;
  min-width: 0;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 38px;
}

.section-description {
  margin: -4px 0 0;
  color: var(--sidebar-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.section-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  height: 38px;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
