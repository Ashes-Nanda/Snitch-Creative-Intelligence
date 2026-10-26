import { describe, expect, test } from 'vitest'
import { ingestDataset } from './ingest'

const creative = (id: string, overrides: Record<string, unknown> = {}) => ({
  creative_id: id,
  name: `Creative ${id}`,
  platform: 'meta',
  asset_url: `/assets/${id}.jpg`,
  format: 'image',
  product_id: 'shirts',
  data_origin: 'synthetic',
  ...overrides,
})

const perf = (creativeId: string, overrides: Record<string, unknown> = {}) => ({
  creative_id: creativeId,
  platform: 'meta',
  reporting_start: '2026-10-05',
  reporting_end: '2026-10-11',
  impressions: 1000,
  clicks: 20,
  spend: 50,
  conversions: 2,
  attributed_revenue: 120,
  attribution_model: '7-day click',
  data_origin: 'simulated',
  ...overrides,
})

describe('ingestDataset', () => {
  test('loads a valid dataset with a clean quality report', () => {
    const result = ingestDataset({
      creatives: [creative('c1'), creative('c2')],
      performance: [perf('c1'), perf('c2')],
    })

    expect(result.creatives.map((c) => c.creativeId)).toEqual(['c1', 'c2'])
    expect(result.performance).toHaveLength(2)
    expect(result.quality).toEqual({
      recordsProcessed: 4,
      invalid: [],
      duplicates: [],
      creativesWithoutPerformance: [],
      performanceWithoutCreative: [],
    })
  })

  test('reports invalid records with the fields that failed, and excludes them', () => {
    const result = ingestDataset({
      creatives: [creative('c1'), creative('c2', { platform: 'tiktok' })],
      performance: [perf('c1'), perf('c1', { reporting_start: '2026-10-12', reporting_end: '2026-10-18', clicks: 5000 })],
    })

    expect(result.creatives.map((c) => c.creativeId)).toEqual(['c1'])
    expect(result.performance).toHaveLength(1)
    expect(result.quality.invalid).toEqual([
      { kind: 'creative', index: 1, id: 'c2', problems: [expect.stringContaining('platform')] },
      { kind: 'performance', index: 1, id: null, problems: ['clicks: exceeds impressions'] },
    ])
  })

  test('drops duplicate performance records for the same creative and period', () => {
    const result = ingestDataset({
      creatives: [creative('c1')],
      performance: [perf('c1'), perf('c1', { clicks: 99 })],
    })

    expect(result.performance).toHaveLength(1)
    expect(result.performance[0].clicks).toBe(20)
    expect(result.quality.duplicates).toEqual(['performance meta:c1:2026-10-05:2026-10-11'])
  })

  test('flags creatives with no performance and performance with no creative', () => {
    const result = ingestDataset({
      creatives: [creative('c1'), creative('lonely')],
      performance: [perf('c1'), perf('ghost', { performance_id: 'p-ghost' })],
    })

    expect(result.quality.creativesWithoutPerformance).toEqual(['lonely'])
    expect(result.quality.performanceWithoutCreative).toEqual(['p-ghost'])
    expect(result.performance.map((p) => p.creativeId)).toEqual(['c1'])
  })

  test('assigns a stable id to performance records that arrive without one', () => {
    const result = ingestDataset({ creatives: [creative('c1')], performance: [perf('c1')] })
    expect(result.performance[0].performanceId).toBe('meta:c1:2026-10-05:2026-10-11')
  })

  test('keeps the first of two creatives sharing an ID and reports the duplicate', () => {
    const result = ingestDataset({
      creatives: [creative('c1', { name: 'First' }), creative('c1', { name: 'Second' })],
      performance: [perf('c1')],
    })
    expect(result.creatives.map((c) => c.name)).toEqual(['First'])
    expect(result.quality.duplicates).toEqual(['creative c1'])
  })

  test('a source without a verification status is recorded as unverified, never as verified', () => {
    const result = ingestDataset({
      creatives: [creative('c1', { data_origin: 'public', source: { source_type: 'third_party_ad_directory', source_url: 'https://example.com/ad' } })],
      performance: [],
    })
    expect(result.creatives[0].source).toMatchObject({ sourceType: 'third_party_ad_directory', verificationStatus: 'unverified' })
  })

  test('keeps verification notes recorded against a source', () => {
    const result = ingestDataset({
      creatives: [
        creative('c1', {
          data_origin: 'public',
          source: { source_type: 'official_product_page', source_url: 'https://www.snitch.com/p', verification_status: 'verified', notes: ['Price read from product page'] },
        }),
      ],
      performance: [],
    })
    expect(result.creatives[0].source?.notes).toEqual(['Price read from product page'])
  })

  test('a source without a source type is recorded as a manual entry, not an official page', () => {
    const result = ingestDataset({
      creatives: [creative('c1', { data_origin: 'public', source: { source_url: 'https://example.com/x' } })],
      performance: [],
    })
    expect(result.creatives[0].source?.sourceType).toBe('manual_entry')
  })
})
