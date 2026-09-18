/** Deletes every record and stored document in the configured data directory. */
import { createInterface } from 'node:readline/promises'
import { loadConfig } from '../config'
import { SqliteDatabase } from '../db/sqliteDatabase'
import { LocalBlobStore } from '../files/localBlobStore'

async function main(): Promise<void> {
  const config = loadConfig()
  if (!process.argv.includes('--yes')) {
    const readline = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await readline.question(
      `Delete every record and document in ${config.dataDir}? Type "delete" to confirm: `,
    )
    readline.close()
    if (answer.trim() !== 'delete') {
      console.log('Cancelled. Nothing was deleted.')
      return
    }
  }
  const db = new SqliteDatabase({
    file: config.databaseFile,
    blobs: new LocalBlobStore(config.uploadDir),
  })
  await db.clear()
  db.close()
  console.log(`Cleared ${config.databaseFile} and ${config.uploadDir}.`)
}

await main()
