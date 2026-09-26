import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vuetify from 'vite-plugin-vuetify'

const root = resolve(__dirname)

// electron-vite is the Vite entry point of this project (equivalent to the
// vite.config.ts of the architecture document): it builds main, preload and
// renderer in one pipeline.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@': resolve(root, 'src') } },
    build: {
      rollupOptions: { input: { index: resolve(root, 'electron/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@': resolve(root, 'src') } },
    build: {
      rollupOptions: { input: { index: resolve(root, 'electron/preload/index.ts') } }
    }
  },
  renderer: {
    root,
    resolve: { alias: { '@': resolve(root, 'src') } },
    plugins: [
      vue(),
      vuetify({ autoImport: true, styles: { configFile: 'src/styles/vuetify.scss' } })
    ],
    // Vite's own default (5173) sits inside a port range Windows sometimes reserves for
    // Hyper-V/WSL2's NAT (`netsh interface ipv4 show excludedportrange protocol=tcp`) - when it
    // does, binding to it fails with EACCES, not EADDRINUSE, so Vite's usual "try the next port"
    // fallback never kicks in (it only retries on EADDRINUSE) and `npm run dev` cannot start at
    // all. A different, less commonly-reserved port sidesteps that - not a real fix for the
    // Windows-side reservation (it can still land on any port on a future reboot), but electron
    // itself is pointed at whatever port this picks automatically, so changing it here needs
    // nothing else to be updated.
    server: { port: 5679, strictPort: false },
    // Dev only. vite-plugin-vuetify's autoImport turns <v-btn> into a deep import
    // ('vuetify/components/VBtn') that Vite's start-up scan cannot see. Left to the pre-bundler,
    // each one was discovered on first use, which re-optimized the dependencies and reloaded the
    // whole window (a blank screen for seconds whenever a new page was opened). Excluding vuetify
    // is the setup Vuetify recommends: the plugin then processes its source directly.
    optimizeDeps: { exclude: ['vuetify'] },
    build: {
      rollupOptions: { input: { index: resolve(root, 'index.html') } }
    }
  }
})
