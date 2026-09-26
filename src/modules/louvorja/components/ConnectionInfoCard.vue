<script setup lang="ts">
/** A summary card for the Conexão page: which computer and which LouvorJA it is talking to. */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSection from '@/modules/settings/SettingsSection.vue'
import type { ConnectionStatus } from '../types/louvorja.types'

const props = defineProps<{ status: ConnectionStatus }>()
const { t, locale } = useI18n()

const computerLabel = computed(() => {
  const endpoint = props.status.endpoint
  return endpoint ? `${endpoint.host}:${endpoint.port}` : ''
})

const appLabel = computed(() => {
  const server = props.status.server
  if (!server) return ''
  return t('integration.info.appValue', { version: server.version ?? '?', protocol: server.protocol })
})

const connectedSince = computed(() => {
  const at = props.status.connectedAt
  return at ? new Date(at).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }) : ''
})
</script>

<template>
  <SettingsSection icon="mdi-card-account-details-outline" :title="$t('integration.info.title')">
    <p v-if="status.state === 'disconnected'" class="info-empty" data-testid="info-empty">
      {{ $t('integration.info.empty') }}
    </p>
    <template v-else>
      <div class="info-row" data-testid="info-computer">
        <v-icon size="20" class="info-icon">mdi-desktop-classic</v-icon>
        <div class="info-text">
          <span class="info-label">{{ $t('integration.info.computer') }}</span>
          <span class="info-value">{{ computerLabel }}</span>
        </div>

        <template v-if="connectedSince">
          <div class="info-divider" />
          <v-icon size="20" class="info-icon">mdi-clock-outline</v-icon>
          <div class="info-text info-text-since" data-testid="info-since">
            <span class="info-label">{{ $t('integration.info.since') }}</span>
            <span class="info-value">{{ connectedSince }}</span>
          </div>
        </template>
      </div>

      <div v-if="appLabel" class="info-row" data-testid="info-app">
        <v-icon size="20" class="info-icon">mdi-check-decagram-outline</v-icon>
        <div class="info-text">
          <span class="info-label">{{ $t('integration.info.app') }}</span>
          <span class="info-value">{{ appLabel }}</span>
        </div>
      </div>
    </template>
  </SettingsSection>
</template>

<style scoped>
.info-empty {
  color: var(--sidebar-text-secondary);
  font-size: 14px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
}

.info-icon {
  color: var(--accent-blue);
  flex-shrink: 0;
}

.info-text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

/* Shares the "computer" row instead of a whole row of its own: only as wide as it needs. */
.info-text-since {
  flex: 0 0 auto;
}

.info-divider {
  flex-shrink: 0;
  width: 1px;
  height: 28px;
  background: var(--border-color);
}

.info-label {
  color: var(--sidebar-text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  word-break: break-word;
}
</style>
