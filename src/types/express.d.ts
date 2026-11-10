import type { DemoUser } from '../db/database.js'

declare global {
  namespace Express {
    interface Request {
      user?: DemoUser
      traceId?: string
    }
  }
}

export {}
