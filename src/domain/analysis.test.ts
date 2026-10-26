import { describe, expect, test } from 'vitest'
import { parseAnalysis } from './analysis'

const valid = {
  creative_id: 'c1',
  hook_type: 'product-first',
  product_visibility: 'Shirt fills the frame in the first image',
  offer_type: null,
  cta_type: 'shop-now',
  visual_style: 'studio',
  text_density: 'low',
  description: 'Model in a beige linen shirt on a plain studio backdrop.',
  model_version: 'fixture-v1',
  created_at: '2026-10-20T09:00:00Z',
}

describe('parseAnalysis', () => {
  test('accepts output that matches the schema and links it to its creative', () => {
    const result = parseAnalysis('c1', valid)
    expect(result.status).toBe('complete')
    if (result.status === 'complete') {
      expect(result.analysis.creativeId).toBe('c1')
      expect(result.analysis.hookType).toBe('product-first')
      expect(result.analysis.offerType).toBeNull()
    }
  })

  test('fails the whole analysis rather than keeping partial or unknown attributes', () => {
    const result = parseAnalysis('c1', { ...valid, hook_type: 'emotional-storytelling', cta_type: undefined })
    expect(result).toEqual({
      status: 'failed',
      creativeId: 'c1',
      reasons: [expect.stringContaining('hook_type'), expect.stringContaining('cta_type')],
    })
  })

  test('fails when the output belongs to a different creative', () => {
    expect(parseAnalysis('c2', valid)).toEqual({
      status: 'failed',
      creativeId: 'c2',
      reasons: ['creative_id: output is for c1, expected c2'],
    })
  })

  test('fails when the model returned nothing usable', () => {
    expect(parseAnalysis('c1', null).status).toBe('failed')
  })
})
