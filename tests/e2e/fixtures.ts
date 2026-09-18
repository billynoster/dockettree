/**
 * Every end-to-end test starts from the same sample dataset, so a mutating test cannot change
 * what a later one sees. The reset goes through the running server, because SQLite gives one
 * process ownership of the database file.
 */
import { test as base } from '@playwright/test'
import { STAFF_PASSWORD, VENDOR_PASSWORD } from './helpers'

export const test = base.extend<{ freshData: void }>({
  freshData: [
    async ({ baseURL, request }, use) => {
      const response = await request.post(`${baseURL}/api/testing/reseed`, {
        data: { staffPassword: STAFF_PASSWORD, vendorPassword: VENDOR_PASSWORD },
      })
      if (!response.ok()) {
        throw new Error(`Could not reset the sample data: ${response.status()} ${await response.text()}`)
      }
      await use()
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
