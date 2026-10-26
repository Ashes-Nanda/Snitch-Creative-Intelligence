import { describe, expect, test } from 'vitest'
import { parseVisionOutput, visionJsonSchema } from './vision'

const meta = { model: 'test/model', createdAt: '2026-10-26T18:00:00.000Z' }

// A hand-written fixture shaped like a model response. Not real model output.
const valid = {
  observations: {
    format_composition: 'Single static image, model centred, full-length shot',
    garments: [{ type: 'shirt', colour: 'black', pattern: 'embroidered text on chest', details: 'full sleeves' }],
    product_prominence: 'dominant',
    people: 'one',
    background: 'Plain light-grey studio backdrop',
    visual_style: 'studio',
    visible_text: ['SNITCH'],
    offer_text: null,
    cta_text: null,
    text_density: 'low',
  },
  classification: { hook_type: 'model-first', cta_type: 'none' },
  interpretations: { creative_angle: 'Everyday smart-casual wear', rationale: 'Neutral backdrop and relaxed pose suggest a catalogue look.' },
  uncertain: [{ attribute: 'fabric', reason: 'Fabric cannot be determined from the image.' }],
  summary: 'A model in a black embroidered shirt against a grey studio background.',
}

describe('parseVisionOutput', () => {
  test('maps valid output to a creative analysis, keeping observations, interpretations and unknowns apart', () => {
    const result = parseVisionOutput('cr-016', JSON.stringify(valid), meta)
    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return
    const a = result.analysis
    expect(a).toMatchObject({
      creativeId: 'cr-016',
      hookType: 'model-first',
      visualStyle: 'studio',
      ctaType: 'none',
      textDensity: 'low',
      offerType: null,
      productProminence: 'dominant',
      modelVersion: 'test/model',
      createdAt: '2026-10-26T18:00:00.000Z',
      description: valid.summary,
    })
    expect(a.vision?.observations.garments[0].colour).toBe('black')
    expect(a.vision?.interpretations.creative_angle).toBe('Everyday smart-casual wear')
    expect(a.vision?.uncertain).toEqual([{ attribute: 'fabric', reason: 'Fabric cannot be determined from the image.' }])
  })

  test('accepts JSON wrapped in a markdown code fence', () => {
    expect(parseVisionOutput('cr-016', '```json\n' + JSON.stringify(valid) + '\n```', meta).status).toBe('complete')
  })

  test('fails on text that is not JSON', () => {
    expect(parseVisionOutput('cr-016', 'The image shows a man in a shirt.', meta)).toEqual({
      status: 'failed',
      creativeId: 'cr-016',
      reasons: ['output: response was not valid JSON'],
    })
  })

  test('fails as a whole when fields are missing or off-schema, keeping nothing partial', () => {
    const broken = { ...valid, observations: { ...valid.observations, product_prominence: 'huge' }, classification: undefined }
    const result = parseVisionOutput('cr-016', JSON.stringify(broken), meta)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.reasons.some((r) => r.startsWith('observations.product_prominence'))).toBe(true)
      expect(result.reasons.some((r) => r.startsWith('classification'))).toBe(true)
    }
  })

  test('exposes a strict JSON schema for the provider request', () => {
    const schema = visionJsonSchema() as { type: string; required: string[]; additionalProperties: boolean }
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(['observations', 'classification', 'interpretations', 'uncertain', 'summary'])
    expect(schema.additionalProperties).toBe(false)
  })
})
