import { describe, expect, it } from 'vitest'
import { calculatePrice } from './pricing.js'

describe('calculatePrice', () => {
  it('applies discount before demo tax and rounds in minor units', () => {
    const result = calculatePrice([
      {
        unitPriceMinor: 1299,
        quantity: 2,
        discountBasisPoints: 1000,
        taxBasisPoints: 825,
      },
    ])

    expect(result).toMatchObject({
      subtotalMinor: 2598,
      discountMinor: 260,
      taxMinor: 193,
      totalMinor: 2531,
    })
  })

  it('rejects empty sales and invalid quantities', () => {
    expect(() => calculatePrice([])).toThrow('at least one item')
    expect(() =>
      calculatePrice([
        {
          unitPriceMinor: 100,
          quantity: 0,
          discountBasisPoints: 0,
          taxBasisPoints: 0,
        },
      ]),
    ).toThrow('Quantity must be a positive safe integer')
  })

  it('rejects percentages above the allowed range', () => {
    expect(() =>
      calculatePrice([
        {
          unitPriceMinor: 100,
          quantity: 1,
          discountBasisPoints: 10_001,
          taxBasisPoints: 0,
        },
      ]),
    ).toThrow('Discount must be between 0 and 10000 basis points')
  })

  it('rejects unsafe line totals instead of rounding inaccurately', () => {
    expect(() =>
      calculatePrice([
        {
          unitPriceMinor: Number.MAX_SAFE_INTEGER,
          quantity: 2,
          discountBasisPoints: 0,
          taxBasisPoints: 0,
        },
      ]),
    ).toThrow('Line subtotal exceeds the supported money range')
  })

  it('accepts zero-priced lines and the exact maximum supported rates', () => {
    expect(
      calculatePrice([
        {
          unitPriceMinor: 0,
          quantity: 1,
          discountBasisPoints: 10_000,
          taxBasisPoints: 10_000,
        },
      ]),
    ).toMatchObject({
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
    })
  })

  it('rejects invalid price and tax inputs and aggregate overflow', () => {
    expect(() =>
      calculatePrice([
        {
          unitPriceMinor: -1,
          quantity: 1,
          discountBasisPoints: 0,
          taxBasisPoints: 0,
        },
      ]),
    ).toThrow('Unit price must be a non-negative safe integer')
    expect(() =>
      calculatePrice([
        {
          unitPriceMinor: 100,
          quantity: 1,
          discountBasisPoints: 0,
          taxBasisPoints: 10_000.5,
        },
      ]),
    ).toThrow('Tax must be between 0 and 10000 basis points')
    expect(() =>
      calculatePrice(
        [4_600_000_000_000_000, 4_600_000_000_000_000].map((unitPriceMinor) => ({
          unitPriceMinor,
          quantity: 1,
          discountBasisPoints: 0,
          taxBasisPoints: 0,
        })),
      ),
    ).toThrow('totalMinor exceeds the supported money range')
  })
})
