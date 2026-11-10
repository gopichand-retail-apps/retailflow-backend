export interface PriceInput {
  unitPriceMinor: number
  quantity: number
  discountBasisPoints: number
  taxBasisPoints: number
}

export interface PricedLine {
  unitPriceMinor: number
  quantity: number
  subtotalMinor: number
  discountMinor: number
  taxableMinor: number
  taxMinor: number
  totalMinor: number
}

export interface PriceSummary {
  lines: PricedLine[]
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
}

const BASIS_POINTS_PER_WHOLE = 10_000n
const MAX_PERCENT_BASIS_POINTS = 10_000

function assertSafeAmount(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${field} exceeds the supported money range`)
  }

  return Number(value)
}

function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  const amount = BigInt(amountMinor)
  const rate = BigInt(basisPoints)
  const rounded = (amount * rate + BASIS_POINTS_PER_WHOLE / 2n) / BASIS_POINTS_PER_WHOLE
  return assertSafeAmount(rounded, 'Calculated amount')
}

function validateLine(input: PriceInput): void {
  if (!Number.isSafeInteger(input.unitPriceMinor) || input.unitPriceMinor < 0) {
    throw new RangeError('Unit price must be a non-negative safe integer in minor units')
  }

  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError('Quantity must be a positive safe integer')
  }

  if (
    !Number.isInteger(input.discountBasisPoints) ||
    input.discountBasisPoints < 0 ||
    input.discountBasisPoints > MAX_PERCENT_BASIS_POINTS
  ) {
    throw new RangeError('Discount must be between 0 and 10000 basis points')
  }

  if (
    !Number.isInteger(input.taxBasisPoints) ||
    input.taxBasisPoints < 0 ||
    input.taxBasisPoints > MAX_PERCENT_BASIS_POINTS
  ) {
    throw new RangeError('Tax must be between 0 and 10000 basis points')
  }
}

function priceLine(input: PriceInput): PricedLine {
  validateLine(input)

  const subtotalMinor = assertSafeAmount(BigInt(input.unitPriceMinor) * BigInt(input.quantity), 'Line subtotal')
  const discountMinor = applyBasisPoints(subtotalMinor, input.discountBasisPoints)
  const taxableMinor = subtotalMinor - discountMinor
  const taxMinor = applyBasisPoints(taxableMinor, input.taxBasisPoints)

  return {
    unitPriceMinor: input.unitPriceMinor,
    quantity: input.quantity,
    subtotalMinor,
    discountMinor,
    taxableMinor,
    taxMinor,
    totalMinor: taxableMinor + taxMinor,
  }
}

export function calculatePrice(inputs: PriceInput[]): PriceSummary {
  if (inputs.length === 0) {
    throw new RangeError('A sale must contain at least one item')
  }

  const lines = inputs.map(priceLine)
  const subtotalMinor = lines.reduce((total, line) => total + line.subtotalMinor, 0)
  const discountMinor = lines.reduce((total, line) => total + line.discountMinor, 0)
  const taxMinor = lines.reduce((total, line) => total + line.taxMinor, 0)
  const totalMinor = lines.reduce((total, line) => total + line.totalMinor, 0)

  for (const [field, value] of Object.entries({
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor,
  })) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${field} exceeds the supported money range`)
    }
  }

  return { lines, subtotalMinor, discountMinor, taxMinor, totalMinor }
}
