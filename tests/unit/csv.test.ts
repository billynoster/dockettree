import { describe, expect, it } from 'vitest'
import { csvCell, parseCsv, toCsv, validateImportCsv } from '@/domain/csv'

const HEADER = 'company_name,category,contact_name,contact_email,property_tags'

describe('CSV export sanitization', () => {
  it('neutralizes spreadsheet formula prefixes', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@import')).toBe("'@import")
    expect(csvCell('\tTabbed')).toBe("'\tTabbed")
    expect(csvCell('\rCarriage')).toBe('"\'\rCarriage"')
  })

  it('quotes and escapes separators, quotes and newlines', () => {
    expect(csvCell('Smith, Jones')).toBe('"Smith, Jones"')
    expect(csvCell('He said "no"')).toBe('"He said ""no"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell(null)).toBe('')
  })

  it('writes CRLF-terminated rows', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2\r\n')
  })
})

describe('CSV parsing', () => {
  it('reads quoted fields, escaped quotes and CRLF line endings', () => {
    const parsed = parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n')
    expect(parsed.header).toEqual(['a', 'b'])
    expect(parsed.rows).toEqual([['x,1', 'he said "hi"']])
  })
})

describe('import validation', () => {
  it('accepts a valid file and splits property tags on semicolons', () => {
    const result = validateImportCsv(
      `${HEADER}\nAcme Signs,Signage,Ada Lin,ada.lin@example.com,Riverfront Offices;Westfield Plaza\n`,
      { existingCompanyNames: [] },
    )
    expect(result.fileError).toBeNull()
    expect(result.issues).toHaveLength(0)
    expect(result.candidates[0].property_tags).toEqual(['Riverfront Offices', 'Westfield Plaza'])
  })

  it('reports a missing required column and creates no candidates', () => {
    const result = validateImportCsv('company_name,category\nAcme,Signage\n', {
      existingCompanyNames: [],
    })
    expect(result.fileError).toContain('contact_name')
    expect(result.candidates).toHaveLength(0)
  })

  it('collects every row error with its row number', () => {
    const result = validateImportCsv(
      `${HEADER}\n,Signage,Ada Lin,ada.lin@example.com,\nAcme Signs,Signage,Ada Lin,not-an-email,\n`,
      { existingCompanyNames: [] },
    )
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0]).toMatchObject({ row: 1, column: 'company_name' })
    expect(result.issues[1]).toMatchObject({ row: 2, column: 'contact_email' })
  })

  it('warns about case-insensitive duplicates against existing vendors and earlier rows', () => {
    const result = validateImportCsv(
      `${HEADER}\nacme signs,Signage,Ada Lin,ada.lin@example.com,\nBravo Cleaning,Cleaning,Bo Ray,bo.ray@example.com,\nbravo cleaning,Cleaning,Bo Ray,bo.ray@example.com,\n`,
      { existingCompanyNames: ['Acme Signs'] },
    )
    expect(result.issues).toHaveLength(0)
    expect(result.duplicateWarnings).toHaveLength(2)
    expect(result.duplicateWarnings[0].duplicateOf).toBe('an existing vendor')
    expect(result.duplicateWarnings[1].duplicateOf).toBe('row 2 in this file')
  })

  it('rejects a file with more than 500 rows', () => {
    const rows = Array.from(
      { length: 501 },
      (_, index) => `Vendor ${index},Signage,Ada Lin,ada.lin@example.com,`,
    ).join('\n')
    const result = validateImportCsv(`${HEADER}\n${rows}\n`, { existingCompanyNames: [] })
    expect(result.fileError).toContain('at most 500 rows')
  })
})
