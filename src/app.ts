import { randomUUID } from 'node:crypto'
import { APP_VERSION } from './app-version.js'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import pino, { type DestinationStream, type Logger } from 'pino'
import { pinoHttp } from 'pino-http'
import type { RetailDatabase } from './db/database.js'
import { ApiError } from './http/api-error.js'
import { createAuthRouter } from './http/auth.js'
import { createOverviewRouter } from './http/overview.js'
import { createProductsRouter } from './http/products.js'
import { createSalesRouter } from './http/sales-routes.js'
import { createSettingsRouter } from './http/settings.js'

interface CreateAppOptions {
  database: RetailDatabase
  frontendOrigin: string
  environment: string
  sessionTtlHours: number
  logger?: Logger
}

export function createLogger(options: { level?: string; destination?: DestinationStream } = {}): Logger {
  const loggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'],
      censor: '[REDACTED]',
    },
  }

  return options.destination ? pino(loggerOptions, options.destination) : pino(loggerOptions)
}

function requestId(request: express.Request): string {
  const provided = request.headers['x-request-id']
  if (typeof provided === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(provided)) {
    return provided
  }

  return randomUUID()
}

function traceId(request: express.Request): string {
  const traceparent = request.get('traceparent')
  const match = traceparent?.match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i)
  const candidate = match?.[2]?.toLowerCase()
  const parentSpanId = match?.[3]

  if (
    match &&
    match[1]?.toLowerCase() !== 'ff' &&
    candidate &&
    !/^0+$/.test(candidate) &&
    parentSpanId &&
    !/^0+$/.test(parentSpanId)
  ) {
    return candidate
  }

  return randomUUID().replaceAll('-', '')
}

function allowedFrontendOrigins(frontendOrigin: string, environment: string): Set<string> {
  const allowed = new Set([frontendOrigin])
  if (environment === 'production') return allowed

  const configured = new URL(frontendOrigin)
  const localHosts = new Set(['localhost', '127.0.0.1'])
  if (configured.protocol !== 'http:' || configured.port !== '5001' || !localHosts.has(configured.hostname)) {
    return allowed
  }

  const alias = configured.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
  allowed.add(`${configured.protocol}//${alias}:${configured.port}`)
  return allowed
}

function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    const apiError = error instanceof ApiError ? error : null
    const status = apiError?.status ?? 500
    const code = apiError?.code ?? 'INTERNAL_ERROR'
    const message = apiError?.message ?? 'An unexpected error occurred'
    request.log.error(
      {
        eventName: 'api.request.failed',
        errorCode: code,
        requestId: String(request.id),
        traceId: request.traceId,
        outcome: 'failure',
        status,
      },
      'Request failed',
    )
    response.status(status).json({
      error: { code, message, requestId: String(request.id), traceId: request.traceId },
    })
  }
}

export function createApp(options: CreateAppOptions) {
  const app = express()
  const logger = options.logger ?? createLogger()
  const allowedOrigins = allowedFrontendOrigins(options.frontendOrigin, options.environment)

  app.disable('x-powered-by')
  app.use((request, response, next) => {
    request.traceId = traceId(request)
    response.setHeader('X-Trace-ID', request.traceId)
    next()
  })
  app.use(
    pinoHttp({
      logger,
      genReqId: requestId,
      customProps: (request) => ({
        service: 'retailflow-api',
        environment: options.environment,
        version: APP_VERSION,
        requestId: request.id,
        traceId: request.traceId,
      }),
      serializers: {
        req: (request) => ({
          id: request.id,
          method: request.method,
          route: request.url?.split('?')[0],
        }),
      },
    }),
  )
  app.use(helmet())
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true)
          return
        }

        callback(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed'))
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-ID', 'traceparent'],
      exposedHeaders: ['X-Request-ID', 'X-Trace-ID'],
    }),
  )
  app.use((request, response, next) => {
    response.setHeader('X-Request-ID', String(request.id))
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      request.get('Origin') &&
      !allowedOrigins.has(request.get('Origin') ?? '')
    ) {
      next(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed'))
      return
    }

    next()
  })
  app.use(express.json({ limit: '32kb', strict: true }))
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'retailflow-api' })
  })

  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  })
  const apiRoutes = express.Router()
  apiRoutes.get('/version', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.json({ service: 'retailflow-api', version: APP_VERSION })
  })
  apiRoutes.use('/auth/demo-login', loginLimiter)
  apiRoutes.use('/auth', createAuthRouter(options.database, options.environment, options.sessionTtlHours))
  apiRoutes.use('/overview', createOverviewRouter(options.database))
  apiRoutes.use('/products', createProductsRouter(options.database))
  apiRoutes.use('/sales', createSalesRouter(options.database))
  apiRoutes.use('/settings', createSettingsRouter(options.database))
  app.use('/api/v1', apiRoutes)
  if (options.environment !== 'production') app.use('/api', apiRoutes)
  app.use((_request, _response, next) => next(new ApiError(404, 'NOT_FOUND', 'Route not found')))
  app.use(createErrorHandler())

  return app
}
