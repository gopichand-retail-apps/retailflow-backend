import { createHash, randomBytes, randomUUID } from 'node:crypto'
import express from 'express'
import pino from 'pino'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { createDatabase, type RetailDatabase } from '../db/database.js'
import { ApiError } from './api-error.js'
import { createClearedSessionCookieHeader, createSessionCookieHeader, requireRole } from './auth.js'

describe('RetailFlow sessions', () => {
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
    await database.close()
  })

  it('rejects unknown cookie tokens', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'retailflow_session=invalid-session-token')
      .expect(401)

    expect(response.body.error.code).toBe('SESSION_INVALID')
  })

  it('revokes the local session on logout', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/v1/auth/demo-login').send({ role: 'cashier' }).expect(200)
    await cashier.get('/api/v1/auth/me').expect(200)
    await cashier.post('/api/v1/auth/logout').expect(204)

    const response = await cashier.get('/api/v1/auth/me').expect(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
  })

  it('denies cashier access to store settings', async () => {
    const cashier = request.agent(app)
    await cashier.post('/api/v1/auth/demo-login').send({ role: 'cashier' }).expect(200)
    const before = await cashier.get('/api/v1/settings').expect(200)
    const denied = await cashier.patch('/api/v1/settings').send({ demoTaxBasisPoints: 900 }).expect(403)
    const after = await cashier.get('/api/v1/settings').expect(200)

    expect(denied.body.error.code).toBe('ROLE_REQUIRED')
    expect(after.body.settings).toEqual(before.body.settings)
  })

  it('lists server-backed demo roles only outside production', async () => {
    const roles = await request(app).get('/api/v1/auth/demo-roles').expect(200)
    expect(roles.body.roles).toEqual(['cashier', 'store_admin', 'supervisor'])

    const productionApp = createApp({
      database,
      frontendOrigin: 'http://127.0.0.1:5001',
      environment: 'production',
      sessionTtlHours: 8,
      logger: pino({ level: 'silent' }),
    })
    const productionResponse = await request(productionApp).get('/api/v1/auth/demo-roles').expect(404)
    expect(productionResponse.body.error.code).toBe('NOT_FOUND')
  })

  it('prevents one cashier session from reading another cashier sale', async () => {
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

    const otherUserId = 'user-cashier-02'
    const token = randomBytes(32).toString('hex')
    await database.query('INSERT INTO users (id, store_id, display_name, role) VALUES ($1, $2, $3, $4)', [
      otherUserId,
      'store-demo-01',
      'Casey Park',
      'cashier',
    ])
    await database.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      createHash('sha256').update(token).digest('hex'),
      otherUserId,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ])

    const response = await request(app)
      .get(`/api/v1/sales/${sale.body.sale.id}`)
      .set('Cookie', `retailflow_session=${token}`)
      .expect(404)
    expect(response.body.error.code).toBe('SALE_NOT_FOUND')
  })

  it('clears production sessions with the Secure cookie attribute', async () => {
    const productionApp = createApp({
      database,
      frontendOrigin: 'https://retailflow.example.test',
      environment: 'production',
      sessionTtlHours: 8,
      logger: pino({ level: 'silent' }),
    })
    const token = randomBytes(32).toString('hex')
    await database.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      createHash('sha256').update(token).digest('hex'),
      'user-cashier-01',
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ])

    const response = await request(productionApp)
      .post('/api/v1/auth/logout')
      .set('Cookie', `retailflow_session=${token}`)
      .expect(204)

    expect(response.headers['set-cookie']?.[0]).toContain('; Secure')
    expect(response.headers['set-cookie']?.[0]).toContain('Max-Age=0')
  })

  it('marks production session cookies Secure without enabling production demo login', () => {
    expect(createSessionCookieHeader('synthetic-token', true, 3600)).toContain('; Secure')
    expect(createSessionCookieHeader('synthetic-token', false, 3600)).not.toContain('; Secure')
    expect(createClearedSessionCookieHeader(true)).toContain('; Secure')
    expect(createClearedSessionCookieHeader(false)).not.toContain('; Secure')
  })

  it('requires an authenticated elevated role before authorizing an operation', async () => {
    const roleApp = express()
    roleApp.get('/missing-user', requireRole('supervisor'), (_request, response) => response.sendStatus(204))
    roleApp.get(
      '/cashier',
      (httpRequest, _response, next) => {
        httpRequest.user = {
          id: 'user-cashier-01',
          storeId: 'store-demo-01',
          displayName: 'Alex Morgan',
          role: 'cashier',
        }
        next()
      },
      requireRole('supervisor'),
      (_request, response) => response.sendStatus(204),
    )
    roleApp.use(
      (error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
        if (error instanceof ApiError) {
          response.status(error.status).json({ code: error.code })
          return
        }

        response.sendStatus(500)
      },
    )

    await request(roleApp).get('/missing-user').expect(401, { code: 'AUTH_REQUIRED' })
    await request(roleApp).get('/cashier').expect(403, { code: 'ROLE_REQUIRED' })
  })
})
