import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import pino from 'pino'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createLogger } from './app.js'
import { createDatabase, type RetailDatabase } from './db/database.js'

describe('RetailFlow API', () => {
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

  it('creates a Pino logger without a custom destination', () => {
    expect(createLogger({ level: 'silent' }).level).toBe('silent')
  })

  it('reports the backend package version', async () => {
    const response = await request(app).get('/api/v1/version').expect(200)
    expect(response.body).toEqual({ service: 'retailflow-api', version: '1.0.0' })
  })

  it('redacts cookie and authorization values from structured logs', async () => {
    const logLines: string[] = []
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(String(chunk))
        callback()
      },
    })
    const logger = createLogger({ level: 'info', destination })

    logger.info(
      {
        req: { headers: { cookie: 'session-secret', authorization: 'bearer-secret' } },
        res: { headers: { 'set-cookie': 'session-secret' } },
      },
      'Redaction regression check',
    )
    await new Promise<void>((resolve) => setImmediate(resolve))

    const serialized = logLines.join('')
    expect(serialized).not.toContain('session-secret')
    expect(serialized).not.toContain('bearer-secret')
    expect(serialized).toContain('[REDACTED]')
  })

  it('disables demo login in production and rejects unsupported roles', async () => {
    const productionApp = createApp({
      database,
      frontendOrigin: 'http://127.0.0.1:5001',
      environment: 'production',
      sessionTtlHours: 8,
      logger: pino({ level: 'silent' }),
    })
    const denied = await request(productionApp).post('/api/v1/auth/demo-login').send({ role: 'cashier' }).expect(404)
    const invalid = await request(app).post('/api/v1/auth/demo-login').send({ role: 'admin' }).expect(400)

    expect(denied.body.error.code).toBe('NOT_FOUND')
    expect(invalid.body.error.code).toBe('INVALID_ROLE')
  })

  it('requires a session, calculates checkout on the server, and prevents duplicate sales', async () => {
    await request(app).get('/api/v1/products').expect(401)
    await request(app).get('/api/products').expect(401)
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const products = await cashier.get('/api/products').expect(200)
    const coffee = products.body.products.find((product: { id: string }) => {
      return product.id === 'product-coffee-beans'
    })
    const saleBody = {
      items: [{ productId: coffee.id, quantity: 1 }],
      discountBasisPoints: 0,
      tenders: [{ kind: 'cash', amountMinor: 1992 }],
    }
    const key = randomUUID()

    const created = await cashier.post('/api/sales').set('Idempotency-Key', key).send(saleBody).expect(201)
    const duplicate = await cashier.post('/api/sales').set('Idempotency-Key', key).send(saleBody).expect(200)
    const after = await cashier.get('/api/products?q=Daybreak').expect(200)

    expect(created.body.sale.totalMinor).toBe(1992)
    expect(duplicate.body.duplicate).toBe(true)
    expect(after.body.products[0].stockQuantity).toBe(17)
  })

  it('blocks cashier returns and restores stock after a supervisor return', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const sale = await cashier
      .post('/api/sales')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'product-ceramic-mug', quantity: 1 }],
        tenders: [{ kind: 'sandbox', amountMinor: 2815 }],
      })
      .expect(201)

    await cashier
      .post(`/api/sales/${sale.body.sale.id}/returns`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ saleLineId: sale.body.sale.lines[0].id, quantity: 1 }], reason: 'customer_request' })
      .expect(403)

    const supervisor = request.agent(app)
    await supervisor.post('/api/auth/demo-login').send({ role: 'supervisor' }).expect(200)
    const overReturn = await supervisor
      .post(`/api/sales/${sale.body.sale.id}/returns`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ saleLineId: sale.body.sale.lines[0].id, quantity: 2 }], reason: 'customer_request' })
      .expect(409)
    expect(overReturn.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED')

    const returned = await supervisor
      .post(`/api/sales/${sale.body.sale.id}/returns`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ saleLineId: sale.body.sale.lines[0].id, quantity: 1 }], reason: 'customer_request' })
      .expect(201)
    const products = await supervisor.get('/api/products?q=Ceramic').expect(200)

    expect(returned.body.return.refundMinor).toBe(2815)
    expect(products.body.products[0].stockQuantity).toBe(9)
  })

  it('replays returns idempotently without restoring stock twice', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/v1/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const sale = await cashier
      .post('/api/v1/sales')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'product-coffee-beans', quantity: 1 }],
        tenders: [{ kind: 'cash', amountMinor: 1992 }],
      })
      .expect(201)

    const supervisor = request.agent(app)
    await supervisor.post('/api/v1/auth/demo-login').send({ role: 'supervisor' }).expect(200)
    const returnBody = {
      items: [{ saleLineId: sale.body.sale.lines[0].id, quantity: 1 }],
      reason: 'customer_request',
    }
    const idempotencyKey = randomUUID()
    const returned = await supervisor
      .post(`/api/v1/sales/${sale.body.sale.id}/returns`)
      .set('Idempotency-Key', idempotencyKey)
      .send(returnBody)
      .expect(201)
    const replayed = await supervisor
      .post(`/api/v1/sales/${sale.body.sale.id}/returns`)
      .set('Idempotency-Key', idempotencyKey)
      .send(returnBody)
      .expect(201)
    const conflict = await supervisor
      .post(`/api/v1/sales/${sale.body.sale.id}/returns`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...returnBody, reason: 'damaged' })
      .expect(409)
    const products = await supervisor.get('/api/v1/products?q=Daybreak').expect(200)

    expect(replayed.body.return.id).toBe(returned.body.return.id)
    expect(replayed.body.return.refundMinor).toBe(returned.body.return.refundMinor)
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
    expect(products.body.products[0].stockQuantity).toBe(18)
  })

  it('serializes competing returns so one sold unit is refunded only once', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const created = await cashier
      .post('/api/sales')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'product-coffee-beans', quantity: 1 }],
        tenders: [{ kind: 'cash', amountMinor: 1992 }],
      })
      .expect(201)

    const supervisor = request.agent(app)
    await supervisor.post('/api/auth/demo-login').send({ role: 'supervisor' }).expect(200)
    const returnPayload = {
      items: [{ saleLineId: created.body.sale.lines[0].id, quantity: 1 }],
      reason: 'customer_request',
    }
    const responses = await Promise.all([
      supervisor
        .post(`/api/sales/${created.body.sale.id}/returns`)
        .set('Idempotency-Key', randomUUID())
        .send(returnPayload),
      supervisor
        .post(`/api/sales/${created.body.sale.id}/returns`)
        .set('Idempotency-Key', randomUUID())
        .send(returnPayload),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
    const products = await supervisor.get('/api/products?q=Daybreak').expect(200)
    expect(products.body.products[0].stockQuantity).toBe(18)
  })

  it('limits stock adjustments to supervisors and prevents negative stock', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const overview = await cashier.get('/api/overview').expect(200)
    expect(overview.body).toMatchObject({ productCount: 8, lowStockCount: 1 })
    const invalidSearch = await cashier.get('/api/products?q=coffee&q=blend').expect(200)
    expect(invalidSearch.body.products).toHaveLength(8)
    await cashier
      .post('/api/products/product-coffee-beans/adjustments')
      .send({ quantityDelta: 1, reason: 'Receiving correction' })
      .expect(403)

    const supervisor = request.agent(app)
    await supervisor.post('/api/auth/demo-login').send({ role: 'supervisor' }).expect(200)
    const invalidAdjustment = await supervisor
      .post('/api/products/product-coffee-beans/adjustments')
      .send({ quantityDelta: 0, reason: 'Zero correction' })
      .expect(400)
    expect(invalidAdjustment.body.error.code).toBe('INVALID_ADJUSTMENT')

    const missingProduct = await supervisor
      .post('/api/products/not-a-product/adjustments')
      .send({ quantityDelta: 1, reason: 'Receiving correction' })
      .expect(409)
    expect(missingProduct.body.error.code).toBe('STOCK_ADJUSTMENT_REJECTED')

    const adjusted = await supervisor
      .post('/api/products/product-coffee-beans/adjustments')
      .send({ quantityDelta: 1, reason: 'Receiving correction' })
      .expect(200)
    expect(adjusted.body.stockQuantity).toBe(19)

    await supervisor
      .post('/api/products/product-coffee-beans/adjustments')
      .send({ quantityDelta: -500, reason: 'Cycle count correction' })
      .expect(409)
    const products = await supervisor.get('/api/products?q=Daybreak').expect(200)
    expect(products.body.products[0].stockQuantity).toBe(19)

    const audit = await database.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count FROM audit_events
       WHERE event_name = 'inventory.adjusted'`,
    )
    expect(audit.rows[0]?.count).toBe(1)
  })

  it('quotes checkout with server pricing without changing inventory', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const before = await cashier.get('/api/products?q=Daybreak').expect(200)
    const product = before.body.products.find((item: { id: string }) => {
      return item.id === 'product-coffee-beans'
    })
    const response = await cashier
      .post('/api/sales/quote')
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        discountBasisPoints: 0,
      })
      .expect(200)
    const after = await cashier.get('/api/products?q=Daybreak').expect(200)

    expect(response.body.quote.totalMinor).toBe(1992)
    expect(after.body.products[0].stockQuantity).toBe(product.stockQuantity)
    await cashier
      .post('/api/sales/quote')
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        discountBasisPoints: 1001,
      })
      .expect(403)
  })

  it('rejects invalid quote, checkout, and return payloads with safe error codes', async () => {
    const supervisor = request.agent(app)
    await supervisor.post('/api/v1/auth/demo-login').send({ role: 'supervisor' }).expect(200)

    const invalidQuote = await supervisor
      .post('/api/v1/sales/quote')
      .send({ items: [], discountBasisPoints: 0 })
      .expect(400)
    expect(invalidQuote.body.error).toMatchObject({ code: 'INVALID_QUOTE' })

    const invalidCheckout = await supervisor
      .post('/api/v1/sales')
      .send({ items: [{ productId: 'product-coffee-beans', quantity: 1 }], tenders: [] })
      .expect(400)
    expect(invalidCheckout.body.error).toMatchObject({ code: 'INVALID_CHECKOUT' })

    const invalidReturn = await supervisor
      .post('/api/v1/sales/not-a-sale/returns')
      .send({ items: [], reason: 'unsupported' })
      .expect(400)
    expect(invalidReturn.body.error).toMatchObject({ code: 'INVALID_RETURN' })
    expect(invalidReturn.body.error.requestId).toBeTruthy()
    expect(invalidReturn.body.error.traceId).toBeTruthy()
    expect((await supervisor.get('/api/v1/sales').expect(200)).body.sales).toEqual([])
  })

  it('requires a valid idempotency key and rejects conflicting checkout reuse', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/v1/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const checkout = {
      items: [{ productId: 'product-coffee-beans', quantity: 1 }],
      discountBasisPoints: 0,
      tenders: [{ kind: 'cash', amountMinor: 1992 }],
    }

    const missingKey = await cashier.post('/api/v1/sales').send(checkout).expect(400)
    expect(missingKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')

    const invalidKey = await cashier.post('/api/v1/sales').set('Idempotency-Key', 'short').send(checkout).expect(400)
    expect(invalidKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')

    const idempotencyKey = 'retailflow-idempotency-key-001'
    await cashier.post('/api/v1/sales').set('Idempotency-Key', idempotencyKey).send(checkout).expect(201)

    const conflict = await cashier
      .post('/api/v1/sales')
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...checkout, discountBasisPoints: 100 })
      .expect(409)
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
    expect((await cashier.get('/api/v1/sales').expect(200)).body.sales).toHaveLength(1)
  })

  it('rejects cross-origin state changes and mismatched tender totals', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/auth/demo-login').send({ role: 'cashier' }).expect(200)
    await cashier
      .post('/api/sales')
      .set('Origin', 'https://untrusted.example')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'product-house-blend', quantity: 1 }],
        tenders: [{ kind: 'cash', amountMinor: 1 }],
      })
      .expect(403)
    const mismatch = await cashier
      .post('/api/sales')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId: 'product-house-blend', quantity: 1 }],
        tenders: [{ kind: 'cash', amountMinor: 1 }],
      })
      .expect(400)

    expect(mismatch.body.error.code).toBe('TENDER_TOTAL_MISMATCH')
  })

  it('propagates W3C trace context to the response and error envelope', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736'
    const response = await request(app)
      .get('/api/auth/me')
      .set('traceparent', `00-${traceId}-00f067aa0ba902b7-01`)
      .expect(401)

    expect(response.headers['x-trace-id']).toBe(traceId)
    expect(response.body.error.traceId).toBe(traceId)
    expect(response.body.error.requestId).toBeTruthy()
  })

  it('returns the complete settings shape after an administrator updates the demo rate', async () => {
    const admin = request.agent(app)
    await admin.post('/api/auth/demo-login').send({ role: 'store_admin' }).expect(200)
    const before = await admin.get('/api/settings').expect(200)
    const invalid = await admin.patch('/api/settings').send({ demoTaxBasisPoints: 10_001 }).expect(400)
    expect(invalid.body.error.code).toBe('INVALID_SETTINGS')
    const updated = await admin.patch('/api/settings').send({ demoTaxBasisPoints: 900 }).expect(200)
    const after = await admin.get('/api/settings').expect(200)

    expect(updated.body.settings).toEqual({
      name: before.body.settings.name,
      demoTaxBasisPoints: 900,
    })
    expect(after.body.settings).toEqual(updated.body.settings)
  })
})
