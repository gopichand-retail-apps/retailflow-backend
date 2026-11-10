import { randomUUID } from 'node:crypto'
import type { DemoUser, RetailDatabase } from '../db/database.js'
import { calculateRefundPortion } from '../domain/returns.js'
import { ApiError, requireValue } from '../http/api-error.js'
import { recordAuditEvent } from '../http/audit.js'
import type { ReturnInput } from '../sales-schema.js'
import { findSale, hashRequest, listSaleLines, type SaleLineRow } from './sales-service.js'

export async function createReturn(input: {
  database: RetailDatabase
  user: DemoUser
  saleId: string
  body: ReturnInput
  idempotencyKey: string
}) {
  const { database, user, saleId, body, idempotencyKey } = input
  const requestHash = hashRequest(body)
  const existing = await findReturnByKey(database, idempotencyKey, requestHash)
  if (existing) return getReturn(database, existing.id)

  return database.transaction(async () => {
    const sale = await findSale(database, saleId, user, true)
    const duplicate = await findReturnByKey(database, idempotencyKey, requestHash)
    if (duplicate) return getReturn(database, duplicate.id)

    const lines = await listSaleLines(database, saleId)
    const items = calculateReturnItems(lines, body)
    const refundMinor = items.reduce((sum, item) => sum + item.refundMinor, 0)
    if (refundMinor < 1) throw new ApiError(409, 'RETURN_EMPTY', 'This sale has no refundable amount remaining')

    const returnId = randomUUID()
    const inserted = await database.query<{ id: string }>(
      `INSERT INTO returns (
        id, store_id, sale_id, supervisor_id, idempotency_key, request_hash, reason, refund_minor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [returnId, user.storeId, sale.id, user.id, idempotencyKey, requestHash, body.reason, refundMinor],
    )
    if (inserted.rows.length === 0) {
      const concurrentDuplicate = await findReturnByKey(database, idempotencyKey, requestHash)
      if (concurrentDuplicate) return getReturn(database, concurrentDuplicate.id)
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Return request was already processed')
    }

    await persistReturnLines(database, user, returnId, items)
    await updateSaleReturnStatus(database, saleId)
    await recordAuditEvent(database, {
      storeId: user.storeId,
      actorId: user.id,
      eventName: 'sale.returned',
      entityType: 'sale',
      entityId: saleId,
      metadata: { itemCount: items.length, refundMinor, reason: body.reason },
    })
    return { id: returnId, saleId, refundMinor, reason: body.reason }
  })
}

function calculateReturnItems(lines: SaleLineRow[], body: ReturnInput) {
  const quantities = new Map<string, number>()
  for (const item of body.items) {
    quantities.set(item.saleLineId, (quantities.get(item.saleLineId) ?? 0) + item.quantity)
  }

  return [...quantities.entries()].map(([lineId, quantity]) => {
    const line = lines.find((candidate) => candidate.id === lineId)
    if (!line) throw new ApiError(404, 'SALE_LINE_NOT_FOUND', 'One or more sale items were not found')
    if (quantity > line.quantity - line.returnedQuantity) {
      throw new ApiError(409, 'RETURN_QUANTITY_EXCEEDED', 'Return quantity exceeds the items remaining')
    }

    const refundMinor = calculateRefundPortion({
      lineTotalMinor: line.totalMinor,
      soldQuantity: line.quantity,
      alreadyRefundedMinor: line.refundedMinor,
      alreadyReturnedQuantity: line.returnedQuantity,
      returningQuantity: quantity,
    })
    return { line, quantity, refundMinor }
  })
}

async function findReturnByKey(database: RetailDatabase, key: string, requestHash: string) {
  const result = await database.query<{ id: string; requestHash: string }>(
    'SELECT id, request_hash AS "requestHash" FROM returns WHERE idempotency_key = $1',
    [key],
  )
  const duplicate = result.rows[0]
  if (duplicate && duplicate.requestHash !== requestHash) {
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'That key was already used for a different return')
  }
  return duplicate
}

async function persistReturnLines(
  database: RetailDatabase,
  user: DemoUser,
  returnId: string,
  items: Array<{ line: SaleLineRow; quantity: number; refundMinor: number }>,
): Promise<void> {
  for (const item of items) {
    await database.query(
      `INSERT INTO return_lines (id, return_id, sale_line_id, product_id, quantity, refund_minor)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), returnId, item.line.id, item.line.productId, item.quantity, item.refundMinor],
    )
    await database.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND store_id = $3', [
      item.quantity,
      item.line.productId,
      user.storeId,
    ])
    await database.query(
      `INSERT INTO inventory_movements (
        id, store_id, product_id, actor_id, return_id, quantity_delta, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, 'return')`,
      [randomUUID(), user.storeId, item.line.productId, user.id, returnId, item.quantity],
    )
  }
}

async function updateSaleReturnStatus(database: RetailDatabase, saleId: string): Promise<void> {
  const result = await database.query<{ remaining: number }>(
    `SELECT COALESCE(SUM(sl.quantity - COALESCE(returned.quantity, 0)), 0)::INTEGER AS remaining
     FROM sale_lines sl
     LEFT JOIN (
       SELECT sale_line_id, SUM(quantity)::INTEGER AS quantity
       FROM return_lines GROUP BY sale_line_id
     ) returned ON returned.sale_line_id = sl.id
     WHERE sl.sale_id = $1`,
    [saleId],
  )
  const status = result.rows[0]?.remaining === 0 ? 'returned' : 'partially_returned'
  await database.query('UPDATE sales SET status = $1 WHERE id = $2', [status, saleId])
}

async function getReturn(database: RetailDatabase, returnId: string) {
  const result = await database.query(
    `SELECT id, sale_id AS "saleId", reason, refund_minor AS "refundMinor",
      created_at AS "createdAt" FROM returns WHERE id = $1`,
    [returnId],
  )
  return requireValue(result.rows[0], 'Return was not found')
}
