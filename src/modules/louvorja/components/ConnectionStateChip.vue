<script setup lang="ts">
/** Small pill for the connection card's header: a coloured dot and the state, nothing else. */
import { computed } from 'vue'
import type { ConnectionState } from '../types/louvorja.types'

const props = defineProps<{ state: ConnectionState }>()

const COLOR: Record<ConnectionState, string | undefined> = {
  disconnected: undefined,
  connecting: 'warning',
  connected: 'success',
  reconnecting: 'warning'
}

const busy = computed(() => props.state === 'connecting' || props.state === 'reconnecting')
</script>

<template>
  <v-chip
    :color="COLOR[state]"
    variant="tonal"
    size="small"
    label
    data-testid="connection-state-chip"
    :data-state="state"
  >
    <v-icon start size="10" :class="{ 'mdi-spin': busy }">
      {{ busy ? 'mdi-loading' : 'mdi-circle' }}
    </v-icon>
    <span data-testid="connection-state">{{ $t(`integration.states.${state}`) }}</span>
  </v-chip>
</template>
