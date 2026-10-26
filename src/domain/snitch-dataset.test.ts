import { describe, expect, test } from 'vitest'
import { ingestDataset, type RawCreative } from './ingest'
import { parseAnalysis, retryAnalysis, type AnalysisOutput } from './analysis'
import { evidenceLevels, type Insight } from './freshness'
import manifest from '../../public/data/snitch-source-manifest.json'

describe('SNITCH Dataset & Provenance Validation', () => {
  test('persists source record, URLs, and verification status', () => {
    const raw: RawCreative = {
      creative_id: 'snitch-test-01',
      name: 'Oversized Cuban Collar Shirt',
      platform: 'meta',
      asset_url: 'https://cdn.shopify.com/s/files/test.jpg',
      format: 'image',
      product_id: 'shirts',
      asset_type: 'product_image',
      product_url: 'https://www.snitch.com/products/oversized-cuban-shirt',
      category: 'Shirts',
      price: 1299,
      currency: 'INR',
      attributes: { fit: 'Oversized', fabric: '100% Rayon' },
      source: {
        source_type: 'official_product_page',
        source_url: 'https://www.snitch.com/products/oversized-cuban-shirt',
        retrieved_at: '2026-10-26T21:40:00Z',
        verification_status: 'verified',
      },
      data_origin: 'public',
    }

    const result = ingestDataset({
      creatives: [raw],
      performance: [],
    })

    expect(result.creatives).toHaveLength(1)
    const c = result.creatives[0]
    expect(c.assetType).toBe('product_image')
    expect(c.category).toBe('Shirts')
    expect(c.price).toBe(1299)
    expect(c.currency).toBe('INR')
    expect(c.attributes).toEqual({ fit: 'Oversized', fabric: '100% Rayon' })
    expect(c.source?.sourceType).toBe('official_product_page')
    expect(c.source?.verificationStatus).toBe('verified')
    expect(c.source?.sourceUrl).toBe('https://www.snitch.com/products/oversized-cuban-shirt')
  })

  test('correctly distinguishes product catalogue images from paid advertisements', () => {
    const catalogueItem: RawCreative = {
      creative_id: 'cat-1',
      name: 'SNITCH Oxford Shirt',
      platform: 'meta',
      asset_url: 'https://cdn.shopify.com/test.jpg',
      format: 'image',
      asset_type: 'product_image',
      data_origin: 'public',
      source: {
        source_type: 'official_product_page',
        source_url: 'https://www.snitch.com/products/oxford',
        verification_status: 'verified',
      },
    }

    const paidAdItem: RawCreative = {
      creative_id: 'ad-1',
      name: 'SNITCH Meta Autumn Campaign',
      platform: 'meta',
      asset_url: 'https://www.zooptrack.co.in/m/s3/ads/test.webp',
      format: 'image',
      asset_type: 'static_ad',
      data_origin: 'public',
      ad_copy: 'Shop the latest streetwear essentials. Flat 15% off.',
      source: {
        source_type: 'official_ad_library',
        source_url: 'https://www.facebook.com/ads/library/?id=123',
        verification_status: 'verified',
      },
    }

    const result = ingestDataset({
      creatives: [catalogueItem, paidAdItem],
      performance: [],
    })

    expect(result.creatives[0].assetType).toBe('product_image')
    expect(result.creatives[0].adCopy).toBeNull()
    expect(result.creatives[1].assetType).toBe('static_ad')
    expect(result.creatives[1].adCopy).toBe('Shop the latest streetwear essentials. Flat 15% off.')
  })

  test('gracefully handles missing optional product metadata', () => {
    const minimal: RawCreative = {
      creative_id: 'min-1',
      name: 'Minimal SNITCH item',
      platform: 'meta',
      asset_url: '/assets/min.jpg',
      format: 'image',
      data_origin: 'public',
      // category, price, attributes, source left undefined
    }

    const result = ingestDataset({
      creatives: [minimal],
      performance: [],
    })

    expect(result.creatives).toHaveLength(1)
    expect(result.creatives[0].price).toBeNull()
    expect(result.creatives[0].category).toBeNull()
    expect(result.creatives[0].attributes).toBeNull()
    expect(result.creatives[0].source).toBeNull()
  })

  test('handles duplicate creative IDs by retaining the first and reporting the duplicate in data quality', () => {
    const item1: RawCreative = {
      creative_id: 'dup-1',
      name: 'Original Item',
      platform: 'meta',
      asset_url: '/assets/1.jpg',
      format: 'image',
      data_origin: 'public',
    }
    const item2: RawCreative = {
      creative_id: 'dup-1',
      name: 'Duplicate Item',
      platform: 'meta',
      asset_url: '/assets/2.jpg',
      format: 'image',
      data_origin: 'public',
    }

    const result = ingestDataset({
      creatives: [item1, item2],
      performance: [],
    })

    expect(result.creatives).toHaveLength(1)
    expect(result.creatives[0].name).toBe('Original Item')
    expect(result.quality.duplicates).toContain('creative dup-1')
  })

  test('detects and rejects malformed creative records', () => {
    const invalidPlatform = {
      creative_id: 'bad-1',
      name: 'Bad platform',
      platform: 'unsupported-ad-network',
      asset_url: '/assets/bad.jpg',
      format: 'image',
    }

    const missingName = {
      creative_id: 'bad-2',
      platform: 'meta',
      asset_url: '/assets/bad.jpg',
      format: 'image',
    }

    const result = ingestDataset({
      creatives: [invalidPlatform, missingName],
      performance: [],
    })

    expect(result.creatives).toHaveLength(0)
    expect(result.quality.invalid).toHaveLength(2)
  })

  test('guarantees performance metrics are labeled simulated/synthetic and never claimed as private SNITCH figures', () => {
    const manifestItems = manifest.assets
    expect(manifestItems.length).toBeGreaterThanOrEqual(20)

    // Check that manifest provenance notes confirm performance is synthetic demo data
    expect(manifest.provenanceNotice).toBeDefined()
    expect(manifest.provenanceNotice.syntheticPerformanceDisclaimer).toContain('synthetic')

    // Confirm every asset in the manifest has a verified or traceable public source
    for (const asset of manifestItems) {
      expect(asset.source.sourceUrl).toMatch(/^https?:\/\//)
      expect(['verified', 'partially_verified', 'unavailable']).toContain(asset.source.verificationStatus)
    }
  })
})

describe('AI Analysis Pipeline & Retries', () => {
  const fallbackOutput: AnalysisOutput = {
    creative_id: 'cr-fail',
    hook_type: 'product-first',
    product_visibility: 'Clean front-facing shirt angle',
    offer_type: null,
    cta_type: 'shop-now',
    visual_style: 'studio',
    text_density: 'low',
    description: 'Minimal studio presentation with neutral backdrop.',
    model_version: 'snitch-vision-v1',
    created_at: new Date().toISOString(),
  }

  test('parseAnalysis fails on malformed model output', () => {
    const broken = {
      creative_id: 'cr-fail',
      hook_type: 'not-a-valid-hook',
    }
    const state = parseAnalysis('cr-fail', broken)
    expect(state.status).toBe('failed')
    if (state.status === 'failed') {
      expect(state.reasons.length).toBeGreaterThan(0)
    }
  })

  test('retryAnalysis successfully repairs a failed creative analysis with corrected output', () => {
    const state = retryAnalysis('cr-fail', fallbackOutput)
    expect(state.status).toBe('complete')
    if (state.status === 'complete') {
      expect(state.analysis.creativeId).toBe('cr-fail')
      expect(state.analysis.hookType).toBe('product-first')
    }
  })

  test('retryAnalysis refuses to complete if retry payload is also malformed', () => {
    const brokenRetry = { ...fallbackOutput, hook_type: 'invalid' as any }
    const state = retryAnalysis('cr-fail', brokenRetry)
    expect(state.status).toBe('failed')
  })
})

describe('Evidence & Hypothesis Guardrails', () => {
  function makeMockInsight(id: string, group: string[], comp: string[]): Insight {
    return {
      insightId: id,
      platform: 'meta',
      attribute: 'hookType',
      value: 'product-first',
      metric: 'ctr',
      title: id,
      finding: 'Testing finding',
      evidence: {
        group: { label: 'Group A', creativeIds: group, impressions: 1000, clicks: 30, value: 3 },
        comparison: { label: 'Group B', creativeIds: comp, impressions: 1000, clicks: 15, value: 1.5 },
        relativeDifference: 1.0,
      },
      interpretation: 'Hypothetical interpretation',
      limitation: 'Synthetic performance data',
      nextStep: 'Draft experiment',
      period: { from: '2026-10-05', to: '2026-10-18' },
    }
  }

  test('labels confounded insights as hypotheses and unconfounded as supported', () => {
    const insA = makeMockInsight('i1', ['c1', 'c2'], ['c3', 'c4'])
    const insB = makeMockInsight('i2', ['c1', 'c2'], ['c5', 'c6'])
    const insC = makeMockInsight('i3', ['c7', 'c8'], ['c9', 'c10'])

    const levels = evidenceLevels([insA, insB, insC])
    // insA and insB share exact same group ['c1', 'c2'] -> confounded
    expect(levels.get('i1')).toBe('hypothesis')
    expect(levels.get('i2')).toBe('hypothesis')
    expect(levels.get('i3')).toBe('supported')
  })
})
