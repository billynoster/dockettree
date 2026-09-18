/**
 * Vendor list filters. They live in the browser URL so a link reproduces exact counts
 * (FR-09) and are parsed again on the server from the API query string.
 */
import type { ReadinessStatus, VendorLifecycle } from './types'

export interface VendorListQuery {
  search?: string
  readiness?: ReadinessStatus[]
  category?: string | null
  property?: string | null
  expiringSoonOnly?: boolean
  lifecycle?: VendorLifecycle | 'all'
  sort?: 'name' | 'next_expiration' | 'updated'
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const READINESS_VALUES: ReadinessStatus[] = [
  'ready',
  'awaiting_review',
  'not_ready',
  'unconfigured',
  'archived',
]

export function parseVendorQuery(params: URLSearchParams): VendorListQuery {
  const readiness = (params.get('readiness') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is ReadinessStatus =>
      READINESS_VALUES.includes(value as ReadinessStatus),
    )
  const lifecycleParam = params.get('lifecycle')
  const lifecycle: VendorLifecycle | 'all' =
    lifecycleParam === 'archived' || lifecycleParam === 'all' ? lifecycleParam : 'active'
  const sortParam = params.get('sort')
  const sort: VendorListQuery['sort'] =
    sortParam === 'next_expiration' || sortParam === 'updated' ? sortParam : 'name'

  return {
    search: params.get('q') ?? '',
    readiness,
    category: params.get('category') || null,
    property: params.get('property') || null,
    expiringSoonOnly: params.get('expiring') === '1',
    lifecycle,
    sort,
    direction: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Number.parseInt(params.get('page') ?? '1', 10) || 1,
  }
}

export function vendorQueryToParams(query: VendorListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.search) params.set('q', query.search)
  if (query.readiness && query.readiness.length > 0) {
    params.set('readiness', query.readiness.join(','))
  }
  if (query.category) params.set('category', query.category)
  if (query.property) params.set('property', query.property)
  if (query.expiringSoonOnly) params.set('expiring', '1')
  if (query.lifecycle && query.lifecycle !== 'active') params.set('lifecycle', query.lifecycle)
  if (query.sort && query.sort !== 'name') params.set('sort', query.sort)
  if (query.direction === 'desc') params.set('dir', 'desc')
  if (query.page && query.page > 1) params.set('page', String(query.page))
  return params
}

export function vendorsLink(query: VendorListQuery): string {
  const params = vendorQueryToParams(query)
  const search = params.toString()
  return search.length > 0 ? `/vendors?${search}` : '/vendors'
}

export function hasActiveFilters(query: VendorListQuery): boolean {
  return Boolean(
    (query.search && query.search.length > 0) ||
      (query.readiness && query.readiness.length > 0) ||
      query.category ||
      query.property ||
      query.expiringSoonOnly ||
      (query.lifecycle && query.lifecycle !== 'active'),
  )
}
