import { describe, expect, it } from 'vitest'
import { ApiError, requireValue } from './api-error.js'

describe('API errors', () => {
  it('returns present values and rejects both absent authentication values', () => {
    expect(requireValue('cashier-session')).toBe('cashier-session')
    expect(() => requireValue(null)).toThrow(ApiError)
    expect(() => requireValue(undefined, 'Store settings were not found')).toThrow('Store settings were not found')
  })

  it('retains the stable status and code for authentication errors', () => {
    let failure: unknown
    try {
      requireValue(undefined)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(ApiError)
    if (failure instanceof ApiError) {
      expect(failure).toMatchObject({ status: 401, code: 'AUTH_REQUIRED', message: 'Authentication required' })
    }
  })
})
