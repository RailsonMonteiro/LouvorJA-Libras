<script setup lang="ts">
export interface DeveloperLink {
  icon: string
  url: string
  label: string
}

/**
 * One person's card in "Sobre" → "Créditos": a photo, name, role, a line about what they did,
 * and a row of small round buttons to their GitHub/site/socials/email. `target="_blank"` sends
 * every one of these through the main process's window-open guard (electron/main/security), which
 * opens `https:`/`mailto:` links in the system browser/mail app instead of inside the window.
 */
defineProps<{
  name: string
  role: string
  avatarUrl: string
  description?: string
  links: DeveloperLink[]
}>()
</script>

<template>
  <div class="developer-card">
    <v-avatar size="64" class="developer-avatar">
      <v-img :src="avatarUrl" :alt="name" />
    </v-avatar>
    <div class="developer-info">
      <div class="developer-name">{{ name }}</div>
      <div class="developer-role">{{ role }}</div>
      <p v-if="description" class="developer-description">{{ description }}</p>
      <div class="developer-links">
        <a
          v-for="link in links"
          :key="link.url"
          :href="link.url"
          :aria-label="link.label"
          target="_blank"
          rel="noopener noreferrer"
          class="developer-link"
        >
          <v-icon size="18">{{ link.icon }}</v-icon>
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.developer-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.developer-avatar {
  flex-shrink: 0;
}

.developer-info {
  min-width: 0;
}

.developer-name {
  font-size: 16px;
  font-weight: 700;
}

.developer-role {
  margin-top: 1px;
  color: var(--accent-blue);
  font-size: 13px;
  font-weight: 600;
}

.developer-description {
  margin: 8px 0 0;
  color: var(--sidebar-text-secondary);
  font-size: 13px;
}

.developer-links {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.developer-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-blue);
  text-decoration: none;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}

.developer-link:hover {
  background: rgba(99, 102, 241, 0.18);
  transform: translateY(-1px);
}
</style>
