import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  createApp: vi.fn(),
  createLogger: vi.fn(),
  createDatabase: vi.fn(),
}))

vi.mock('dotenv/config', () => ({}))
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir }))
vi.mock('./app.js', () => ({
  createApp: mocks.createApp,
  createLogger: mocks.createLogger,
}))
vi.mock('./db/database.js', () => ({ createDatabase: mocks.createDatabase }))

const environmentKeys = ['HOST', 'PORT', 'FRONTEND_ORIGIN', 'NODE_ENV', 'SESSION_TTL_HOURS', 'PGLITE_DATA_DIR'] as const

describe('backend server startup', () => {
  const originalEnvironment = new Map<string, string | undefined>()
  let signalListeners = new Map<NodeJS.Signals, unknown[]>()
  let database: { initialize: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  let logger: { info: ReturnType<typeof vi.fn> }
  let server: { close: ReturnType<typeof vi.fn> }
  let listen: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    for (const key of environmentKeys) {
      originalEnvironment.set(key, process.env[key])
      delete process.env[key]
    }

    signalListeners = new Map([
      ['SIGINT', process.listeners('SIGINT')],
      ['SIGTERM', process.listeners('SIGTERM')],
    ])
    database = {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }
    logger = { info: vi.fn() }
    server = { close: vi.fn((callback: () => void) => callback()) }
    listen = vi.fn((_port: number, _host: string, callback: () => void) => {
      callback()
      return server
    })
    mocks.mkdir.mockResolvedValue(undefined)
    mocks.createLogger.mockReturnValue(logger)
    mocks.createApp.mockReturnValue({ listen })
    mocks.createDatabase.mockReturnValue(database)
  })

  afterEach(() => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const original = signalListeners.get(signal) ?? []
      for (const listener of process.listeners(signal)) {
        if (!original.includes(listener)) {
          process.removeListener(signal, listener as NodeJS.SignalsListener)
        }
      }
    }
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    vi.restoreAllMocks()
  })

  it('uses safe defaults, initializes persistent storage, and shuts down on SIGINT', async () => {
    const exit = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)

    await import('./server.js')

    expect(mocks.mkdir).toHaveBeenCalledWith(expect.stringContaining('/.local/postgres'), { recursive: true })
    expect(mocks.createDatabase).toHaveBeenCalledWith(expect.stringContaining('/.local/postgres'))
    expect(database.initialize).toHaveBeenCalledOnce()
    expect(mocks.createApp).toHaveBeenCalledWith(
      expect.objectContaining({
        database,
        frontendOrigin: 'http://127.0.0.1:5001',
        environment: 'development',
        sessionTtlHours: 8,
        logger,
      }),
    )
    expect(listen).toHaveBeenCalledWith(5002, '127.0.0.1', expect.any(Function))
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'service.started', service: 'retailflow-api', port: 5002 }),
      'RetailFlow API started',
    )

    const shutdown = process.listeners('SIGINT').find((listener) => !signalListeners.get('SIGINT')?.includes(listener))
    expect(shutdown).toBeTypeOf('function')
    shutdown?.('SIGINT')

    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(server.close).toHaveBeenCalledOnce()
    expect(database.close).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'service.stopping', signal: 'SIGINT' }),
      'Stopping RetailFlow API',
    )
  })

  it('uses explicit runtime configuration and skips filesystem setup for memory storage', async () => {
    const exit = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)
    process.env.HOST = '127.0.0.1'
    process.env.PORT = '5012'
    process.env.FRONTEND_ORIGIN = 'https://retailflow.example.test'
    process.env.NODE_ENV = 'production'
    process.env.SESSION_TTL_HOURS = '12'
    process.env.PGLITE_DATA_DIR = 'memory://'

    await import('./server.js')

    expect(mocks.mkdir).not.toHaveBeenCalled()
    expect(mocks.createDatabase).toHaveBeenCalledWith('memory://')
    expect(mocks.createApp).toHaveBeenCalledWith(
      expect.objectContaining({
        database,
        frontendOrigin: 'https://retailflow.example.test',
        environment: 'production',
        sessionTtlHours: 12,
        logger,
      }),
    )
    expect(listen).toHaveBeenCalledWith(5012, '127.0.0.1', expect.any(Function))

    const shutdown = process
      .listeners('SIGTERM')
      .find((listener) => !signalListeners.get('SIGTERM')?.includes(listener))
    expect(shutdown).toBeTypeOf('function')
    shutdown?.('SIGTERM')

    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(server.close).toHaveBeenCalledOnce()
    expect(database.close).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
  })
})
