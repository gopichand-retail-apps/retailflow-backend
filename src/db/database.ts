import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export interface DemoUser {
  id: string
  storeId: string
  displayName: string
  role: 'cashier' | 'supervisor' | 'store_admin'
}

export interface ProductRow {
  id: string
  sku: string
  barcode: string
  name: string
  description: string
  category: string
  unitPriceMinor: number
  stockQuantity: number
  lowStockThreshold: number
  imageUrl: string
}

interface QueryResult<T> {
  rows: T[]
}

const STORE_ID = 'store-demo-01'

const DEMO_USERS: DemoUser[] = [
  { id: 'user-cashier-01', storeId: STORE_ID, displayName: 'Alex Morgan', role: 'cashier' },
  { id: 'user-supervisor-01', storeId: STORE_ID, displayName: 'Jordan Lee', role: 'supervisor' },
  { id: 'user-admin-01', storeId: STORE_ID, displayName: 'Taylor Chen', role: 'store_admin' },
]

const DEMO_PRODUCTS: ProductRow[] = [
  {
    id: 'product-coffee-beans',
    sku: 'PAN-2041',
    barcode: '850000000001',
    name: 'Daybreak Coffee Beans',
    description: '12 oz · whole bean · medium roast',
    category: 'Pantry',
    unitPriceMinor: 1840,
    stockQuantity: 18,
    lowStockThreshold: 6,
    imageUrl: '/images/coffee-beans.webp',
  },
  {
    id: 'product-house-blend',
    sku: 'PAN-2042',
    barcode: '850000000002',
    name: 'House Blend Drip',
    description: 'Single origin · 10 oz bag',
    category: 'Pantry',
    unitPriceMinor: 1425,
    stockQuantity: 12,
    lowStockThreshold: 5,
    imageUrl: '/images/house-blend.webp',
  },
  {
    id: 'product-ceramic-mug',
    sku: 'HOM-1108',
    barcode: '850000000003',
    name: 'Ceramic Coffee Mug',
    description: 'Stoneware cup | 12 oz',
    category: 'Home',
    unitPriceMinor: 2600,
    stockQuantity: 9,
    lowStockThreshold: 4,
    imageUrl: '/images/ceramic-mug.webp',
  },
  {
    id: 'product-water-bottle',
    sku: 'HOM-1112',
    barcode: '850000000004',
    name: 'Trail Steel Bottle',
    description: 'Double-wall steel · 20 oz',
    category: 'Home',
    unitPriceMinor: 3200,
    stockQuantity: 14,
    lowStockThreshold: 5,
    imageUrl: '/images/water-bottle.webp',
  },
  {
    id: 'product-field-notebook',
    sku: 'STA-0316',
    barcode: '850000000005',
    name: 'Field Notes Journal',
    description: 'Recycled paper · ruled · 160 pages',
    category: 'Stationery',
    unitPriceMinor: 1250,
    stockQuantity: 24,
    lowStockThreshold: 8,
    imageUrl: '/images/field-notebook.webp',
  },
  {
    id: 'product-canvas-tote',
    sku: 'ACC-0850',
    barcode: '850000000006',
    name: 'Everyday Daypack',
    description: 'Compact carry bag | adjustable straps',
    category: 'Accessories',
    unitPriceMinor: 2200,
    stockQuantity: 11,
    lowStockThreshold: 4,
    imageUrl: '/images/canvas-tote.webp',
  },
  {
    id: 'product-wireless-speaker',
    sku: 'TEC-0203',
    barcode: '850000000007',
    name: 'JBL Portable Speaker',
    description: 'Bluetooth audio | 8-hour battery',
    category: 'Tech',
    unitPriceMinor: 4800,
    stockQuantity: 4,
    lowStockThreshold: 5,
    imageUrl: '/images/speaker.webp',
  },
  {
    id: 'product-hand-soap',
    sku: 'HOM-1184',
    barcode: '850000000008',
    name: 'Handmade Soap Bars',
    description: 'Plant-based | cedar and lavender',
    category: 'Home',
    unitPriceMinor: 1350,
    stockQuantity: 16,
    lowStockThreshold: 5,
    imageUrl: '/images/hand-wash.webp',
  },
]

export class RetailDatabase {
  private readonly client: PGlite
  private transactionTail: Promise<void> = Promise.resolve()

  constructor(dataDir: string) {
    this.client = new PGlite(dataDir)
  }

  async initialize(): Promise<void> {
    await this.client.waitReady
    await this.client.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (' +
        'version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    )

    const migration = await this.query<{ version: string }>(
      'SELECT version FROM schema_migrations WHERE version = $1',
      ['001_initial'],
    )

    if (migration.rows.length === 0) {
      await this.applyInitialMigration()
    }

    await this.seedDemoData()
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.client.query<T>(sql, params)
  }

  exec(sql: string): Promise<void> {
    return this.client.exec(sql).then(() => undefined)
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.transactionTail
    let release = () => {}
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous

    try {
      await this.exec('BEGIN')
      try {
        const result = await operation()
        await this.exec('COMMIT')
        return result
      } catch (error) {
        try {
          await this.exec('ROLLBACK')
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], 'Transaction and rollback both failed')
        }
        throw error
      }
    } finally {
      release()
    }
  }

  close(): Promise<void> {
    return this.client.close()
  }

  private async applyInitialMigration(): Promise<void> {
    const sql = await readFile(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8')
    await this.transaction(async () => {
      await this.exec(sql)
      await this.query('INSERT INTO schema_migrations (version) VALUES ($1)', ['001_initial'])
    })
  }

  private async seedDemoData(): Promise<void> {
    await this.query(
      `INSERT INTO stores (id, name, demo_tax_basis_points)
       VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [STORE_ID, 'Field & Found · Demo Store', 825],
    )

    for (const user of DEMO_USERS) {
      await this.query(
        `INSERT INTO users (id, store_id, display_name, role)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [user.id, user.storeId, user.displayName, user.role],
      )
    }

    for (const product of DEMO_PRODUCTS) {
      await this.insertProduct(product)
    }
  }

  private async insertProduct(product: ProductRow): Promise<void> {
    await this.query(
      `INSERT INTO products (
        id, store_id, sku, barcode, name, description, category, unit_price_minor,
        stock_quantity, low_stock_threshold, image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      [
        product.id,
        STORE_ID,
        product.sku,
        product.barcode,
        product.name,
        product.description,
        product.category,
        product.unitPriceMinor,
        product.stockQuantity,
        product.lowStockThreshold,
        product.imageUrl,
      ],
    )
  }
}

export function createDatabase(dataDir: string): RetailDatabase {
  return new RetailDatabase(dataDir)
}
