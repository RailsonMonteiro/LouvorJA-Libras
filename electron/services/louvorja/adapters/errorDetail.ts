/**
 * A readable chain of what actually went wrong, Node's own system error code included
 * (`ECONNREFUSED`, `ETIMEDOUT`, `ENETUNREACH`, `ENOTFOUND`...).
 *
 * `fetch()` (undici) wraps every network failure in a generic `TypeError: fetch failed` -
 * logging just `.message` loses exactly the detail that tells "wrong address" (`ECONNREFUSED`,
 * answered at once) apart from "something is silently dropping it" (`ETIMEDOUT` - a common
 * Windows Firewall symptom, see docs/protocolo-louvorja.md). The real reason is one or more
 * `.cause` levels down; `ws`'s own connection errors carry the same `.code` directly.
 */
export function describeError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const err = current as { message?: unknown; code?: unknown; cause?: unknown }
    const code = typeof err.code === 'string' ? ` (${err.code})` : ''
    parts.push(`${typeof err.message === 'string' ? err.message : String(current)}${code}`)
    current = err.cause
  }
  return parts.length > 0 ? parts.join(' <- ') : String(error)
}
