/**
 * Layering guards.
 *
 * The browser bundle must never contain the service layer, the storage adapters or anything
 * under `server/`: business rules run on the server only. Type-only imports are allowed
 * because they disappear at build time.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TABLES, type TableSpec } from '../../server/db/tables'
import { createDatabase } from '../harness'

const ROOT = path.resolve(import.meta.dirname, '../..')

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const CLIENT_DIRECTORIES = ['src/app', 'src/features', 'src/components', 'src/api']

describe('client bundle boundary', () => {
  it('imports server-side modules for types only', () => {
    const offenders: string[] = []
    for (const directory of CLIENT_DIRECTORIES) {
      for (const file of walk(path.join(ROOT, directory))) {
        if (!/\.tsx?$/.test(file)) continue
        const source = readFileSync(file, 'utf8')
        const imports = source.matchAll(/^import\s+([\s\S]*?)from\s+'([^']+)'/gm)
        for (const match of imports) {
          const [, clause, specifier] = match
          const serverSide =
            specifier.startsWith('@/services') ||
            specifier.startsWith('@/repositories') ||
            specifier.includes('server/')
          if (!serverSide) continue
          const typeOnly = clause.trimStart().startsWith('type ') || !/\b\w+\s*,?\s*(\{|$)/.test(clause)
          const namedValues = /\{([^}]*)\}/.exec(clause)?.[1] ?? ''
          const hasValueImport = namedValues
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
            .some((name) => !name.startsWith('type '))
          if (!typeOnly && hasValueImport) {
            offenders.push(`${path.relative(ROOT, file)} -> ${specifier}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the browser away from the database and file system', () => {
    const offenders: string[] = []
    for (const directory of CLIENT_DIRECTORIES) {
      for (const file of walk(path.join(ROOT, directory))) {
        if (!/\.tsx?$/.test(file)) continue
        const source = readFileSync(file, 'utf8')
        if (
          /from 'better-sqlite3'|from 'pg'|from '@google-cloud\/|from 'node:fs'|from 'nodemailer'|indexedDB/.test(
            source,
          )
        ) {
          offenders.push(path.relative(ROOT, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('schema', () => {
  it('matches the row mapping used by the SQLite adapter', () => {
    const { db } = createDatabase()
    try {
      for (const spec of Object.values(TABLES) as TableSpec[]) {
        const actual = db.columnsOf(spec.table).sort()
        expect(Object.keys(spec.columns).sort(), `columns of ${spec.table}`).toEqual(actual)
      }
    } finally {
      db.close()
    }
  })
})
