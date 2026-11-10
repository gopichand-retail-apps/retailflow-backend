import { Router } from 'express'
import { z } from 'zod'
import type { RetailDatabase } from '../db/database.js'
import { ApiError, requireValue } from './api-error.js'
import { requireAuth, requireRole } from './auth.js'
import { recordAuditEvent } from './audit.js'

const settingsSchema = z.object({
  demoTaxBasisPoints: z.number().int().min(0).max(10_000),
})

export function createSettingsRouter(database: RetailDatabase): Router {
  const router = Router()
  const requireUser = requireAuth(database)

  router.get('/', requireUser, async (request, response) => {
    const user = requireValue(request.user)
    const settings = await database.query(
      `SELECT name, demo_tax_basis_points AS "demoTaxBasisPoints"
       FROM stores WHERE id = $1`,
      [user.storeId],
    )
    response.json({ settings: requireValue(settings.rows[0]) })
  })

  router.patch('/', requireUser, requireRole('store_admin'), async (request, response) => {
    const user = requireValue(request.user)
    const parsed = settingsSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ApiError(400, 'INVALID_SETTINGS', 'Enter a valid demo tax rate')
    }

    const settings = await database.transaction(async () => {
      const updated = await database.query(
        `UPDATE stores SET demo_tax_basis_points = $1
         WHERE id = $2
         RETURNING name, demo_tax_basis_points AS "demoTaxBasisPoints"`,
        [parsed.data.demoTaxBasisPoints, user.storeId],
      )
      const settings = requireValue(updated.rows[0], 'Store settings were not found')
      await recordAuditEvent(database, {
        storeId: user.storeId,
        actorId: user.id,
        eventName: 'store.demo_tax_updated',
        entityType: 'store',
        entityId: user.storeId,
        metadata: { demoTaxBasisPoints: parsed.data.demoTaxBasisPoints },
      })
      return settings
    })
    response.json({ settings })
  })

  return router
}
