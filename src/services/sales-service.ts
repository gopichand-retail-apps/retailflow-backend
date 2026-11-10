import { createHash, randomUUID } from 'node:crypto'
import type { DemoUser, RetailDatabase } from '../db/database.js'
import { calculatePrice } from '../domain/pricing.js'
import { ApiError, requireValue } from '../http/api-error.js'
import { recordAuditEvent } from '../http/audit.js'
import { idempotencyKeySchema, maximumDiscountByRole, type CheckoutInput } from '../sales-schema.js'

export interface ProductForSale {
  id: string
  sku: string
  name: string
  unitPriceMinor: number
  stockQuantity: number
}

export interface SaleRow {
  id: string
  cashierId: string
  storeId: string
  idempotencyKey: string
  requestHash: string
  receiptNumber: string
  status: 'completed' | 'partially_returned' | 'returned'
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
  currency: 'USD'
  createdAt: string
}

export interface SaleLineRow {
  id: string
  productId: string
  sku: string
  name: string
  unitPriceMinor: number
  quantity: number
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
  returnedQuantity: number
  refundedMinor: number
}

export function hashRequest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function requireIdempotencyKey(value: string | undefined): string {
  const parsed = idempotencyKeySchema.safeParse(value)
  if (!parsed.success) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Provide a valid Idempotency-Key header')
  }

  return parsed.data
}

export function assertDiscountAllowed(user: DemoUser, discountBasisPoints: number): void {
  if (discountBasisPoints > maximumDiscountByRole[user.role]) {
    throw new ApiError(403, 'DISCOUNT_LIMIT', 'This role cannot apply the requested discount')
  }
}

export function mergeSaleItems(items: Array<{ productId: string; quantity: number }>) {
  const quantities = new Map<string, number>()
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  }

  return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }))
}

function assertCanReadSale(user: DemoUser, sale: SaleRow): void {
  if (user.storeId !== sale.storeId || (user.role === 'cashier' && user.id !== sale.cashierId)) {
    throw new ApiError(404, 'SALE_NOT_FOUND', 'Sale was not found')
  }
}

export async function findSale(
  database: RetailDatabase,
  saleId: string,
  user: DemoUser,
  lockForUpdate = false,
): Promise<SaleRow> {
  const lockClause = lockForUpdate ? ' FOR UPDATE' : ''
  const result = await database.query<SaleRow>(
    `SELECT id, cashier_id AS "cashierId", store_id AS "storeId",
      idempotency_key AS "idempotencyKey", request_hash AS "requestHash",
      receipt_number AS "receiptNumber", status,
      subtotal_minor AS "subtotalMinor", discount_minor AS "discountMinor",
      tax_minor AS "taxMinor", total_minor AS "totalMinor", currency,
      created_at AS "createdAt"
     FROM sales WHERE id = $1${lockClause}`,
    [saleId],
  )
  const sale = requireValue(result.rows[0], 'Sale was not found')
  assertCanReadSale(user, sale)
  return sale
}

export async function listSaleLines(database: RetailDatabase, saleId: string): Promise<SaleLineRow[]> {
  const result = await database.query<SaleLineRow>(
    `SELECT sl.id, sl.product_id AS "productId", sl.sku_snapshot AS sku,
      sl.name_snapshot AS name, sl.unit_price_minor AS "unitPriceMinor",
      sl.quantity, sl.subtotal_minor AS "subtotalMinor",
      sl.discount_minor AS "discountMinor", sl.tax_minor AS "taxMinor",
      sl.total_minor AS "totalMinor",
      COALESCE(SUM(rl.quantity), 0)::INTEGER AS "returnedQuantity",
      COALESCE(SUM(rl.refund_minor), 0)::INTEGER AS "refundedMinor"
     FROM sale_lines sl
     LEFT JOIN return_lines rl ON rl.sale_line_id = sl.id
     WHERE sl.sale_id = $1
     GROUP BY sl.id ORDER BY sl.id`,
    [saleId],
  )

  return result.rows
}

export async function saleDetails(database: RetailDatabase, saleId: string, user: DemoUser) {
  const sale = await findSale(database, saleId, user)
  const [lines, tenders, returns] = await Promise.all([
    listSaleLines(database, saleId),
    database.query('SELECT kind, amount_minor AS "amountMinor" FROM tenders WHERE sale_id = $1', [saleId]),
    database.query(
      `SELECT id, reason, refund_minor AS "refundMinor", created_at AS "createdAt"
       FROM returns WHERE sale_id = $1 ORDER BY created_at ASC`,
      [saleId],
    ),
  ])

  return {
    id: sale.id,
    cashierId: sale.cashierId,
    storeId: sale.storeId,
    receiptNumber: sale.receiptNumber,
    status: sale.status,
    subtotalMinor: sale.subtotalMinor,
    discountMinor: sale.discountMinor,
    taxMinor: sale.taxMinor,
    totalMinor: sale.totalMinor,
    currency: sale.currency,
    createdAt: sale.createdAt,
    lines,
    tenders: tenders.rows,
    returns: returns.rows,
  }
}

async function findExistingSale(database: RetailDatabase, idempotencyKey: string, requestHash: string) {
  const result = await database.query<{ id: string; requestHash: string }>(
    `SELECT id, request_hash AS "requestHash" FROM sales WHERE idempotency_key = $1`,
    [idempotencyKey],
  )
  const existing = result.rows[0]

  if (existing && existing.requestHash !== requestHash) {
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'That key was already used for a different checkout')
  }

  return existing
}

export async function loadProductsForCheckout(
  database: RetailDatabase,
  user: DemoUser,
  items: Array<{ productId: string; quantity: number }>,
): Promise<ProductForSale[]> {
  const result = await database.query<ProductForSale>(
    `SELECT id, sku, name, unit_price_minor AS "unitPriceMinor",
      stock_quantity AS "stockQuantity"
     FROM products WHERE store_id = $1 AND id = ANY($2::TEXT[])
     ORDER BY id FOR UPDATE`,
    [user.storeId, items.map((item) => item.productId)],
  )
  const productById = new Map(result.rows.map((product) => [product.id, product]))

  for (const item of items) {
    const product = productById.get(item.productId)
    if (!product) {
      throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'One or more products are no longer available')
    }
    if (product.stockQuantity < item.quantity) {
      throw new ApiError(409, 'INSUFFICIENT_STOCK', `${product.name} does not have enough stock`)
    }
  }

  return items.map((item) => requireValue(productById.get(item.productId)))
}

export async function calculateSalePrice(
  database: RetailDatabase,
  options: {
    storeId: string
    items: Array<{ productId: string; quantity: number }>
    products: ProductForSale[]
    discountBasisPoints: number
  },
) {
  const taxResult = await database.query<{ taxBasisPoints: number }>(
    'SELECT demo_tax_basis_points AS "taxBasisPoints" FROM stores WHERE id = $1',
    [options.storeId],
  )
  const taxBasisPoints = requireValue(taxResult.rows[0]?.taxBasisPoints)

  return calculatePrice(
    options.items.map((item, index) => ({
      unitPriceMinor: requireValue(options.products[index]).unitPriceMinor,
      quantity: item.quantity,
      discountBasisPoints: options.discountBasisPoints,
      taxBasisPoints,
    })),
  )
}

export async function createSale(
  database: RetailDatabase,
  user: DemoUser,
  body: CheckoutInput,
  idempotencyKey: string,
): Promise<{ saleId: string; duplicate: boolean }> {
  assertDiscountAllowed(user, body.discountBasisPoints)
  const requestHash = hashRequest(body)
  const duplicate = await findExistingSale(database, idempotencyKey, requestHash)
  if (duplicate) return { saleId: duplicate.id, duplicate: true }

  const items = mergeSaleItems(body.items)
  return database.transaction(async () => {
    const concurrentDuplicate = await findExistingSale(database, idempotencyKey, requestHash)
    if (concurrentDuplicate) return { saleId: concurrentDuplicate.id, duplicate: true }
    return persistSale({ database, user, body, items, idempotencyKey, requestHash })
  })
}

async function persistSale(input: {
  database: RetailDatabase
  user: DemoUser
  body: CheckoutInput
  items: Array<{ productId: string; quantity: number }>
  idempotencyKey: string
  requestHash: string
}): Promise<{ saleId: string; duplicate: boolean }> {
  const { database, user, body, items, idempotencyKey, requestHash } = input
  const products = await loadProductsForCheckout(database, user, items)
  const price = await calculateSalePrice(database, {
    storeId: user.storeId,
    items,
    products,
    discountBasisPoints: body.discountBasisPoints,
  })
  const tenderTotal = body.tenders.reduce((sum, tender) => sum + tender.amountMinor, 0)
  if (tenderTotal !== price.totalMinor) {
    throw new ApiError(400, 'TENDER_TOTAL_MISMATCH', 'Tender amounts must equal the server-calculated total')
  }

  const saleId = randomUUID()
  const receiptDate = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const receiptSuffix = saleId.slice(0, 8).toUpperCase()
  const receiptNumber = `RF-${receiptDate}-${receiptSuffix}`
  const inserted = await insertSale(database, {
    saleId,
    storeId: user.storeId,
    userId: user.id,
    idempotencyKey,
    requestHash,
    receiptNumber,
    price,
  })
  if (!inserted) {
    const existing = await findExistingSale(database, idempotencyKey, requestHash)
    return { saleId: requireValue(existing).id, duplicate: true }
  }

  await persistSaleLines({ database, user, saleId, products, items, pricedLines: price.lines })
  await persistTenders(database, saleId, body.tenders)
  await recordAuditEvent(database, {
    storeId: user.storeId,
    actorId: user.id,
    eventName: 'sale.completed',
    entityType: 'sale',
    entityId: saleId,
    metadata: { itemCount: items.length, totalMinor: price.totalMinor },
  })
  return { saleId, duplicate: false }
}

async function insertSale(
  database: RetailDatabase,
  input: {
    saleId: string
    storeId: string
    userId: string
    idempotencyKey: string
    requestHash: string
    receiptNumber: string
    price: ReturnType<typeof calculatePrice>
  },
): Promise<boolean> {
  const result = await database.query<{ id: string }>(
    `INSERT INTO sales (
      id, store_id, cashier_id, idempotency_key, request_hash, receipt_number,
      status, subtotal_minor, discount_minor, tax_minor, total_minor
    ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [
      input.saleId,
      input.storeId,
      input.userId,
      input.idempotencyKey,
      input.requestHash,
      input.receiptNumber,
      input.price.subtotalMinor,
      input.price.discountMinor,
      input.price.taxMinor,
      input.price.totalMinor,
    ],
  )
  return result.rows.length === 1
}

async function persistSaleLines(input: {
  database: RetailDatabase
  user: DemoUser
  saleId: string
  products: ProductForSale[]
  items: Array<{ productId: string; quantity: number }>
  pricedLines: ReturnType<typeof calculatePrice>['lines']
}): Promise<void> {
  const { database, user, saleId, products, items, pricedLines } = input
  for (const [index, product] of products.entries()) {
    const item = requireValue(items[index])
    const line = requireValue(pricedLines[index])
    await database.query(
      `INSERT INTO sale_lines (
        id, sale_id, product_id, sku_snapshot, name_snapshot, unit_price_minor,
        quantity, subtotal_minor, discount_minor, tax_minor, total_minor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomUUID(),
        saleId,
        product.id,
        product.sku,
        product.name,
        line.unitPriceMinor,
        line.quantity,
        line.subtotalMinor,
        line.discountMinor,
        line.taxMinor,
        line.totalMinor,
      ],
    )
    const stockUpdate = await database.query(
      `UPDATE products SET stock_quantity = stock_quantity - $1
       WHERE id = $2 AND store_id = $3 AND stock_quantity >= $1 RETURNING id`,
      [item.quantity, product.id, user.storeId],
    )
    if (stockUpdate.rows.length !== 1) {
      throw new ApiError(409, 'INSUFFICIENT_STOCK', `${product.name} does not have enough stock`)
    }
    await database.query(
      `INSERT INTO inventory_movements (
        id, store_id, product_id, actor_id, sale_id, quantity_delta, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, 'sale')`,
      [randomUUID(), user.storeId, product.id, user.id, saleId, -item.quantity],
    )
  }
}

async function persistTenders(
  database: RetailDatabase,
  saleId: string,
  tenders: CheckoutInput['tenders'],
): Promise<void> {
  for (const tender of tenders) {
    await database.query('INSERT INTO tenders (id, sale_id, kind, amount_minor) VALUES ($1, $2, $3, $4)', [
      randomUUID(),
      saleId,
      tender.kind,
      tender.amountMinor,
    ])
  }
}
