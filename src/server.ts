import 'dotenv/config'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createApp, createLogger } from './app.js'
import { createDatabase } from './db/database.js'

const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 5002)
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5001'
const environment = process.env.NODE_ENV ?? 'development'
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS ?? 8)
const configuredDataDir = process.env.PGLITE_DATA_DIR ?? './.local/postgres'
const inMemoryDatabase = configuredDataDir === 'memory://'
const dataDir = inMemoryDatabase ? configuredDataDir : resolve(configuredDataDir)
const logger = createLogger()

if (!inMemoryDatabase) await mkdir(dataDir, { recursive: true })
const database = createDatabase(dataDir)
await database.initialize()

const app = createApp({ database, frontendOrigin, environment, sessionTtlHours, logger })
const server = app.listen(port, host, () => {
  logger.info({ eventName: 'service.started', service: 'retailflow-api', port }, 'RetailFlow API started')
})

async function shutdown(signal: string): Promise<void> {
  logger.info({ eventName: 'service.stopping', service: 'retailflow-api', signal }, 'Stopping RetailFlow API')
  server.close(async () => {
    await database.close()
    process.exit(0)
  })
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
