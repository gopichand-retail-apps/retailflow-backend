import { Router } from 'express'
import type { RetailDatabase } from '../db/database.js'
import { requireValue } from './api-error.js'
import { requireAuth } from './auth.js'

export function createOverviewRouter(database: RetailDatabase): Router {
  const router = Router()

  router.get('/', requireAuth(database), async (request, response) => {
    const user = requireValue(request.user)
    const [sales, products, pendingReturns] = await Promise.all([
      database.query<{ saleCount: number; grossMinor: number }>(
        `SELECT COUNT(*)::INTEGER AS "saleCount",
          COALESCE(SUM(total_minor), 0)::INTEGER AS "grossMinor"
         FROM sales WHERE store_id = $1 AND created_at >= DATE_TRUNC('day', NOW())`,
        [user.storeId],
      ),
      database.query<{ lowStockCount: number; productCount: number }>(
        `SELECT COUNT(*) FILTER (WHERE stock_quantity <= low_stock_threshold)::INTEGER AS "lowStockCount",
          COUNT(*)::INTEGER AS "productCount" FROM products WHERE store_id = $1`,
        [user.storeId],
      ),
      database.query<{ count: number }>(
        `SELECT COUNT(*)::INTEGER AS count FROM returns
         WHERE store_id = $1 AND created_at >= DATE_TRUNC('day', NOW())`,
        [user.storeId],
      ),
    ])

    response.json({
      salesToday: sales.rows[0]?.saleCount ?? 0,
      grossMinor: sales.rows[0]?.grossMinor ?? 0,
      lowStockCount: products.rows[0]?.lowStockCount ?? 0,
      productCount: products.rows[0]?.productCount ?? 0,
      returnsToday: pendingReturns.rows[0]?.count ?? 0,
    })
  })

  return router
}
