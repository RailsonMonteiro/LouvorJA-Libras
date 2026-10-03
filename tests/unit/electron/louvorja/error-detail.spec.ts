import { describe, expect, it } from 'vitest'
import { describeError } from '../../../../electron/services/louvorja/adapters/errorDetail'

describe('describeError', () => {
  it('reads a plain Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })

  it('includes a Node system error code', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:7070') as Error & { code: string }
    error.code = 'ECONNREFUSED'
    expect(describeError(error)).toBe('connect ECONNREFUSED 127.0.0.1:7070 (ECONNREFUSED)')
  })

  it('walks the .cause chain fetch() hides the real reason behind', () => {
    const inner = new Error('connect ETIMEDOUT 192.168.0.10:7070') as Error & { code: string }
    inner.code = 'ETIMEDOUT'
    const outer = new Error('fetch failed', { cause: inner })
    expect(describeError(outer)).toBe(
      'fetch failed <- connect ETIMEDOUT 192.168.0.10:7070 (ETIMEDOUT)'
    )
  })

  it('does not loop forever on a self-referencing cause', () => {
    const error = new Error('loop') as Error & { cause?: unknown }
    error.cause = error
    expect(describeError(error)).toBe('loop')
  })

  it('falls back to String() for anything that is not an object', () => {
    expect(describeError('plain string')).toBe('plain string')
    expect(describeError(42)).toBe('42')
  })
})
