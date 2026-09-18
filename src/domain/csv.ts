/** CSV parsing, import validation and export sanitization (requirements FR-10, FR-11). */
import { isSyntacticallyValidEmail } from './validation'

export const IMPORT_COLUMNS = [
  'company_name',
  'category',
  'contact_name',
  'contact_email',
  'property_tags',
] as const

export const MAX_IMPORT_ROWS = 500
/** Property tags share one cell; the prototype splits on semicolons. */
export const PROPERTY_TAG_SEPARATOR = ';'

export interface ParsedCsv {
  header: string[]
  rows: string[][]
}

/** Minimal RFC 4180 reader: quoted fields, escaped quotes, CR/LF tolerant. */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const input = text.replace(/^\uFEFF/, '')

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < input.length) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      endField()
      i += 1
      continue
    }
    if (char === '\r') {
      if (input[i + 1] === '\n') i += 1
      endRow()
      i += 1
      continue
    }
    if (char === '\n') {
      endRow()
      i += 1
      continue
    }
    field += char
    i += 1
  }
  if (field.length > 0 || row.length > 0) endRow()

  const nonEmpty = rows.filter((cells) => cells.some((cell) => cell.trim().length > 0))
  const [header = [], ...body] = nonEmpty
  return { header: header.map((cell) => cell.trim().toLowerCase()), rows: body }
}

export interface ImportRowIssue {
  /** 1-based row number as it appears in the file, excluding the header. */
  row: number
  column: string
  message: string
}

export interface ImportCandidateRow {
  row: number
  company_name: string
  category: string
  contact_name: string
  contact_email: string
  property_tags: string[]
  /** Case-insensitive company-name match against an existing vendor or an earlier row. */
  duplicateOf: string | null
}

export interface ImportValidation {
  candidates: ImportCandidateRow[]
  issues: ImportRowIssue[]
  duplicateWarnings: ImportCandidateRow[]
  totalRows: number
  /** Blocking problem with the file as a whole, e.g. a missing column. */
  fileError: string | null
}

export function validateImportCsv(
  text: string,
  context: { existingCompanyNames: string[]; knownProperties?: string[] },
): ImportValidation {
  const parsed = parseCsv(text)
  const empty: ImportValidation = {
    candidates: [],
    issues: [],
    duplicateWarnings: [],
    totalRows: 0,
    fileError: null,
  }

  if (parsed.header.length === 0) {
    return { ...empty, fileError: 'That file is empty.' }
  }
  const missing = IMPORT_COLUMNS.filter((column) => !parsed.header.includes(column))
  if (missing.length > 0) {
    return {
      ...empty,
      fileError: `The header row is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected ${IMPORT_COLUMNS.join(', ')}.`,
    }
  }
  if (parsed.rows.length === 0) {
    return { ...empty, fileError: 'That file has a header row but no vendor rows.' }
  }
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return {
      ...empty,
      totalRows: parsed.rows.length,
      fileError: `That file has ${parsed.rows.length} rows. Import at most ${MAX_IMPORT_ROWS} rows at a time.`,
    }
  }

  const indexOf = (column: string) => parsed.header.indexOf(column)
  const existing = new Set(context.existingCompanyNames.map((name) => name.trim().toLowerCase()))
  const seen = new Map<string, number>()

  const candidates: ImportCandidateRow[] = []
  const issues: ImportRowIssue[] = []

  parsed.rows.forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 1
    const value = (column: string) => (cells[indexOf(column)] ?? '').trim()
    const company_name = value('company_name')
    const category = value('category')
    const contact_name = value('contact_name')
    const contact_email = value('contact_email')
    const property_tags = value('property_tags')
      .split(PROPERTY_TAG_SEPARATOR)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)

    if (company_name.length === 0) {
      issues.push({ row: rowNumber, column: 'company_name', message: 'Company name is required.' })
    }
    if (category.length === 0) {
      issues.push({ row: rowNumber, column: 'category', message: 'Category is required.' })
    }
    if (contact_name.length === 0) {
      issues.push({ row: rowNumber, column: 'contact_name', message: 'Contact name is required.' })
    }
    if (contact_email.length === 0) {
      issues.push({ row: rowNumber, column: 'contact_email', message: 'Contact email is required.' })
    } else if (!isSyntacticallyValidEmail(contact_email)) {
      issues.push({
        row: rowNumber,
        column: 'contact_email',
        message: `"${contact_email}" is not a valid email address.`,
      })
    }

    const key = company_name.toLowerCase()
    let duplicateOf: string | null = null
    if (company_name.length > 0) {
      if (existing.has(key)) duplicateOf = 'an existing vendor'
      else if (seen.has(key)) duplicateOf = `row ${seen.get(key)} in this file`
      else seen.set(key, rowNumber)
    }

    candidates.push({
      row: rowNumber,
      company_name,
      category,
      contact_name,
      contact_email,
      property_tags,
      duplicateOf,
    })
  })

  return {
    candidates,
    issues,
    duplicateWarnings: candidates.filter((candidate) => candidate.duplicateOf !== null),
    totalRows: parsed.rows.length,
    fileError: null,
  }
}

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

/**
 * Neutralize spreadsheet formula injection, then quote per RFC 4180.
 * A leading =, +, -, @, tab or CR is prefixed with an apostrophe.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (text.length > 0 && FORMULA_PREFIXES.includes(text[0])) {
    text = `'${text}`
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}
