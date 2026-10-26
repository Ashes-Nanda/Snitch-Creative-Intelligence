import { describe, expect, test } from 'vitest'
import { parseVisionOutput, visionJsonSchema } from './vision'

const meta = { model: 'test/model', createdAt: '2026-10-26T18:00:00.000Z' }

// Valid v2 Creative Intelligence payload
const validV2 = {
  schema_version: '2.0',
  summary:
    'A curly-haired man stands outdoors in a burgundy shirt holding roses, announcing the SNITCH QUICK 60-minute delivery launch in Delhi.',
  message_breakdown: {
    primary_message: 'SNITCH QUICK launches in Delhi with 60-minute delivery for date-ready menswear.',
    supporting_message: 'Date-ready looks delivered fast.',
    product_or_service_category: 'Menswear & Rapid Delivery Service',
    campaign_context: 'Service launch in Delhi',
    value_proposition: 'Delivered in 60 mins',
    promotional_offer: null, // explicit null: delivery speed is a value prop, not a discount!
    cta_text: null, // explicit null: no CTA button in frame
    visible_text: ['SNITCH QUICK', 'NOW LIVE IN DELHI', 'DATE-READY LOOKS', 'DELIVERED IN 60 MINS'],
    message_hierarchy: 'Brand logo leading to geographic availability, style category, and delivery speed claim.',
    claims_requiring_external_verification: [
      '60-minute delivery fulfillment guarantee in specified Delhi pin codes.',
    ],
  },
  attributes: {
    visual_hook: 'model-led', // model is visual lead
    message_hook: 'delivery benefit', // copy angle is delivery, NOT model-led!
    creative_concept: 'Date-ready styling combined with rapid delivery',
    visual_style: 'street',
    product_prominence: 'prominent',
    people_count: 1,
    product_categories: ['shirt', 'trousers', 'bag'],
    text_density: 'medium',
    cta_presence: 'absent',
    offer_presence: 'absent',
    visual_hierarchy: 'Model on left draws visual attention, followed by stacked text on right.',
    key_visual_elements: ['Model with roses and bag', 'Burgundy button-up shirt', 'Delhi launch copy', 'SNITCH QUICK branding'],
  },
  experiment_opportunities: [
    {
      title: 'Test delivery-led vs styling-led headline hierarchy',
      observation: "Headline copy currently leads with styling before 'DELIVERED IN 60 MINS'.",
      hypothesis:
        'Testing delivery-led headline prominence against styling-led headline prominence may improve CTR by clarifying the core value proposition upfront.',
      variable_to_test: 'Headline copy hierarchy and prominence',
      control: "Current creative with styling headline prominent ('DATE-READY LOOKS')",
      variant: 'Variant emphasizing 60-minute delivery promise as primary headline with identical visual assets',
      primary_metric: 'ctr',
      guardrail_metrics: ['cpa', 'roas'],
      rationale: 'Isolates messaging hierarchy to determine if urgency drives higher click engagement without altering imagery.',
      evidence_basis: 'visual evidence',
      limitations: 'Synthetic performance data; delivery service guarantee applies only to supported pin codes.',
      status: 'proposed',
    },
  ],
  evidence_and_uncertainty: {
    observations: [
      'Single square image with model on left and copy stacked on right.',
      'Visible text reads: "SNITCH QUICK", "NOW LIVE IN DELHI", "DATE-READY LOOKS", "DELIVERED IN 60 MINS".',
    ],
    interpretations: [
      'Announces rapid delivery service launch framed around date night preparation.',
      'Street backdrop and bouquet suggest urgent preparation for an evening occasion.',
    ],
    uncertainties: [
      'Actual delivery turnaround time cannot be established from the image.',
      'Fabric composition and stretch cannot be confirmed visually.',
    ],
    verification_required: [
      '60-minute delivery guarantee availability in specific recipient pin codes.',
    ],
    analysis_limitations: [
      'Static single-frame analysis; unobserved audio or video context.',
    ],
  },
  visual_evidence: {
    format_composition: 'Single square image, model on left, text overlay on right with dark gradient',
    garments: [
      { type: 'shirt', colour: 'burgundy', pattern: 'solid', details: 'long sleeves, open collar' },
      { type: 'trousers', colour: 'black', pattern: 'solid', details: 'straight cut' },
    ],
    background: 'Outdoor urban street setting at twilight',
  },
}

// A hand-written legacy v1 fixture for backward compatibility testing
const validLegacy = {
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

describe('parseVisionOutput with Creative Intelligence (v2.0)', () => {
  test('maps valid v2 output with full intelligence structure and separate visual vs message hooks', () => {
    const result = parseVisionOutput('cr-012', JSON.stringify(validV2), meta)
    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return
    const a = result.analysis
    expect(a.creativeId).toBe('cr-012')
    expect(a.schemaVersion).toBe('2.0')
    expect(a.intelligence).toBeDefined()
    const intel = a.intelligence!

    // Separate visual hook and message hook
    expect(intel.attributes.visual_hook).toBe('model-led')
    expect(intel.attributes.message_hook).toBe('delivery benefit')

    // Distinguishing value proposition from promotional offer
    expect(intel.message_breakdown.value_proposition).toBe('Delivered in 60 mins')
    expect(intel.message_breakdown.promotional_offer).toBeNull()

    // Absent CTA handling
    expect(intel.message_breakdown.cta_text).toBeNull()
    expect(intel.attributes.cta_presence).toBe('absent')

    // Experiment opportunities
    expect(intel.experiment_opportunities).toHaveLength(1)
    expect(intel.experiment_opportunities[0].title).toBe('Test delivery-led vs styling-led headline hierarchy')
    expect(intel.experiment_opportunities[0].primary_metric).toBe('ctr')
    expect(intel.experiment_opportunities[0].guardrail_metrics).toEqual(['cpa', 'roas'])

    // Evidence & Uncertainty separation
    expect(intel.evidence_and_uncertainty.observations.length).toBeGreaterThan(0)
    expect(intel.evidence_and_uncertainty.uncertainties.length).toBeGreaterThan(0)
    expect(intel.evidence_and_uncertainty.verification_required).toEqual([
      '60-minute delivery guarantee availability in specific recipient pin codes.',
    ])
  })

  test('transparently adapts legacy v1 model outputs', () => {
    const result = parseVisionOutput('cr-016', JSON.stringify(validLegacy), meta)
    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return
    const a = result.analysis
    expect(a.creativeId).toBe('cr-016')
    expect(a.hookType).toBe('model-first')
    expect(a.visualStyle).toBe('studio')
    expect(a.ctaType).toBe('none')
    expect(a.intelligence).toBeDefined()
    expect(a.intelligence?.attributes.visual_hook).toBe('model-led')
  })

  test('accepts JSON wrapped in a markdown code fence', () => {
    expect(parseVisionOutput('cr-012', '```json\n' + JSON.stringify(validV2) + '\n```', meta).status).toBe('complete')
  })

  test('fails on text that is not JSON', () => {
    expect(parseVisionOutput('cr-012', 'The image shows a man in a shirt.', meta)).toEqual({
      status: 'failed',
      creativeId: 'cr-012',
      reasons: ['output: response was not valid JSON'],
    })
  })

  test('fails as a whole when fields are missing or off-schema in legacy output', () => {
    const broken = { ...validLegacy, observations: { ...validLegacy.observations, product_prominence: 'huge' }, classification: undefined }
    const result = parseVisionOutput('cr-016', JSON.stringify(broken), meta)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.reasons.some((r) => r.startsWith('observations.product_prominence'))).toBe(true)
      expect(result.reasons.some((r) => r.startsWith('classification'))).toBe(true)
    }
  })

  test('fails as a whole when fields are missing or invalid in v2 output', () => {
    const brokenV2 = {
      ...validV2,
      attributes: {
        ...validV2.attributes,
        visual_hook: 'not-a-valid-hook',
      },
    }
    const result = parseVisionOutput('cr-012', JSON.stringify(brokenV2), meta)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.reasons.some((r) => r.includes('visual_hook'))).toBe(true)
    }
  })

  test('exposes a strict JSON schema for the provider request', () => {
    const schema = visionJsonSchema() as { type: string; required: string[]; additionalProperties: boolean }
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual([
      'schema_version',
      'summary',
      'message_breakdown',
      'attributes',
      'experiment_opportunities',
      'evidence_and_uncertainty',
      'visual_evidence',
    ])
    expect(schema.additionalProperties).toBe(false)
  })
})
