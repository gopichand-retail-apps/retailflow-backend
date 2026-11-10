import { randomUUID } from 'node:crypto'
import type { RetailDatabase } from '../db/database.js'

interface AuditEventInput {
  storeId: string
  actorId: string
  eventName: string
  entityType: string
  entityId: string
  metadata: Record<string, number | string | boolean>
}

export async function recordAuditEvent(database: RetailDatabase, event: AuditEventInput): Promise<void> {
  await database.query(
    `INSERT INTO audit_events (
      id, store_id, actor_id, event_name, entity_type, entity_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
    [
      randomUUID(),
      event.storeId,
      event.actorId,
      event.eventName,
      event.entityType,
      event.entityId,
      JSON.stringify(event.metadata),
    ],
  )
}
