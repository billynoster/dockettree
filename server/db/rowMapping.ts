/**
 * Shared conversion between domain entities and SQL rows. SQLite stores booleans as 0/1
 * and JSON as text; Postgres uses BOOLEAN and JSONB (already parsed objects on read).
 */
import type { TableSpec } from './tables'

export type SqlDialect = 'sqlite' | 'postgres'

type Row = Record<string, unknown>

export function toRow(spec: TableSpec, entity: Record<string, unknown>, dialect: SqlDialect): Row {
  const row: Row = {}
  for (const [field, kind] of Object.entries(spec.columns)) {
    const value = entity[field]
    if (value === undefined || value === null) {
      row[field] = null
      continue
    }
    if (kind === 'bool') row[field] = dialect === 'postgres' ? Boolean(value) : value ? 1 : 0
    else if (kind === 'json') row[field] = JSON.stringify(value)
    else if (kind === 'int') row[field] = Number(value)
    else row[field] = String(value)
  }
  return row
}

export function fromRow<T>(spec: TableSpec, row: Row | undefined): T | undefined {
  if (!row) return undefined
  const entity: Record<string, unknown> = {}
  for (const [field, kind] of Object.entries(spec.columns)) {
    const value = row[field]
    if (kind === 'bool') entity[field] = value === 1 || value === true || value === 't'
    else if (kind === 'json') {
      if (value === null || value === undefined) entity[field] = null
      else if (typeof value === 'string') entity[field] = JSON.parse(value)
      else entity[field] = value
    } else entity[field] = value ?? null
  }
  return entity as T
}

export function upsertSql(spec: TableSpec, dialect: SqlDialect): { sql: string; columns: string[] } {
  const columns = Object.keys(spec.columns)
  if (dialect === 'sqlite') {
    const sql = `INSERT INTO ${spec.table} (${columns.join(', ')}) VALUES (${columns
      .map((column) => `@${column}`)
      .join(', ')}) ON CONFLICT(${spec.key}) DO UPDATE SET ${columns
      .filter((column) => column !== spec.key)
      .map((column) => `${column} = excluded.${column}`)
      .join(', ')}`
    return { sql, columns }
  }
  const placeholders = columns
    .map((column, index) => {
      const placeholder = `$${index + 1}`
      return spec.columns[column] === 'json' ? `${placeholder}::jsonb` : placeholder
    })
    .join(', ')
  const assignments = columns
    .filter((column) => column !== spec.key)
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ')
  const sql = `INSERT INTO ${spec.table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${spec.key}) DO UPDATE SET ${assignments}`
  return { sql, columns }
}

export function resolveIndexColumn(spec: TableSpec, index: string): string {
  const column = spec.indexes[index] ?? (index.startsWith('by_') ? index.slice(3) : index)
  if (!(column in spec.columns)) {
    throw new Error(`Unknown index ${index} on ${spec.table}`)
  }
  return column
}
