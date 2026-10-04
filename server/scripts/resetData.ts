/** Deletes every record and stored document in the configured storage. */
import { createInterface } from 'node:readline/promises'
import { loadConfig } from '../config'
import { openStorage } from '../storage'

async function main(): Promise<void> {
  const config = loadConfig()
  const target =
    config.database.kind === 'postgres'
      ? 'the configured Postgres database (and GCS objects if GCS_BUCKET is set)'
      : config.dataDir
  if (!process.argv.includes('--yes')) {
    const readline = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await readline.question(`Delete every record and document in ${target}? Type "delete" to confirm: `)
    readline.close()
    if (answer.trim() !== 'delete') {
      console.log('Cancelled. Nothing was deleted.')
      return
    }
  }
  const { db, databaseLabel, documentsLabel } = await openStorage(config)
  await db.clear()
  db.close()
  console.log(`Cleared ${databaseLabel} and ${documentsLabel}.`)
}

await main()
