<script setup lang="ts">
import { ref, watch } from 'vue'
import HelpIcon from '@/components/HelpIcon.vue'
import ModuleHeader from '@/components/ModuleHeader.vue'
import SettingsSection from '@/modules/settings/SettingsSection.vue'
import ConnectionForm from './components/ConnectionForm.vue'
import ConnectionInfoCard from './components/ConnectionInfoCard.vue'
import ConnectionStateChip from './components/ConnectionStateChip.vue'
import ConnectionStatus from './components/ConnectionStatus.vue'
import { useLouvorJAStore } from './stores/louvorja.store'

const store = useLouvorJAStore()

// Starts empty: the user types the address every time, nothing is guessed for them. If a
// connection is already active (e.g. reconnected by itself at start-up), the form follows it.
const form = ref<{ host: string; port: number | null; token: string }>({
  host: '',
  port: null,
  token: ''
})

watch(
  () => store.status.endpoint,
  (endpoint) => {
    if (endpoint) form.value = { host: endpoint.host, port: endpoint.port, token: endpoint.token }
  },
  { immediate: true }
)
</script>

<template>
  <div class="page-container">
    <ModuleHeader :title="$t('integration.title')" icon="fi fi-rr-link" test-id="louvorja-title" />

    <v-row>
      <v-col cols="12" md="6">
        <ConnectionInfoCard :status="store.status" />
      </v-col>
    </v-row>

    <v-row class="mt-2">
      <v-col cols="12" md="6">
        <SettingsSection icon="mdi-link-variant" :title="$t('integration.form.title')">
          <template #actions>
            <HelpIcon
              :title="$t('integration.help.title')"
              :text="$t('integration.help.text')"
              test-id="connection-help"
            />
            <ConnectionStateChip :state="store.status.state" />
          </template>

          <ConnectionStatus :status="store.status" />
          <ConnectionForm v-model="form" />
        </SettingsSection>
      </v-col>
    </v-row>
  </div>
</template>
