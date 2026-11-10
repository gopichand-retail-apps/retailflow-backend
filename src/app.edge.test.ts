import { randomUUID } from 'node:crypto'
import pino from 'pino'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { createDatabase, type RetailDatabase } from './db/database.js'

describe('RetailFlow API edge conditions', () => {
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

  it('rejects unavailable products and records partial returns accurately', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)

    const unavailable = await cashier
      .post('/api/sales')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'not-a-product', quantity: 1 }],
        tenders: [{ kind: 'cash', amountMinor: 1 }],
      })
      .expect(404)
    expect(unavailable.body.error.code).toBe('PRODUCT_NOT_FOUND')

    const insufficient = await cashier
      .post('/api/sales')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'product-coffee-beans', quantity: 100 }],
        tenders: [{ kind: 'cash', amountMinor: 1 }],
      })
      .expect(409)
    expect(insufficient.body.error.code).toBe('INSUFFICIENT_STOCK')

    const created = await cashier
      .post('/api/sales')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'product-coffee-beans', quantity: 2 }],
        tenders: [{ kind: 'cash', amountMinor: 3984 }],
      })
      .expect(201)

    const supervisor = request.agent(app)
    await supervisor.post('/api/auth/demo-login').send({ role: 'supervisor' }).expect(200)
    const saleId = created.body.sale.id as string
    const saleLineId = created.body.sale.lines[0].id as string
    const missingLine = await supervisor
      .post(`/api/sales/${saleId}/returns`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ saleLineId: 'not-a-sale-line', quantity: 1 }], reason: 'customer_request' })
      .expect(404)
    expect(missingLine.body.error.code).toBe('SALE_LINE_NOT_FOUND')

    await supervisor
      .post(`/api/sales/${saleId}/returns`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ saleLineId, quantity: 1 }], reason: 'customer_request' })
      .expect(201)
    const updated = await supervisor.get(`/api/sales/${saleId}`).expect(200)
    expect(updated.body.sale.status).toBe('partially_returned')
    expect(updated.body.sale.returns).toHaveLength(1)
  })

  it('uses zero-valued overview defaults when aggregate queries return no rows', async () => {
    const originalQuery = database.query.bind(database)
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('COUNT(*)')) return { rows: [] }
        return originalQuery<T>(sql, params)
      },
    )
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)

    const response = await cashier.get('/api/overview').expect(200)

    expect(response.body).toEqual({
      salesToday: 0,
      grossMinor: 0,
      lowStockCount: 0,
      productCount: 0,
      returnsToday: 0,
    })
  })

  it('validates request identifiers and safely envelopes unexpected failures', async () => {
    const requestId = 'retailflow-test-request-01'
    const accepted = await request(app)
      .get('/api/v1/auth/me')
      .set('X-Request-ID', requestId)
      .set('traceparent', 'invalid-trace-context')
      .expect(401)
    expect(accepted.body.error.requestId).toBe(requestId)
    expect(accepted.body.error.traceId).toMatch(/^[0-9a-f]{32}$/)

    const rejected = await request(app).get('/api/v1/auth/me').set('X-Request-ID', 'bad request id').expect(401)
    expect(rejected.body.error.requestId).not.toBe('bad request id')
    expect(rejected.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/)

    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const originalQuery = database.query.bind(database)
    vi.spyOn(database, 'query').mockImplementation(
      async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM products')) throw new Error('private database detail')
        return originalQuery<T>(sql, params)
      },
    )

    const failure = await cashier.get('/api/v1/products').expect(500)
    expect(failure.body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    })
    expect(JSON.stringify(failure.body)).not.toContain('private database detail')
    expect(failure.body.error.requestId).toBeTruthy()
    expect(failure.body.error.traceId).toBeTruthy()
  })

  it('allows the localhost alias only for local development origins', async () => {
    const developmentPreflight = await request(app)
      .options('/api/sales')
      .set('Origin', 'http://localhost:5001')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,idempotency-key,x-request-id,traceparent')
      .expect(204)
    expect(developmentPreflight.headers['access-control-allow-origin']).toBe('http://localhost:5001')
    expect(developmentPreflight.headers['access-control-allow-headers']).toContain('traceparent')

    const productionApp = createApp({
      database,
      frontendOrigin: 'http://127.0.0.1:5001',
      environment: 'production',
      sessionTtlHours: 8,
      logger: pino({ level: 'silent' }),
    })
    const productionPreflight = await request(productionApp)
      .options('/api/sales')
      .set('Origin', 'http://localhost:5001')
      .set('Access-Control-Request-Method', 'POST')
      .expect(403)

    expect(productionPreflight.body.error.code).toBe('ORIGIN_NOT_ALLOWED')
  })
})
