import { createHash, randomBytes } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { DemoUser, RetailDatabase } from '../db/database.js'
import { ApiError, requireValue } from './api-error.js'

const demoLoginSchema = z.object({
  role: z.enum(['cashier', 'supervisor', 'store_admin']),
})

const SESSION_COOKIE = 'retailflow_session'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function readSessionToken(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie
  const cookie = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => {
      return part.startsWith(`${SESSION_COOKIE}=`)
    })

  return cookie?.slice(SESSION_COOKIE.length + 1)
}

export function createSessionCookieHeader(token: string, production: boolean, ttlSeconds: number): string {
  const secure = production ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttlSeconds}${secure}`
}

export function createClearedSessionCookieHeader(production: boolean): string {
  const secure = production ? '; Secure' : ''
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
}

function setSessionCookie(response: Response, token: string, production: boolean, ttlSeconds: number): void {
  response.setHeader('Set-Cookie', createSessionCookieHeader(token, production, ttlSeconds))
}

function clearSessionCookie(response: Response, production: boolean): void {
  response.setHeader('Set-Cookie', createClearedSessionCookieHeader(production))
}

export function requireAuth(database: RetailDatabase) {
  return async (request: Request, _response: Response, next: (error?: unknown) => void) => {
    try {
      const token = readSessionToken(request)
      if (!token) {
        throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue')
      }

      const session = await database.query<{ userId: string }>(
        `SELECT user_id AS "userId" FROM sessions
         WHERE token_hash = $1 AND expires_at > NOW()`,
        [hashToken(token)],
      )
      const userId = session.rows[0]?.userId
      const result = userId
        ? await database.query<DemoUser>(
            `SELECT id, store_id AS "storeId", display_name AS "displayName", role
             FROM users WHERE id = $1`,
            [userId],
          )
        : { rows: [] as DemoUser[] }
      const user = result.rows[0]

      if (!user) {
        throw new ApiError(401, 'SESSION_INVALID', 'Your demo session has expired')
      }

      request.user = user
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireRole(...roles: DemoUser['role'][]) {
  return (request: Request, _response: Response, next: (error?: unknown) => void) => {
    if (!request.user) {
      next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue'))
      return
    }

    if (!roles.includes(request.user.role)) {
      next(new ApiError(403, 'ROLE_REQUIRED', 'This action requires an elevated store role'))
      return
    }

    next()
  }
}

export function createAuthRouter(database: RetailDatabase, environment: string, ttlHours: number): Router {
  const router = Router()
  const requireUser = requireAuth(database)

  router.get('/demo-roles', async (_request, response) => {
    if (environment === 'production') {
      throw new ApiError(404, 'NOT_FOUND', 'Route not found')
    }

    const result = await database.query<{ role: DemoUser['role'] }>('SELECT DISTINCT role FROM users ORDER BY role')
    response.json({ roles: result.rows.map((row) => row.role) })
  })

  router.post('/demo-login', async (request, response) => {
    if (environment === 'production') {
      throw new ApiError(404, 'NOT_FOUND', 'Route not found')
    }

    const parsed = demoLoginSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ApiError(400, 'INVALID_ROLE', 'Choose a supported demo role')
    }

    const userResult = await database.query<DemoUser>(
      `SELECT id, store_id AS "storeId", display_name AS "displayName", role
       FROM users WHERE role = $1 LIMIT 1`,
      [parsed.data.role],
    )
    const user = requireValue(userResult.rows[0], 'Demo account is not available')
    const token = randomBytes(32).toString('hex')
    const ttlSeconds = ttlHours * 60 * 60
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

    await database.query('DELETE FROM sessions WHERE expires_at <= NOW()')
    await database.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      hashToken(token),
      user.id,
      expiresAt,
    ])
    setSessionCookie(response, token, environment === 'production', ttlSeconds)
    response.status(200).json({ user, demoMode: true })
  })

  router.get('/me', requireUser, (request, response) => {
    response.json({ user: requireValue(request.user) })
  })

  router.post('/logout', requireUser, async (request, response) => {
    const token = requireValue(readSessionToken(request), 'Authenticated session cookie was not found')
    await database.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])

    clearSessionCookie(response, environment === 'production')
    response.status(204).end()
  })

  return router
}
