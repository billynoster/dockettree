/** Browser download helper for generated CSV and sample files. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type: mime }))
}
