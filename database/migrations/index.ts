import type { Migration } from '../../electron/services/migrator'

// SQL files are bundled as strings so they also work inside the packaged asar.
const files = import.meta.glob('./*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

export const migrations: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ name: path.replace(/^\.\//, '').replace(/\.sql$/, ''), sql }))
  .sort((a, b) => a.name.localeCompare(b.name))
