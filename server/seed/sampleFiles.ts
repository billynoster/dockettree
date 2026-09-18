/**
 * Real sample documents, generated as bytes so previews show actual file content.
 * Every sample is stamped SAMPLE — NOT VALID FOR BUSINESS USE.
 */
export const SAMPLE_WATERMARK = 'SAMPLE - NOT VALID FOR BUSINESS USE'

function escapePdfText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
}

export interface SamplePdfOptions {
  title: string
  subtitle?: string
  lines: string[]
}

/** Minimal single-page PDF with Helvetica text and a correct cross-reference table. */
export function createSamplePdfBytes(options: SamplePdfOptions): Uint8Array {
  const bodyLines: string[] = []
  bodyLines.push('BT /F1 20 Tf 54 720 Td (' + escapePdfText(options.title) + ') Tj ET')
  bodyLines.push('BT /F1 11 Tf 54 698 Td (' + escapePdfText(SAMPLE_WATERMARK) + ') Tj ET')
  if (options.subtitle) {
    bodyLines.push('BT /F1 12 Tf 54 672 Td (' + escapePdfText(options.subtitle) + ') Tj ET')
  }
  let y = 640
  for (const line of options.lines) {
    bodyLines.push('BT /F1 11 Tf 54 ' + y + ' Td (' + escapePdfText(line) + ') Tj ET')
    y -= 20
  }
  bodyLines.push('0.85 0.85 0.85 RG 2 w 40 ' + (y - 20) + ' m 560 ' + (y - 20) + ' l S')
  bodyLines.push(
    'BT /F1 32 Tf 0.86 0.86 0.86 rg 90 360 Td (' + escapePdfText(SAMPLE_WATERMARK) + ') Tj ET',
  )
  const content = bodyLines.join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff
  return bytes
}

export function createSamplePdf(options: SamplePdfOptions): Blob {
  const bytes = createSamplePdfBytes(options)
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}

/** PNG sample rendered with canvas. Returns null where no canvas exists (Node tests). */
export async function createSamplePng(options: {
  title: string
  lines: string[]
}): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 560
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = '#f8fafc'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#cbd5e1'
  context.lineWidth = 4
  context.strokeRect(16, 16, canvas.width - 32, canvas.height - 32)

  context.fillStyle = '#0f172a'
  context.font = 'bold 34px system-ui, sans-serif'
  context.fillText(options.title, 48, 92)

  context.fillStyle = '#b45309'
  context.font = 'bold 18px system-ui, sans-serif'
  context.fillText(SAMPLE_WATERMARK, 48, 126)

  context.fillStyle = '#334155'
  context.font = '18px system-ui, sans-serif'
  options.lines.forEach((line, index) => {
    context.fillText(line, 48, 182 + index * 30)
  })

  context.save()
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(-Math.PI / 12)
  context.fillStyle = 'rgba(148, 163, 184, 0.35)'
  context.font = 'bold 46px system-ui, sans-serif'
  context.textAlign = 'center'
  context.fillText('SAMPLE', 0, 0)
  context.restore()

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

export const SAMPLE_DOWNLOADS = [
  {
    filename: 'sample-insurance-certificate.pdf',
    label: 'Sample insurance certificate (PDF)',
    build: () =>
      createSamplePdf({
        title: 'Certificate of insurance',
        subtitle: 'Cedar Grove Property Operations - requested vendor document',
        lines: [
          'Vendor: Sample Vendor LLC',
          'Policy reference: SAMPLE-000-000',
          'Coverage period: 2026-10-01 through 2027-09-30',
          'Issued by: Example Insurance Agency (fictional)',
          '',
          'This file exists only to exercise the upload and review flow.',
          'It contains no real policy, coverage or verification data.',
        ],
      }),
  },
  {
    filename: 'sample-safety-acknowledgment.pdf',
    label: 'Sample safety acknowledgment (PDF)',
    build: () =>
      createSamplePdf({
        title: 'Site safety acknowledgment',
        subtitle: 'Signed acknowledgment of site safety rules',
        lines: [
          'Vendor: Sample Vendor LLC',
          'Acknowledged by: Sample Contact',
          'Date acknowledged: 2026-09-17',
          '',
          'Synthetic document, sample dataset only.',
        ],
      }),
  },
  {
    filename: 'sample-service-agreement.pdf',
    label: 'Sample service agreement (PDF)',
    build: () =>
      createSamplePdf({
        title: 'Service agreement',
        subtitle: 'Scope of routine service visits',
        lines: [
          'Vendor: Sample Vendor LLC',
          'Term: 12 months, renewable',
          'Scope: routine maintenance visits, fictional example only',
          '',
          'Synthetic document, sample dataset only.',
        ],
      }),
  },
]
