export interface RefundPortionInput {
  lineTotalMinor: number
  soldQuantity: number
  alreadyRefundedMinor: number
  alreadyReturnedQuantity: number
  returningQuantity: number
}

export function calculateRefundPortion(input: RefundPortionInput): number {
  const remainingQuantity = input.soldQuantity - input.alreadyReturnedQuantity
  const remainingRefund = input.lineTotalMinor - input.alreadyRefundedMinor

  if (
    !Number.isSafeInteger(input.lineTotalMinor) ||
    !Number.isSafeInteger(input.soldQuantity) ||
    !Number.isSafeInteger(input.alreadyRefundedMinor) ||
    !Number.isSafeInteger(input.alreadyReturnedQuantity) ||
    !Number.isSafeInteger(input.returningQuantity) ||
    remainingQuantity < 1 ||
    input.returningQuantity < 1 ||
    input.returningQuantity > remainingQuantity ||
    remainingRefund < 0
  ) {
    throw new RangeError('Return quantity or refund state is invalid')
  }

  if (input.returningQuantity === remainingQuantity) {
    return remainingRefund
  }

  const numerator = BigInt(remainingRefund) * BigInt(input.returningQuantity)
  const rounded = (numerator + BigInt(remainingQuantity) / 2n) / BigInt(remainingQuantity)
  return Number(rounded)
}
