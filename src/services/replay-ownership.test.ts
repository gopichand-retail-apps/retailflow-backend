import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pino from 'pino'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { createDatabase, type DemoUser, type RetailDatabase } from '../db/database.js'

interface Operator {
  id: string
  storeId: string
  role: DemoUser['role']
}

const CASHIER_ONE: Operator = { id: 'user-cashier-01', storeId: 'store-demo-01', role: 'cashier' }
const CASHIER_TWO: Operator = { id: 'user-cashier-02', storeId: 'store-demo-01', role: 'cashier' }
const SUPERVISOR_ONE: Operator = { id: 'user-supervisor-01', storeId: 'store-demo-01', role: 'supervisor' }
const ADMIN_ONE: Operator = { id: 'user-admin-01', storeId: 'store-demo-01', role: 'store_admin' }
const CASHIER_OTHER_STORE: Operator = { id: 'user-cashier-91', storeId: 'store-demo-02', role: 'cashier' }
const SUPERVISOR_OTHER_STORE: Operator = { id: 'user-supervisor-91', storeId: 'store-demo-02', role: 'supervisor' }

const ALL_OPERATORS = [CASHIER_ONE, CASHIER_TWO, SUPERVISOR_ONE, ADMIN_ONE, CASHIER_OTHER_STORE, SUPERVISOR_OTHER_STORE]

const checkoutBody = {
  items: [{ productId: 'product-coffee-beans', quantity: 1 }],
  tenders: [{ kind: 'cash', amountMinor: 1992 }],
}

function returnBody(saleLineId: string) {
  return { items: [{ saleLineId, quantity: 1 }], reason: 'customer_request' as const }
}

describe('sale and return replay ownership', () => {
  let database: RetailDatabase
  let app: ReturnType<typeof createApp>

  let cookies: Record<string, string>

  beforeEach(async () => {
    database = createDatabase('memory://')
    await database.initialize()
    app = createApp({
      database,
      frontendOrigin: 'http://127.0.0.1:5001',
      environment: 'test',
      sessionTtlHours: 8,
      logger: pino({ level: 'silent' }),
    })
    cookies = {}
    for (const operator of ALL_OPERATORS) cookies[operator.id] = await seedSession(operator)
  })

  afterEach(async () => {
    await database.close()
  })

  async function seedSession(operator: Operator): Promise<string> {
    await database.query(
      `INSERT INTO stores (id, name, demo_tax_basis_points) VALUES ($1, 'Second synthetic store', 825)
       ON CONFLICT (id) DO NOTHING`,
      [operator.storeId],
    )
    await database.query(
      `INSERT INTO users (id, store_id, display_name, role) VALUES ($1, $2, $1, $3)
       ON CONFLICT (id) DO NOTHING`,
      [operator.id, operator.storeId, operator.role],
    )
    const token = randomBytes(32).toString('hex')
    await database.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      createHash('sha256').update(token).digest('hex'),
      operator.id,
      new Date(Date.now() + 3_600_000).toISOString(),
    ])
    return `retailflow_session=${token}`
  }

  function postSale(operator: Operator, key: string) {
    return request(app)
      .post('/api/v1/sales')
      .set('Cookie', cookies[operator.id] ?? '')
      .set('Idempotency-Key', key)
      .send(checkoutBody)
  }

  function postReturn(operator: Operator, saleId: string, key: string, saleLineId: string) {
    return request(app)
      .post(`/api/v1/sales/${saleId}/returns`)
      .set('Cookie', cookies[operator.id] ?? '')
      .set('Idempotency-Key', key)
      .send(returnBody(saleLineId))
  }

  async function count(table: 'sales' | 'returns'): Promise<number> {
    const result = await database.query<{ count: number }>(`SELECT COUNT(*)::INTEGER AS count FROM ${table}`)
    return result.rows[0]?.count ?? 0
  }

  async function coffeeStock(): Promise<number> {
    const result = await database.query<{ stock: number }>(
      "SELECT stock_quantity AS stock FROM products WHERE id = 'product-coffee-beans'",
    )
    return result.rows[0]?.stock ?? -1
  }

  describe('checkout replay', () => {
    it('returns the same receipt to the original cashier after a lost reply', async () => {
      const key = randomUUID()
      const first = await postSale(CASHIER_ONE, key).expect(201)
      const retry = await postSale(CASHIER_ONE, key).expect(200)

      expect(retry.body.duplicate).toBe(true)
      expect(retry.body.sale.id).toBe(first.body.sale.id)
      expect(retry.body.sale.receiptNumber).toBe(first.body.sale.receiptNumber)
      expect(await count('sales')).toBe(1)
      expect(await coffeeStock()).toBe(17)
    })

    it('does not hand a cashier receipt to a supervisor in the same store who reuses the key', async () => {
      const key = randomUUID()
      await postSale(CASHIER_ONE, key).expect(201)

      const replay = await postSale(SUPERVISOR_ONE, key)

      expect(replay.status).toBe(409)
      expect(replay.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
      expect(JSON.stringify(replay.body)).not.toContain('receiptNumber')
      expect(await count('sales')).toBe(1)
      expect(await coffeeStock()).toBe(17)
    })

    it('does not replay one cashier key for another cashier in the same store', async () => {
      const key = randomUUID()
      await postSale(CASHIER_ONE, key).expect(201)

      const replay = await postSale(CASHIER_TWO, key)

      expect(replay.status).toBe(409)
      expect(replay.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
      expect(await count('sales')).toBe(1)
    })

    it('does not replay a key across stores', async () => {
      const key = randomUUID()
      await postSale(CASHIER_ONE, key).expect(201)

      const replay = await postSale(CASHIER_OTHER_STORE, key)

      expect(replay.status).toBe(409)
      expect(replay.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
      expect(await count('sales')).toBe(1)
    })
  })

  describe('return replay', () => {
    async function recordedSale() {
      const sale = await postSale(CASHIER_ONE, randomUUID()).expect(201)
      return { saleId: sale.body.sale.id as string, lineId: sale.body.sale.lines[0].id as string }
    }

    it('returns the same refund to the original supervisor after a lost reply', async () => {
      const { saleId, lineId } = await recordedSale()
      const key = randomUUID()
      const first = await postReturn(SUPERVISOR_ONE, saleId, key, lineId).expect(201)
      const retry = await postReturn(SUPERVISOR_ONE, saleId, key, lineId).expect(201)

      expect(retry.body.return.id).toBe(first.body.return.id)
      expect(await count('returns')).toBe(1)
      expect(await coffeeStock()).toBe(18)
    })

    it('checks the caller store before replaying, so another store cannot read a return through its key', async () => {
      const { saleId, lineId } = await recordedSale()
      const key = randomUUID()
      await postReturn(SUPERVISOR_ONE, saleId, key, lineId).expect(201)

      const replay = await postReturn(SUPERVISOR_OTHER_STORE, saleId, key, lineId)

      expect(replay.status).toBe(404)
      expect(replay.body.error.code).toBe('SALE_NOT_FOUND')
      expect(JSON.stringify(replay.body)).not.toContain('refundMinor')
      expect(await count('returns')).toBe(1)
    })

    it('does not replay a return key for a different operator in the same store', async () => {
      const { saleId, lineId } = await recordedSale()
      const key = randomUUID()
      await postReturn(SUPERVISOR_ONE, saleId, key, lineId).expect(201)

      const replay = await postReturn(ADMIN_ONE, saleId, key, lineId)

      expect(replay.status).toBe(409)
      expect(replay.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
      expect(await count('returns')).toBe(1)
      expect(await coffeeStock()).toBe(18)
    })

    it('does not replay a return key against a different sale in the same store', async () => {
      const { saleId, lineId } = await recordedSale()
      const otherSale = await postSale(CASHIER_ONE, randomUUID()).expect(201)
      const key = randomUUID()
      await postReturn(SUPERVISOR_ONE, saleId, key, lineId).expect(201)

      const replay = await postReturn(SUPERVISOR_ONE, otherSale.body.sale.id as string, key, lineId)

      expect(replay.status).toBe(409)
      expect(replay.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
      expect(await count('returns')).toBe(1)
    })
  })
})
