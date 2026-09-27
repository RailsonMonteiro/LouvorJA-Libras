<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLouvorJAStore } from '../stores/louvorja.store'
import {
  DEFAULT_PORT,
  isValidHost,
  isValidPort,
  isValidToken,
  parseLouvorJALink
} from '../types/louvorja.types'

const endpoint = defineModel<{ host: string; port: number | null; token: string }>({
  required: true
})
const store = useLouvorJAStore()
const touched = ref(false)
const showToken = ref(false)

const hostValid = computed(() => isValidHost(endpoint.value.host.trim()))
const portValid = computed(() => endpoint.value.port !== null && isValidPort(endpoint.value.port))
const tokenValid = computed(() => isValidToken(endpoint.value.token.trim()))
const canConnect = computed(() => hostValid.value && portValid.value && tokenValid.value)

/**
 * Whichever field the whole LouvorJA link lands in, fill all three from it instead of pasting it
 * as plain text into one field - see parseLouvorJALink. A normal paste (anything else) is left
 * completely alone.
 */
function pasteLink(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text')
  if (!text) return
  const parsed = parseLouvorJALink(text)
  if (!parsed) return

  event.preventDefault()
  if (parsed.host) endpoint.value.host = parsed.host
  if (parsed.port) endpoint.value.port = parsed.port
  if (parsed.token) endpoint.value.token = parsed.token
  touched.value = false
}

async function submit(): Promise<void> {
  if (store.isActive) return void (await store.disconnect())
  touched.value = true
  if (!canConnect.value) return
  await store.connect({
    host: endpoint.value.host.trim(),
    port: Number(endpoint.value.port),
    token: endpoint.value.token.trim()
  })
}
</script>

<template>
  <v-form
    class="connection-form"
    data-testid="connection-form"
    @submit.prevent="submit"
    @paste="pasteLink"
  >
    <div class="field-row">
      <div class="field host-field">
        <label class="field-label">{{ $t('integration.form.host') }}</label>
        <v-text-field
          v-model="endpoint.host"
          :placeholder="$t('integration.form.hostHint')"
          :error-messages="touched && !hostValid ? $t('integration.form.hostInvalid') : ''"
          :disabled="store.isActive"
          variant="solo-filled"
          flat
          density="comfortable"
          hide-details="auto"
          prepend-inner-icon="mdi-desktop-classic"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          data-testid="field-host"
          @update:model-value="touched = false"
        />
      </div>
      <div class="field port-field">
        <label class="field-label">{{ $t('integration.form.port') }}</label>
        <v-text-field
          v-model.number="endpoint.port"
          :placeholder="String(DEFAULT_PORT)"
          :error-messages="touched && !portValid ? $t('integration.form.portInvalid') : ''"
          :disabled="store.isActive"
          type="number"
          variant="solo-filled"
          flat
          density="comfortable"
          hide-details="auto"
          prepend-inner-icon="mdi-numeric"
          data-testid="field-port"
          @update:model-value="touched = false"
        />
      </div>
    </div>

    <div class="field token-field">
      <label class="field-label">{{ $t('integration.form.token') }}</label>
      <v-text-field
        v-model="endpoint.token"
        :hint="$t('integration.form.tokenHint')"
        persistent-hint
        :error-messages="touched && !tokenValid ? $t('integration.form.tokenInvalid') : ''"
        :disabled="store.isActive"
        :type="showToken ? 'text' : 'password'"
        :append-inner-icon="showToken ? 'mdi-eye-off' : 'mdi-eye'"
        variant="solo-filled"
        flat
        density="comfortable"
        hide-details="auto"
        prepend-inner-icon="mdi-key-variant"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        data-testid="field-token"
        @click:append-inner="showToken = !showToken"
        @update:model-value="touched = false"
      />
    </div>

    <v-btn
      type="submit"
      size="default"
      rounded="lg"
      class="connect-action"
      :color="store.isActive ? 'error' : 'primary'"
      :variant="store.isActive ? 'tonal' : 'flat'"
      :prepend-icon="store.isActive ? 'mdi-power-plug-off-outline' : 'mdi-power-plug-outline'"
      data-testid="connect-button"
    >
      {{
        store.status.state === 'connected'
          ? $t('integration.disconnect')
          : store.isActive
            ? $t('integration.cancel')
            : $t('integration.connect')
      }}
    </v-btn>
  </v-form>
</template>

<style scoped>
.connection-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field-label {
  display: block;
  margin: 0 2px 6px;
  color: var(--sidebar-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.field-row {
  display: flex;
  gap: 16px;
}

.host-field {
  flex: 1;
  min-width: 0;
}

.port-field {
  flex: 0 0 140px;
}

/* The same soft filled look as the address fields in Settings (UrlField.vue): a tinted box, no
   visible border until focused, then an accent glow instead of the default underline. */
.connection-form :deep(.v-field) {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
  font-size: 14px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.connection-form :deep(.v-field:hover) {
  background: rgba(127, 127, 127, 0.11);
}

.connection-form :deep(.v-field--focused) {
  border-color: var(--accent-blue);
  background: transparent;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
}

.connection-form :deep(.v-field--error) {
  border-color: rgb(var(--v-theme-error));
}

.connection-form :deep(.v-field__prepend-inner .v-icon) {
  color: var(--sidebar-text-secondary);
  opacity: 0.8;
}

.connection-form :deep(.v-field--focused .v-field__prepend-inner .v-icon) {
  color: var(--accent-blue);
  opacity: 1;
}

.connect-action {
  align-self: flex-start;
  margin-top: 4px;
  letter-spacing: 0.5px;
}
</style>
