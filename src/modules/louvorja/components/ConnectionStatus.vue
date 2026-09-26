<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConnectionState, ConnectionStatus } from '../types/louvorja.types'

const props = defineProps<{ status: ConnectionStatus }>()
const { t } = useI18n()

const ICON: Record<ConnectionState, string> = {
  disconnected: 'mdi-lan-disconnect',
  connecting: 'mdi-lan-pending',
  connected: 'mdi-check-circle',
  reconnecting: 'mdi-lan-pending'
}

const busy = computed(() => ['connecting', 'reconnecting'].includes(props.status.state))

const endpointLabel = computed(() => {
  const endpoint = props.status.endpoint
  return endpoint ? `${endpoint.host}:${endpoint.port}` : ''
})

const errorMessage = computed(() => {
  const error = props.status.lastError
  if (!error) return ''
  const key = error.code === 'http-status' ? 'httpStatus' : error.code
  return t(`integration.errors.${key}`, { detail: error.detail ?? '' })
})

const retryLabel = computed(() =>
  props.status.retryInMs === null
    ? ''
    : t('integration.status.retryIn', { seconds: Math.ceil(props.status.retryInMs / 1000) })
)
</script>

<template>
  <div class="connection-status" data-testid="connection-status" :data-state="status.state">
    <div class="status-row">
      <v-icon
        :color="status.state === 'connected' ? 'success' : undefined"
        size="22"
        :class="{ 'mdi-spin': busy }"
      >
        {{ busy ? 'mdi-loading' : ICON[status.state] }}
      </v-icon>
      <div class="status-text">
        <template v-if="status.state === 'disconnected'">
          {{ $t('integration.status.idle') }}
        </template>
        <template v-else>
          <div data-testid="connection-endpoint">
            {{ $t('integration.status.endpoint', { endpoint: endpointLabel }) }}
          </div>
          <div
            v-if="status.server"
            class="text-caption text-medium-emphasis"
            data-testid="connection-server"
          >
            {{
              $t('integration.status.server', {
                version: status.server.version ?? '?',
                protocol: status.server.protocol
              })
            }}
          </div>
          <div v-if="status.attempt > 0" class="text-caption text-medium-emphasis">
            {{ $t('integration.status.attempt', { n: status.attempt }) }}
            <template v-if="retryLabel"> · {{ retryLabel }}</template>
          </div>
        </template>
      </div>
    </div>

    <v-alert
      v-if="errorMessage && status.state !== 'connected'"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-3"
      data-testid="connection-error"
      :text="errorMessage"
    />
  </div>
</template>

<style scoped>
/* The same soft row used for status lines in Settings: an icon, then what it means. */
.status-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
}

.status-text {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
  font-size: 14px;
}
</style>
