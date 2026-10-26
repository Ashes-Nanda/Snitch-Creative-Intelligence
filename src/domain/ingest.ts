import { z } from 'zod'

export const platforms = ['meta', 'google'] as const
export type Platform = (typeof platforms)[number]

export const sourceTypes = ['official_product_page', 'official_ad_library', 'third_party_ad_directory', 'manual_entry'] as const
export type SourceType = (typeof sourceTypes)[number]

/** `unverified` is the default: a record is only `verified` when a check against its source says so. */
export const verificationStatuses = ['verified', 'partially_verified', 'unverified', 'unavailable'] as const
export type VerificationStatus = (typeof verificationStatuses)[number]

export const assetTypes = ['product_image', 'campaign_image', 'static_ad', 'video_ad', 'carousel', 'unknown'] as const
export type AssetType = (typeof assetTypes)[number]

export interface SourceRecord {
  sourceType: SourceType
  sourceUrl: string
  retrievedAt?: string
  verificationStatus: VerificationStatus
  /** What was checked against the source, and what was dropped because it couldn't be confirmed. */
  notes?: string[]
}

export interface CreativeAttributes {
  fit?: string
  color?: string
  fabric?: string
  style?: string
  [key: string]: string | undefined
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
const count = z.number().finite().nonnegative()

const rawSourceSchema = z.object({
  source_type: z.enum(sourceTypes).optional(),
  source_url: z.string().min(1).optional(),
  retrieved_at: z.string().optional(),
  verification_status: z.enum(verificationStatuses).optional(),
  notes: z.array(z.string()).optional(),
})

const rawCreativeSchema = z.object({
  creative_id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(platforms),
  asset_url: z.string().min(1),
  format: z.enum(['image', 'video', 'carousel']),
  product_id: z.string().nullable().optional(),
  published_at: isoDate.nullable().optional(),
  data_origin: z.enum(['public', 'user-provided', 'synthetic']),
  source_note: z.string().optional(),
  // Real SNITCH asset enrichment:
  asset_type: z.enum(assetTypes).optional(),
  product_url: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().optional().nullable(),
  ad_copy: z.string().optional().nullable(),
  attributes: z.record(z.string(), z.string()).optional().nullable(),
  source: rawSourceSchema.optional().nullable(),
})

const rawPerformanceSchema = z.object({
  performance_id: z.string().min(1).optional(),
  creative_id: z.string().min(1),
  platform: z.enum(platforms),
  reporting_start: isoDate,
  reporting_end: isoDate,
  impressions: count,
  clicks: count,
  spend: count,
  conversions: count,
  attributed_revenue: count.nullable(),
  attribution_model: z.string().min(1),
  data_origin: z.enum(['simulated', 'connected']),
})

export interface Creative {
  creativeId: string
  name: string
  platform: Platform
  assetUrl: string
  format: 'image' | 'video' | 'carousel'
  productId: string | null
  publishedAt: string | null
  dataOrigin: 'public' | 'user-provided' | 'synthetic'
  sourceNote: string | null
  assetType?: AssetType
  productUrl?: string | null
  category?: string | null
  price?: number | null
  currency?: string | null
  adCopy?: string | null
  attributes?: CreativeAttributes | null
  source?: SourceRecord | null
}

export interface PerformanceRecord {
  performanceId: string
  creativeId: string
  platform: Platform
  reportingStart: string
  reportingEnd: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  attributedRevenue: number | null
  attributionModel: string
  dataOrigin: 'simulated' | 'connected'
}

export interface InvalidRecord {
  kind: 'creative' | 'performance'
  index: number
  id: string | null
  problems: string[]
}

export interface QualityReport {
  recordsProcessed: number
  invalid: InvalidRecord[]
  duplicates: string[]
  creativesWithoutPerformance: string[]
  performanceWithoutCreative: string[]
}

export interface Dataset {
  creatives: Creative[]
  performance: PerformanceRecord[]
  quality: QualityReport
}

export interface RawDataset {
  creatives: unknown[]
  performance: unknown[]
}

function idOf(raw: unknown, key: string): string | null {
  if (raw && typeof raw === 'object' && key in raw) {
    const v = (raw as Record<string, unknown>)[key]
    return typeof v === 'string' ? v : null
  }
  return null
}

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`)
}

export function ingestDataset(raw: RawDataset): Dataset {
  const invalid: InvalidRecord[] = []
  const duplicates: string[] = []

  const creatives: Creative[] = []
  const seenCreatives = new Set<string>()
  raw.creatives.forEach((r, index) => {
    const parsed = rawCreativeSchema.safeParse(r)
    if (!parsed.success) {
      invalid.push({ kind: 'creative', index, id: idOf(r, 'creative_id'), problems: describeIssues(parsed.error) })
      return
    }
    const c = parsed.data
    if (seenCreatives.has(c.creative_id)) {
      duplicates.push(`creative ${c.creative_id}`)
      return
    }
    seenCreatives.add(c.creative_id)
    creatives.push({
      creativeId: c.creative_id,
      name: c.name,
      platform: c.platform,
      assetUrl: c.asset_url,
      format: c.format,
      productId: c.product_id ?? null,
      publishedAt: c.published_at ?? null,
      dataOrigin: c.data_origin,
      sourceNote: c.source_note ?? null,
      assetType: c.asset_type ?? (c.format === 'carousel' ? 'carousel' : c.format === 'video' ? 'video_ad' : 'static_ad'),
      productUrl: c.product_url ?? null,
      category: c.category ?? null,
      price: c.price ?? null,
      currency: c.currency ?? (c.price ? 'INR' : null),
      adCopy: c.ad_copy ?? null,
      attributes: (c.attributes as CreativeAttributes) ?? null,
      source: c.source
        ? {
            sourceType: c.source.source_type ?? 'manual_entry',
            sourceUrl: c.source.source_url ?? 'https://www.snitch.com/',
            retrievedAt: c.source.retrieved_at,
            verificationStatus: c.source.verification_status ?? 'unverified',
            notes: c.source.notes,
          }
        : null,
    })
  })

  const performance: PerformanceRecord[] = []
  const seenPerformance = new Set<string>()
  raw.performance.forEach((r, index) => {
    const parsed = rawPerformanceSchema.safeParse(r)
    if (!parsed.success) {
      invalid.push({ kind: 'performance', index, id: idOf(r, 'performance_id'), problems: describeIssues(parsed.error) })
      return
    }
    const p = parsed.data
    const problems: string[] = []
    if (p.reporting_end < p.reporting_start) problems.push('reporting_end: before reporting_start')
    if (p.clicks > p.impressions) problems.push('clicks: exceeds impressions')
    if (problems.length) {
      invalid.push({ kind: 'performance', index, id: p.performance_id ?? null, problems })
      return
    }
    // Natural key: one record per creative, platform and reporting period.
    const key = `${p.platform}:${p.creative_id}:${p.reporting_start}:${p.reporting_end}`
    if (seenPerformance.has(key)) {
      duplicates.push(`performance ${key}`)
      return
    }
    seenPerformance.add(key)
    performance.push({
      performanceId: p.performance_id ?? key,
      creativeId: p.creative_id,
      platform: p.platform,
      reportingStart: p.reporting_start,
      reportingEnd: p.reporting_end,
      impressions: p.impressions,
      clicks: p.clicks,
      spend: p.spend,
      conversions: p.conversions,
      attributedRevenue: p.attributed_revenue,
      attributionModel: p.attribution_model,
      dataOrigin: p.data_origin,
    })
  })

  const creativeIds = new Set(creatives.map((c) => c.creativeId))
  const idsWithPerformance = new Set(performance.map((p) => p.creativeId))

  return {
    creatives,
    performance: performance.filter((p) => creativeIds.has(p.creativeId)),
    quality: {
      recordsProcessed: raw.creatives.length + raw.performance.length,
      invalid,
      duplicates,
      creativesWithoutPerformance: creatives.filter((c) => !idsWithPerformance.has(c.creativeId)).map((c) => c.creativeId),
      performanceWithoutCreative: performance.filter((p) => !creativeIds.has(p.creativeId)).map((p) => p.performanceId),
    },
  }
}
