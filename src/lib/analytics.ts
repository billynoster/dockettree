/**
 * No-op analytics helpers. Event names are stable so a real vendor can be wired later
 * without renaming call sites. Nothing is sent today.
 */

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>

const EVENT_NAMES = [
  'pricing_viewed',
  'billing_toggle_changed',
  'plan_cta_clicked',
  'comparison_toggled',
  'faq_expanded',
  'book_demo_clicked',
  'founding_offer_viewed',
  'pricing_clarity_link_clicked',
  'billing_settings_viewed',
  'billing_cta_clicked',
] as const

export type AnalyticsEventName = (typeof EVENT_NAMES)[number]

/** Canonical event name list for docs and future wiring. */
export const ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = EVENT_NAMES

/**
 * Record a product analytics event. Currently a no-op that only logs in development
 * when `import.meta.env.DEV` is true.
 */
export function track(event: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional local-only analytics stub
    console.debug(`[analytics] ${event}`, payload)
  }
}
