import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type RetailDatabase } from './database.js'

describe('RetailDatabase transactions', () => {
  let database: RetailDatabase

  beforeEach(async () => {
    database = createDatabase('memory://')
    await database.initialize()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await database.close()
  })

  it('serializes concurrent operations on the embedded PostgreSQL connection', async () => {
    const order: string[] = []
    let signalFirstStarted = () => {}
    let releaseFirst = () => {}
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve
    })
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = database.transaction(async () => {
      order.push('first-enter')
      signalFirstStarted()
      await firstGate
      await database.query('SELECT 1')
      order.push('first-exit')
    })
    await firstStarted

    const second = database.transaction(async () => {
      order.push('second-enter')
      await database.query('SELECT 1')
      order.push('second-exit')
    })
    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first-enter', 'first-exit', 'second-enter', 'second-exit'])
  })

  it('preserves both operation and rollback failures when transaction cleanup fails', async () => {
    const operationFailure = new Error('transaction operation failed')
    const rollbackFailure = new Error('rollback failed')
    vi.spyOn(database, 'exec').mockImplementation(async (sql) => {
      if (sql === 'ROLLBACK') throw rollbackFailure
    })

    const failure = await database
      .transaction(async () => {
        throw operationFailure
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AggregateError)
    if (failure instanceof AggregateError) {
      expect(failure.message).toBe('Transaction and rollback both failed')
      expect(failure.errors).toEqual([operationFailure, rollbackFailure])
    }
  })
})
