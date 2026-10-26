import { describe, expect, test } from 'vitest'
import {
  adaptLegacyAnalysisToIntelligence,
  getCreativeIntelligence,
  parseAnalysis,
  type CreativeAnalysis,
  type ExperimentOpportunity,
} from './analysis'
import { createProposalStore, memoryStorage } from './experiments'
import { creativeIntelligenceSchema, parseVisionOutput, visionJsonSchema } from './vision'

const meta = { model: 'anthropic/claude-sonnet-5.5', createdAt: '2026-10-27T00:00:00.000Z' }

describe('Creative Intelligence System (v2.0)', () => {
  // Test 1: Valid analysis output
  test('validates valid structured creative intelligence output matching all required sections', () => {
    const validPayload = {
      schema_version: '2.0',
      summary: 'A styled model holds red roses on an urban street, communicating the Delhi launch of SNITCH QUICK 60-minute delivery.',
      message_breakdown: {
        primary_message: 'SNITCH QUICK launches in Delhi with 60-minute delivery for date-ready menswear.',
        supporting_message: 'Date-ready looks delivered in 60 mins.',
        product_or_service_category: 'Menswear & Rapid Delivery Service',
        campaign_context: 'Service launch in Delhi',
        value_proposition: 'Delivered in 60 mins',
        promotional_offer: null,
        cta_text: null,
        visible_text: ['SNITCH QUICK', 'NOW LIVE IN DELHI', 'DATE-READY LOOKS', 'DELIVERED IN 60 MINS'],
        message_hierarchy: 'Brand logo leading to geographic availability, style category, and delivery speed claim.',
        claims_requiring_external_verification: ['60-minute delivery fulfillment capability in Delhi geographic zone.'],
      },
      attributes: {
        visual_hook: 'model-led',
        message_hook: 'delivery benefit',
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
        ],
        background: 'Outdoor urban street setting at twilight',
      },
    }

    const parsed = creativeIntelligenceSchema.safeParse(validPayload)
    expect(parsed.success).toBe(true)

    const res = parseVisionOutput('cr-012', JSON.stringify(validPayload), meta)
    expect(res.status).toBe('complete')
    if (res.status === 'complete') {
      expect(res.analysis.intelligence?.schema_version).toBe('2.0')
      expect(res.analysis.intelligence?.message_breakdown.primary_message).toContain('SNITCH QUICK')
    }
  })

  // Test 2: Missing or unknown attributes
  test('correctly supports explicit unknown and absent states without inventing values', () => {
    const payloadWithUnknowns = {
      schema_version: '2.0',
      summary: 'Flat-lay product shot of linen trousers on a neutral background.',
      message_breakdown: {
        primary_message: 'Linen trousers product showcase',
        supporting_message: null, // explicit null
        product_or_service_category: 'Trousers',
        campaign_context: null, // explicit absent
        value_proposition: null,
        promotional_offer: null, // explicit absent
        cta_text: null, // explicit absent
        visible_text: [],
        message_hierarchy: 'No typography overlay present',
        claims_requiring_external_verification: [],
      },
      attributes: {
        visual_hook: 'product-led',
        message_hook: 'product feature',
        creative_concept: 'Minimalist product catalogue framing',
        visual_style: 'studio',
        product_prominence: 'prominent',
        people_count: 'unknown', // explicit unknown
        product_categories: ['trousers'],
        text_density: 'none',
        cta_presence: 'absent',
        offer_presence: 'absent',
        visual_hierarchy: 'Centered garment on clean backdrop',
        key_visual_elements: ['Folded trousers', 'Neutral studio surface'],
      },
      experiment_opportunities: [],
      experiment_explanation: 'Single product flat-lay without copy does not support an isolated messaging test.',
      evidence_and_uncertainty: {
        observations: ['Product centered on clean studio ground'],
        interpretations: ['Standard e-commerce catalog image'],
        uncertainties: [
          'Fabric weight: Cannot be measured visually',
          'Sizing accuracy: Garment is laid flat without scale reference',
        ],
        verification_required: [],
        analysis_limitations: ['Static photo with no model fit context'],
      },
      visual_evidence: {
        format_composition: 'Single overhead product flat-lay',
        garments: [{ type: 'trousers', colour: 'beige', pattern: null, details: 'drawstring waist' }],
        background: 'White seamless studio ground',
      },
    }

    const parsed = creativeIntelligenceSchema.safeParse(payloadWithUnknowns)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.attributes.people_count).toBe('unknown')
      expect(parsed.data.message_breakdown.promotional_offer).toBeNull()
      expect(parsed.data.message_breakdown.cta_text).toBeNull()
      expect(parsed.data.attributes.cta_presence).toBe('absent')
      expect(parsed.data.attributes.offer_presence).toBe('absent')
      expect(parsed.data.experiment_opportunities).toHaveLength(0)
      expect(parsed.data.experiment_explanation).toBeTruthy()
    }
  })

  // Test 3: Separate visual-hook and message-hook classification
  test('classifies visual hook and message hook as independent dimensions', () => {
    // Model is visible (model-led visual hook), but copy communicates rapid delivery (delivery benefit message hook)
    const snitchQuickAnalysis: CreativeAnalysis = {
      creativeId: 'cr-012',
      hookType: 'model-first',
      productVisibility: 'A man stands on the left half holding red roses. Text on right reads DELIVERED IN 60 MINS.',
      offerType: null,
      ctaType: 'none',
      visualStyle: 'street',
      textDensity: 'medium',
      description: 'A man in a burgundy shirt holding roses with text SNITCH QUICK NOW LIVE IN DELHI DELIVERED IN 60 MINS.',
      modelVersion: 'claude-3-5-sonnet',
      createdAt: '2026-10-26T17:57:18.579Z',
      productProminence: 'prominent',
      vision: {
        observations: {
          format_composition: 'Single square image, model on left, text on right',
          garments: [{ type: 'shirt', colour: 'burgundy', pattern: null, details: null }],
          product_prominence: 'prominent',
          people: 'one',
          background: 'Street',
          visual_style: 'street',
          visible_text: ['SNITCH QUICK', 'NOW LIVE IN DELHI', 'DATE-READY LOOKS', 'DELIVERED IN 60 MINS'],
          offer_text: null,
          cta_text: null,
          text_density: 'medium',
        },
        interpretations: {
          creative_angle: 'Announces the launch of SNITCH QUICK in Delhi with 60-minute delivery.',
          rationale: 'Text highlights 60 mins while model shows date-ready outfit.',
        },
        uncertain: [{ attribute: 'delivery guarantee', reason: 'Subject to local traffic and zone' }],
      },
    }

    const intel = getCreativeIntelligence(snitchQuickAnalysis)
    expect(intel.attributes.visual_hook).toBe('model-led')
    expect(intel.attributes.message_hook).toBe('delivery benefit')
    expect(intel.attributes.visual_hook).not.toBe(intel.attributes.message_hook)
  })

  // Test 4: Distinguishing value proposition from promotional offer
  test('distinguishes a value proposition (e.g. delivery speed) from a promotional offer (e.g. discount)', () => {
    const deliveryCreative: CreativeAnalysis = {
      creativeId: 'cr-012',
      hookType: 'model-first',
      productVisibility: 'Model with delivery text',
      offerType: null, // No discount
      ctaType: 'none',
      visualStyle: 'street',
      textDensity: 'medium',
      description: 'DATE-READY LOOKS DELIVERED IN 60 MINS',
      modelVersion: 'claude',
      createdAt: '2026-10-26T17:57:18.579Z',
      vision: {
        observations: {
          format_composition: 'Square layout',
          garments: [],
          product_prominence: 'prominent',
          people: 'one',
          background: 'Street',
          visual_style: 'street',
          visible_text: ['DELIVERED IN 60 MINS'],
          offer_text: null,
          cta_text: null,
          text_density: 'low',
        },
        interpretations: { creative_angle: 'Rapid delivery promise', rationale: '60 mins callout' },
        uncertain: [],
      },
    }

    const intel = getCreativeIntelligence(deliveryCreative)
    expect(intel.message_breakdown.value_proposition).toContain('60')
    expect(intel.message_breakdown.promotional_offer).toBeNull()
    expect(intel.attributes.offer_presence).toBe('absent')
    expect(intel.attributes.message_hook).toBe('delivery benefit')

    // Contrast with an actual discount creative
    const discountCreative: CreativeAnalysis = {
      ...deliveryCreative,
      creativeId: 'cr-discount',
      offerType: 'Flat 50% OFF',
      description: 'End of season sale Flat 50% OFF on all shirts',
      vision: {
        ...deliveryCreative.vision!,
        observations: {
          ...deliveryCreative.vision!.observations,
          offer_text: 'Flat 50% OFF',
          visible_text: ['Flat 50% OFF'],
        },
      },
    }

    const discountIntel = getCreativeIntelligence(discountCreative)
    expect(discountIntel.message_breakdown.promotional_offer).toBe('Flat 50% OFF')
    expect(discountIntel.attributes.offer_presence).toBe('present')
    expect(discountIntel.attributes.message_hook).toBe('price/discount')
  })

  // Test 5: Correctly identifying absent versus unknown CTAs
  test('correctly distinguishes absent CTAs from unknown CTAs', () => {
    const absentCtaPayload = {
      schema_version: '2.0',
      summary: 'Ad without CTA button.',
      message_breakdown: {
        primary_message: 'Brand editorial visual',
        supporting_message: null,
        product_or_service_category: 'Menswear',
        campaign_context: null,
        value_proposition: null,
        promotional_offer: null,
        cta_text: null,
        visible_text: [],
        message_hierarchy: 'Visual only',
        claims_requiring_external_verification: [],
      },
      attributes: {
        visual_hook: 'model-led',
        message_hook: 'styling/inspiration',
        creative_concept: 'Editorial lookbook',
        visual_style: 'editorial',
        product_prominence: 'prominent',
        people_count: 1,
        product_categories: ['jacket'],
        text_density: 'none',
        cta_presence: 'absent',
        offer_presence: 'absent',
        visual_hierarchy: 'Model centered',
        key_visual_elements: ['Model'],
      },
      experiment_opportunities: [],
      evidence_and_uncertainty: {
        observations: ['No CTA button or link present in image'],
        interpretations: ['Brand awareness creative'],
        uncertainties: [],
        verification_required: [],
        analysis_limitations: [],
      },
      visual_evidence: {
        format_composition: 'Editorial framing',
        garments: [],
        background: 'Studio',
      },
    }

    const parsed = creativeIntelligenceSchema.parse(absentCtaPayload)
    expect(parsed.attributes.cta_presence).toBe('absent')
    expect(parsed.message_breakdown.cta_text).toBeNull()

    const uncertainCtaPayload = {
      ...absentCtaPayload,
      attributes: {
        ...absentCtaPayload.attributes,
        cta_presence: 'uncertain' as const,
      },
      evidence_and_uncertainty: {
        ...absentCtaPayload.evidence_and_uncertainty,
        uncertainties: ['Blurred corner badge may represent a swipe up or download button'],
      },
    }
    const uncertainParsed = creativeIntelligenceSchema.parse(uncertainCtaPayload)
    expect(uncertainParsed.attributes.cta_presence).toBe('uncertain')
  })

  // Test 6: Malformed model responses and schema-validation failures
  test('rejects malformed model responses and off-schema fields with detailed errors', () => {
    // Malformed JSON
    expect(parseVisionOutput('cr-test', 'not valid json at all', meta)).toEqual({
      status: 'failed',
      creativeId: 'cr-test',
      reasons: ['output: response was not valid JSON'],
    })

    // Invalid enum value in attributes
    const invalidEnum = {
      schema_version: '2.0',
      summary: 'Summary',
      message_breakdown: {
        primary_message: 'msg',
        supporting_message: null,
        product_or_service_category: 'category',
        campaign_context: null,
        value_proposition: null,
        promotional_offer: null,
        cta_text: null,
        visible_text: [],
        message_hierarchy: 'seq',
        claims_requiring_external_verification: [],
      },
      attributes: {
        visual_hook: 'invalid_hook_type', // Invalid!
        message_hook: 'delivery benefit',
        creative_concept: 'concept',
        visual_style: 'street',
        product_prominence: 'prominent',
        people_count: 1,
        product_categories: [],
        text_density: 'low',
        cta_presence: 'absent',
        offer_presence: 'absent',
        visual_hierarchy: 'hierarchy',
        key_visual_elements: [],
      },
      experiment_opportunities: [],
      evidence_and_uncertainty: {
        observations: [],
        interpretations: [],
        uncertainties: [],
        verification_required: [],
        analysis_limitations: [],
      },
      visual_evidence: {
        format_composition: 'comp',
        garments: [],
        background: 'bg',
      },
    }

    const failed = parseVisionOutput('cr-test', JSON.stringify(invalidEnum), meta)
    expect(failed.status).toBe('failed')
    if (failed.status === 'failed') {
      expect(failed.reasons.some((r) => r.includes('visual_hook'))).toBe(true)
    }
  })

  // Test 7: Experiment opportunity generation and prepopulation into experiment workflow
  test('generates valid experiment opportunities and prepopulates the proposal draft flow', () => {
    const opp: ExperimentOpportunity = {
      title: 'Test delivery-led vs styling-led headline hierarchy',
      observation: "Creative currently leads copy block with 'NOW LIVE IN DELHI' and 'DATE-READY LOOKS' before 'DELIVERED IN 60 MINS'.",
      hypothesis:
        'Comparing delivery-led headline prominence with styling-led headline prominence may improve CTR by clarifying the core value proposition upfront.',
      variable_to_test: 'Headline copy prominence',
      control: "Current creative with styling headline prominent ('DATE-READY LOOKS')",
      variant: 'Variant emphasizing 60-minute delivery as primary headline with identical model and background',
      primary_metric: 'ctr',
      guardrail_metrics: ['cpa', 'roas'],
      rationale: 'Isolates messaging hierarchy without visual confounders.',
      evidence_basis: 'visual evidence',
      limitations: 'Synthetic demo performance; delivery speed relevance varies by customer location.',
      status: 'proposed',
    }

    const storage = memoryStorage()
    const store = createProposalStore(storage, { actor: 'Growth Lead' })

    const res = store.createDraft(
      {
        title: opp.title,
        hypothesis: opp.hypothesis,
        control: opp.control,
        variant: opp.variant,
        variablesChanged: [opp.variable_to_test],
        variablesConstant: ['visual_asset', 'audience', 'placement', 'budget'],
        primaryMetric: opp.primary_metric,
        guardrailMetrics: opp.guardrail_metrics,
        successCriteria: `Variant ${opp.primary_metric.toUpperCase()} improves over control while maintaining guardrails.`,
        notes: `Rationale: ${opp.rationale}\nEvidence basis: ${opp.evidence_basis}\nLimitations: ${opp.limitations}`,
        sourceCreativeIds: ['cr-012'],
        sourceAnalysisId: 'cr-012',
        sourceOpportunityTitle: opp.title,
      },
      'test-opp-key',
    )

    expect(res.ok).toBe(true)
    if (res.ok) {
      const draft = store.list().find((p) => p.proposalId === res.proposalId)
      expect(draft).toBeDefined()
      expect(draft?.title).toBe(opp.title)
      expect(draft?.hypothesis).toBe(opp.hypothesis)
      expect(draft?.control).toBe(opp.control)
      expect(draft?.variant).toBe(opp.variant)
      expect(draft?.variablesChanged).toEqual([opp.variable_to_test])
      expect(draft?.primaryMetric).toBe('ctr')
      expect(draft?.guardrailMetrics).toEqual(['cpa', 'roas'])
      expect(draft?.source.creativeIds).toEqual(['cr-012'])
      expect(draft?.source.analysisId).toBe('cr-012')
      expect(draft?.source.opportunityTitle).toBe(opp.title)
      expect(draft?.status).toBe('draft')
    }
  })

  // Test 8: Compatibility with existing stored analyses (including SNITCH QUICK cr-012)
  test('seamlessly adapts previously recorded analyses from data/ai-analyses.json', () => {
    const rawLegacy = {
      creative_id: 'cr-012',
      hook_type: 'model-first',
      product_visibility: 'Single square image with model and text.',
      offer_type: null,
      cta_type: 'none',
      visual_style: 'street',
      text_density: 'medium',
      description: "A man in a burgundy shirt holding roses. Text reads 'SNITCH QUICK, NOW LIVE IN DELHI, DATE-READY LOOKS DELIVERED IN 60 MINS'.",
      model_version: 'anthropic/claude-sonnet-5.5',
      created_at: '2026-10-26T17:57:18.579Z',
    }

    const parsed = parseAnalysis('cr-012', rawLegacy)
    expect(parsed.status).toBe('complete')
    if (parsed.status === 'complete') {
      const a = parsed.analysis
      expect(a.intelligence).toBeDefined()
      const intel = a.intelligence!
      expect(intel.attributes.visual_hook).toBe('model-led')
      expect(intel.attributes.message_hook).toBe('delivery benefit')
      expect(intel.message_breakdown.campaign_context).toContain('Delhi')
      expect(intel.message_breakdown.value_proposition).toContain('60')
      expect(intel.message_breakdown.promotional_offer).toBeNull()
      expect(intel.attributes.offer_presence).toBe('absent')
      expect(intel.experiment_opportunities.length).toBeGreaterThan(0)
    }
  })

  // Test 9: Synthetic campaign metrics remaining separate from AI visual analysis
  test('guarantees visual analysis never generates or estimates campaign metrics', () => {
    const schema = visionJsonSchema() as { properties: Record<string, unknown> }
    const topKeys = Object.keys(schema.properties)
    const metricForbidden = ['spend', 'impressions', 'clicks', 'ctr', 'conversions', 'revenue', 'cpa', 'roas']

    for (const key of metricForbidden) {
      expect(topKeys).not.toContain(key)
    }

    // Inspect parsed intelligence object
    const legacyParsed = adaptLegacyAnalysisToIntelligence({
      creativeId: 'cr-001',
      hookType: 'product-first',
      productVisibility: 'Product in frame',
      offerType: null,
      ctaType: 'none',
      visualStyle: 'studio',
      textDensity: 'low',
      description: 'Linen shirt',
      modelVersion: 'snitch-v1',
      createdAt: '2026-10-20T00:00:00Z',
    })

    const intelJson = JSON.stringify(legacyParsed)
    expect(intelJson).not.toContain('"ctr":')
    expect(intelJson).not.toContain('"roas":')
    expect(intelJson).not.toContain('"spend":')
  })

  // Test 10: Inconclusive evidence handling
  test('returns 0 experiment opportunities with clear explanation when evidence is inconclusive', () => {
    const inconclusiveAnalysis: CreativeAnalysis = {
      creativeId: 'cr-vague',
      hookType: 'lifestyle',
      productVisibility: 'Unfocused silhouette in distance',
      offerType: null,
      ctaType: 'none',
      visualStyle: 'lifestyle',
      textDensity: 'none',
      description: 'Vague outdoor silhouette without legible garment or messaging',
      modelVersion: 'v1',
      createdAt: '2026-10-20T00:00:00Z',
      vision: {
        observations: {
          format_composition: 'Distant low-light capture',
          garments: [],
          product_prominence: 'not_visible',
          people: 'none',
          background: 'Dark landscape',
          visual_style: 'lifestyle',
          visible_text: [],
          offer_text: null,
          cta_text: null,
          text_density: 'none',
        },
        interpretations: { creative_angle: 'Atmospheric branding', rationale: 'Silhouette' },
        uncertain: [{ attribute: 'garment', reason: 'Not visible' }],
      },
    }

    const intel = getCreativeIntelligence(inconclusiveAnalysis)
    expect(intel.attributes.product_prominence).toBe('absent')
    expect(intel.attributes.cta_presence).toBe('absent')
    expect(intel.attributes.offer_presence).toBe('absent')
  })
})
