import type { LouvorJAApi } from './ipc'

declare global {
  interface Window {
    louvorja: LouvorJAApi
  }
}

export {}
