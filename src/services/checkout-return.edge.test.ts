import { randomUUID } from 'node:crypto'
import pino from 'pino'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { createDatabase, type RetailDatabase } from '../db/database.js'
import { hashRequest } from './sales-service.js'

describe('RetailFlow checkout and return transaction edges', () => {
  let database: RetailDatabase
  let app: ReturnType<typeof createApp>

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
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await database.close()
  })

  async function signIn(role: 'cashier' | 'supervisor') {
    const agent = request.agent(app)
    const response = await agent.post('/api/auth/demo-login').send({ role }).expect(200)
    return { agent, user: response.body.user }
  }

  function checkoutBody() {
    return {
      items: [{ productId: 'product-coffee-beans', quantity: 1 }],
      tenders: [{ kind: 'cash', amountMinor: 1992 }],
    }
  }

  function returnBody(saleLineId: string) {
    return { items: [{ saleLineId, quantity: 1 }], reason: 'customer_request' as const }
  }

  async function createSale(idempotencyKey = randomUUID()) {
    const cashier = await signIn('cashier')
    const response = await cashier.agent
      .post('/api/sales')
      .set('Idempotency-Key', idempotencyKey)
      .send(checkoutBody())
      .expect(201)
    return { cashier, sale: response.body.sale }
  }

  async function insertExistingReturn(
    saleId: string,
    supervisorId: string,
    idempotencyKey: string,
    body: ReturnType<typeof returnBody>,
  ): Promise<string> {
    const returnId = randomUUID()
    await database.query(
      `INSERT INTO returns (
        id, store_id, sale_id, supervisor_id, idempotency_key, request_hash, reason, refund_minor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [returnId, 'store-demo-01', saleId, supervisorId, idempotencyKey, hashRequest(body), body.reason, 1992],
    )
    return returnId
  }

  it('rejects a return with no refundable amount without restoring stock', async () => {
    const { cashier, sale } = await createSale()
    const saleId = sale.id as string
    const saleLineId = sale.lines[0].id as string
    await database.query('UPDATE sale_lines SET total_minor = 0 WHERE id = $1', [saleLineId])

    const supervisor = await signIn('supervisor')
    const response = await supervisor.agent
      .post(`/api/sales/${saleId}/returns`)
      .set('Idempotency-Key', randomUUID())
      .send(returnBody(saleLineId))
      .expect(409)
    const returns = await database.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM returns WHERE sale_id = $1',
      [saleId],
    )
    const product = await cashier.agent.get('/api/products?q=Daybreak').expect(200)

    expect(response.body.error.code).toBe('RETURN_EMPTY')
    expect(Number(returns.rows[0]?.count)).toBe(0)
    expect(product.body.products[0].stockQuantity).toBe(17)
  })

  it('replays a return discovered again inside the transaction', async () => {
    const { sale } = await createSale()
    const supervisor = await signIn('supervisor')
    const idempotencyKey = randomUUID()
    const body = returnBody(sale.lines[0].id as string)
    const returnId = await insertExistingReturn(sale.id as string, supervisor.user.id, idempotencyKey, body)
    const originalQuery = database.query.bind(database)
    let keyLookups = 0
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM returns WHERE idempotency_key = $1') && params[0] === idempotencyKey) {
          keyLookups += 1
          if (keyLookups === 1) return { rows: [] }
        }
        return originalQuery<T>(sql, params)
      },
    )

    const response = await supervisor.agent
      .post(`/api/sales/${sale.id}/returns`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201)

    expect(keyLookups).toBe(2)
    expect(response.body.return.id).toBe(returnId)
  })

  it('reports an unresolved return insert conflict instead of acknowledging it', async () => {
    const { sale } = await createSale()
    const supervisor = await signIn('supervisor')
    const idempotencyKey = randomUUID()
    const originalQuery = database.query.bind(database)
    let keyLookups = 0
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM returns WHERE idempotency_key = $1') && params[0] === idempotencyKey) {
          keyLookups += 1
          return { rows: [] }
        }
        if (sql.includes('INSERT INTO returns')) return { rows: [] }
        return originalQuery<T>(sql, params)
      },
    )

    const response = await supervisor.agent
      .post(`/api/sales/${sale.id}/returns`)
      .set('Idempotency-Key', idempotencyKey)
      .send(returnBody(sale.lines[0].id as string))
      .expect(409)

    expect(keyLookups).toBe(3)
    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('returns a concurrent return created after the insert conflict', async () => {
    const { sale } = await createSale()
    const supervisor = await signIn('supervisor')
    const idempotencyKey = randomUUID()
    const body = returnBody(sale.lines[0].id as string)
    const returnId = await insertExistingReturn(sale.id as string, supervisor.user.id, idempotencyKey, body)
    const originalQuery = database.query.bind(database)
    let keyLookups = 0
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM returns WHERE idempotency_key = $1') && params[0] === idempotencyKey) {
          keyLookups += 1
          if (keyLookups < 3) return { rows: [] }
        }
        if (sql.includes('INSERT INTO returns')) return { rows: [] }
        return originalQuery<T>(sql, params)
      },
    )

    const response = await supervisor.agent
      .post(`/api/sales/${sale.id}/returns`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201)

    expect(keyLookups).toBe(3)
    expect(response.body.return.id).toBe(returnId)
  })

  it('rechecks a sale idempotency key after entering its transaction', async () => {
    const idempotencyKey = randomUUID()
    const { cashier, sale } = await createSale(idempotencyKey)
    const body = checkoutBody()
    const originalQuery = database.query.bind(database)
    let keyLookups = 0
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM sales WHERE idempotency_key = $1') && params[0] === idempotencyKey) {
          keyLookups += 1
          if (keyLookups === 1) return { rows: [] }
        }
        return originalQuery<T>(sql, params)
      },
    )

    const duplicate = await cashier.agent
      .post('/api/sales')
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(200)
    const product = await cashier.agent.get('/api/products?q=Daybreak').expect(200)

    expect(keyLookups).toBe(2)
    expect(duplicate.body.duplicate).toBe(true)
    expect(duplicate.body.sale.id).toBe(sale.id)
    expect(product.body.products[0].stockQuantity).toBe(17)
  })

  it('resolves a sale insert conflict to the existing idempotent sale', async () => {
    const idempotencyKey = randomUUID()
    const { cashier, sale } = await createSale(idempotencyKey)
    const body = checkoutBody()
    const originalQuery = database.query.bind(database)
    let keyLookups = 0
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM sales WHERE idempotency_key = $1') && params[0] === idempotencyKey) {
          keyLookups += 1
          if (keyLookups < 3) return { rows: [] }
        }
        if (sql.includes('INSERT INTO sales')) return { rows: [] }
        return originalQuery<T>(sql, params)
      },
    )

    const duplicate = await cashier.agent
      .post('/api/sales')
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(200)
    const product = await cashier.agent.get('/api/products?q=Daybreak').expect(200)

    expect(keyLookups).toBe(3)
    expect(duplicate.body.duplicate).toBe(true)
    expect(duplicate.body.sale.id).toBe(sale.id)
    expect(product.body.products[0].stockQuantity).toBe(17)
  })

  it('rolls back a checkout when stock changes after the initial availability check', async () => {
    const cashier = await signIn('cashier')
    const originalQuery = database.query.bind(database)
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('UPDATE products SET stock_quantity = stock_quantity - $1')) {
          return { rows: [] }
        }
        return originalQuery<T>(sql, params)
      },
    )

    const response = await cashier.agent
      .post('/api/sales')
      .set('Idempotency-Key', randomUUID())
      .send(checkoutBody())
      .expect(409)
    const sales = await database.query('SELECT id FROM sales')
    const product = await cashier.agent.get('/api/products?q=Daybreak').expect(200)

    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK')
    expect(sales.rows).toHaveLength(0)
    expect(product.body.products[0].stockQuantity).toBe(18)
  })
})
