import type { AdapterFactory } from './LouvorJAAdapter'
import { LouvorJAApiAdapter, type LouvorJAApiAdapterOptions } from './LouvorJAApiAdapter'

/** The adapter for the LouvorJA transmission server. A different protocol would be chosen here. */
export function createAdapterFactory(options: LouvorJAApiAdapterOptions = {}): AdapterFactory {
  return (endpoint) => new LouvorJAApiAdapter(endpoint, options)
}
