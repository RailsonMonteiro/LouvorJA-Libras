import { defineStore } from 'pinia'
import { ref, shallowReactive, watch } from 'vue'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { api } from '@/services/api'
import { textKey } from '../core/GlossParser'
import type { CatalogStatus, TranslationResult } from '../types/libras.types'

export const useLibrasStore = defineStore('libras', () => {
  const catalog = ref<CatalogStatus | null>(null)
  const catalogBusy = ref(false)
  const catalogError = ref(false)
  /** Translations already obtained in this session, by normalised text. */
  const translations = shallowReactive(new Map<string, TranslationResult>())
  const pending = new Map<string, Promise<TranslationResult | null>>()

  function get(text: string): TranslationResult | null {
    return translations.get(textKey(text)) ?? null
  }

  /** Translates once per text; later calls (and other components) reuse the result. */
  function ensure(text: string): Promise<TranslationResult | null> {
    const key = textKey(text)
    if (!key) return Promise.resolve(null)
    const known = translations.get(key)
    if (known) return Promise.resolve(known)

    let request = pending.get(key)
    if (!request) {
      request = api()
        .libras.translate(text)
        .then((result) => {
          translations.set(key, result)
          return result
        })
        .catch(() => null)
        .finally(() => pending.delete(key))
      pending.set(key, request)
    }
    return request
  }

  async function saveOverride(text: string, gloss: string): Promise<void> {
    translations.set(textKey(text), await api().libras.saveOverride(text, gloss))
  }

  async function removeOverride(text: string): Promise<void> {
    translations.set(textKey(text), await api().libras.removeOverride(text))
  }

  async function loadCatalog(): Promise<void> {
    catalog.value = await api().libras.getCatalogStatus()
  }

  async function refreshCatalog(): Promise<boolean> {
    catalogBusy.value = true
    catalogError.value = false
    try {
      catalog.value = await api().libras.refreshCatalog()
      // Availability of every remembered translation changed: ask again.
      translations.clear()
      return true
    } catch {
      catalogError.value = true
      return false
    } finally {
      catalogBusy.value = false
    }
  }

  /** Loads the catalog status and keeps the live slide translated ahead of time. */
  async function init(): Promise<void> {
    await loadCatalog()
    const louvorja = useLouvorJAStore()
    // The current slide first, then the one that comes next, so it is ready when it appears.
    watch(
      () => [louvorja.currentSlide?.text, louvorja.currentSlide?.nextText] as const,
      async ([text, nextText]) => {
        if (text) await ensure(text)
        if (nextText) await ensure(nextText)
      },
      { immediate: true }
    )
  }

  return {
    catalog,
    catalogBusy,
    catalogError,
    translations,
    get,
    ensure,
    saveOverride,
    removeOverride,
    loadCatalog,
    refreshCatalog,
    init
  }
})
