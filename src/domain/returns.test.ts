import { describe, expect, it } from 'vitest'
import { calculateRefundPortion } from './returns.js'

describe('calculateRefundPortion', () => {
  it('returns an exact remainder on the final partial return', () => {
    const first = calculateRefundPortion({
      lineTotalMinor: 1001,
      soldQuantity: 3,
      alreadyRefundedMinor: 0,
      alreadyReturnedQuantity: 0,
      returningQuantity: 1,
    })
    const last = calculateRefundPortion({
      lineTotalMinor: 1001,
      soldQuantity: 3,
      alreadyRefundedMinor: first,
      alreadyReturnedQuantity: 1,
      returningQuantity: 2,
    })

    expect(first + last).toBe(1001)
  })

  it('rejects returns that exceed remaining quantity', () => {
    expect(() =>
      calculateRefundPortion({
        lineTotalMinor: 1000,
        soldQuantity: 1,
        alreadyRefundedMinor: 0,
        alreadyReturnedQuantity: 0,
        returningQuantity: 2,
      }),
    ).toThrow('Return quantity or refund state is invalid')
  })
})
