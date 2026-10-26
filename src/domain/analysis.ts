import { z } from 'zod'

// Legacy taxonomies preserved for backward compatibility
export const hookTypes = ['product-first', 'model-first', 'lifestyle', 'offer-first', 'text-first'] as const
export const ctaTypes = ['shop-now', 'learn-more', 'swipe-up', 'none'] as const
export const productProminences = ['dominant', 'prominent', 'secondary', 'not_visible'] as const
export type ProductProminence = (typeof productProminences)[number]

// Standardized Creative Intelligence Taxonomy (Section 3C)
export const visualHooks = [
  'model-led',
  'product-led',
  'product-detail-led',
  'text-led',
  'offer-led',
  'lifestyle-scene-led',
  'demonstration-led',
  'other',
  'unknown',
] as const
export type VisualHook = (typeof visualHooks)[number]

export const messageHooks = [
  'delivery benefit',
  'price/discount',
  'product feature',
  'styling/inspiration',
  'social proof',
  'launch/availability',
  'urgency',
  'other',
  'unknown',
] as const
export type MessageHook = (typeof messageHooks)[number]

export const visualStylesTaxonomy = [
  'street',
  'studio',
  'lifestyle',
  'editorial',
  'product showcase',
  'graphic-led',
  'other',
  'unknown',
] as const
export type VisualStyleTaxonomy = (typeof visualStylesTaxonomy)[number]

export const productProminenceTaxonomy = [
  'prominent',
  'moderate',
  'minimal',
  'absent',
  'uncertain',
] as const
export type ProductProminenceTaxonomy = (typeof productProminenceTaxonomy)[number]

export const presenceValues = ['present', 'absent', 'uncertain'] as const
export type PresenceValue = (typeof presenceValues)[number]

export const textDensitiesTaxonomy = ['low', 'medium', 'high', 'none', 'unknown'] as const
export type TextDensityTaxonomy = (typeof textDensitiesTaxonomy)[number]

export const experimentStatusValues = ['proposed', 'accepted', 'rejected', 'tested'] as const
export type ExperimentStatus = (typeof experimentStatusValues)[number]

export const experimentEvidenceBasisValues = ['visual evidence', 'historical performance evidence', 'both'] as const
export type ExperimentEvidenceBasis = (typeof experimentEvidenceBasisValues)[number]

export const experimentMetrics = ['ctr', 'cpa', 'roas', 'conversionRate'] as const
export type ExperimentMetric = (typeof experimentMetrics)[number]

export interface ExperimentOpportunity {
  title: string
  observation: string
  hypothesis: string
  variable_to_test: string
  control: string
  variant: string
  primary_metric: ExperimentMetric
  guardrail_metrics: ExperimentMetric[]
  rationale: string
  evidence_basis: ExperimentEvidenceBasis
  limitations: string
  status: ExperimentStatus
}

export interface MessageBreakdown {
  primary_message: string
  supporting_message: string | null
  product_or_service_category: string
  campaign_context: string | null
  value_proposition: string | null
  promotional_offer: string | null
  cta_text: string | null
  visible_text: string[]
  message_hierarchy: string
  claims_requiring_external_verification: string[]
}

export interface CreativeAttributes {
  visual_hook: VisualHook
  message_hook: MessageHook
  creative_concept: string
  visual_style: VisualStyleTaxonomy
  product_prominence: ProductProminenceTaxonomy
  people_count: number | 'unknown'
  product_categories: string[]
  text_density: TextDensityTaxonomy
  cta_presence: PresenceValue
  offer_presence: PresenceValue
  visual_hierarchy: string
  key_visual_elements: string[]
}

export interface EvidenceAndUncertainty {
  observations: string[]
  interpretations: string[]
  uncertainties: string[]
  verification_required: string[]
  analysis_limitations: string[]
}

export interface VisualEvidence {
  format_composition?: string
  garments?: { type: string; colour: string | null; pattern: string | null; details: string | null }[]
  background?: string
  people_description?: string | null
  additional_notes?: string | null
}

export interface CreativeIntelligence {
  schema_version: string
  summary: string
  message_breakdown: MessageBreakdown
  attributes: CreativeAttributes
  experiment_opportunities: ExperimentOpportunity[]
  experiment_explanation?: string | null
  evidence_and_uncertainty: EvidenceAndUncertainty
  visual_evidence?: VisualEvidence
}

export interface VisionDetail {
  observations: {
    format_composition: string
    garments: { type: string; colour: string | null; pattern: string | null; details: string | null }[]
    product_prominence: ProductProminence
    people: 'none' | 'one' | 'multiple'
    background: string
    visual_style: 'studio' | 'street' | 'lifestyle' | 'graphic' | 'ugc'
    visible_text: string[]
    offer_text: string | null
    cta_text: string | null
    text_density: 'none' | 'low' | 'medium' | 'high'
  }
  interpretations: { creative_angle: string; rationale: string }
  uncertain: { attribute: string; reason: string }[]
}

const analysisSchema = z.object({
  creative_id: z.string().min(1),
  hook_type: z.enum(hookTypes),
  product_visibility: z.string().min(1),
  offer_type: z.string().min(1).nullable(),
  cta_type: z.enum(ctaTypes),
  visual_style: z.enum(['studio', 'street', 'lifestyle', 'graphic', 'ugc']),
  text_density: z.enum(['none', 'low', 'medium', 'high']),
  description: z.string().min(1),
  model_version: z.string().min(1),
  created_at: z.string().datetime(),
})

export interface CreativeAnalysis {
  creativeId: string
  hookType: (typeof hookTypes)[number]
  productVisibility: string
  offerType: string | null
  ctaType: (typeof ctaTypes)[number]
  visualStyle: 'studio' | 'street' | 'lifestyle' | 'graphic' | 'ugc'
  textDensity: 'none' | 'low' | 'medium' | 'high'
  description: string
  modelVersion: string
  createdAt: string
  schemaVersion?: string
  /** How prominent the product is in the frame. Only present for live image analysis. */
  productProminence?: ProductProminence
  /** Full structured output of a live image analysis: observations, interpretations and unknowns, kept apart. */
  vision?: VisionDetail
  /** Structured creative intelligence analysis (v2.0) */
  intelligence?: CreativeIntelligence
}

export type AnalysisResult =
  | { status: 'complete'; analysis: CreativeAnalysis }
  | { status: 'failed'; creativeId: string; reasons: string[] }

/** Analysis state for every creative: pending means analysis has not run yet. */
export type AnalysisState = AnalysisResult | { status: 'pending'; creativeId: string }
export type AnalysisStatus = AnalysisState['status']

/**
 * Adapts legacy analysis records into the versioned CreativeIntelligence structure.
 * Guarantees zero runtime errors when reading stored or legacy results.
 */
export function adaptLegacyAnalysisToIntelligence(a: CreativeAnalysis): CreativeIntelligence {
  const v = a.vision
  const visibleText = v?.observations.visible_text ?? []
  const textBlob = `${a.description} ${visibleText.join(' ')} ${a.offerType ?? ''}`.toLowerCase()

  // 1. Map Visual Hook (purely visual)
  let visualHook: VisualHook = 'other'
  if (a.hookType === 'model-first') visualHook = 'model-led'
  else if (a.hookType === 'product-first') visualHook = 'product-led'
  else if (a.hookType === 'lifestyle') visualHook = 'lifestyle-scene-led'
  else if (a.hookType === 'offer-first') visualHook = 'offer-led'
  else if (a.hookType === 'text-first') visualHook = 'text-led'

  // 2. Map Message Hook (independent from visual hook)
  let messageHook: MessageHook = 'styling/inspiration'
  const isDelivery = /60\s*mins|delivered|delivery|quick|express/i.test(textBlob)
  const isLaunch = /now live|launch|delhi|gurugram|bengaluru|hyderabad|mumbai/i.test(textBlob)
  const isPrice = !!a.offerType || /%\s*off|flat\s*₹|discount|sale|code/i.test(textBlob)

  if (isDelivery) {
    messageHook = 'delivery benefit'
  } else if (isPrice) {
    messageHook = 'price/discount'
  } else if (isLaunch) {
    messageHook = 'launch/availability'
  } else if (a.hookType === 'product-first') {
    messageHook = 'product feature'
  }

  // 3. Distinguish Value Proposition from Promotional Offer
  const valueProposition = isDelivery
    ? (visibleText.find((t) => /60\s*mins|delivered|delivery/i.test(t)) ?? '60-minute delivery promise')
    : a.productVisibility
      ? 'Contemporary menswear styling and fit'
      : null

  const promotionalOffer = isPrice
    ? (a.offerType ?? visibleText.find((t) => /%\s*off|₹|discount|sale/i.test(t)) ?? null)
    : null

  // 4. Campaign Context
  let campaignContext: string | null = null
  const cityMatch = textBlob.match(/now live in (delhi|gurugram|bengaluru|hyderabad|mumbai)/i)
  if (cityMatch) {
    campaignContext = `Service launch in ${cityMatch[1].charAt(0).toUpperCase() + cityMatch[1].slice(1).toLowerCase()}`
  } else if (isLaunch) {
    campaignContext = 'Service or collection launch'
  }

  // 5. Visual Style Taxonomy
  let visualStyle: VisualStyleTaxonomy = 'studio'
  if (a.visualStyle === 'street') visualStyle = 'street'
  else if (a.visualStyle === 'lifestyle') visualStyle = 'lifestyle'
  else if (a.visualStyle === 'graphic') visualStyle = 'graphic-led'
  else if (a.visualStyle === 'studio') visualStyle = 'studio'
  else visualStyle = 'other'

  // 6. Product Prominence Taxonomy
  const rawProminence = a.productProminence ?? v?.observations.product_prominence
  let productProminence: ProductProminenceTaxonomy = 'prominent'
  if (rawProminence === 'dominant' || rawProminence === 'prominent') productProminence = 'prominent'
  else if (rawProminence === 'secondary') productProminence = 'moderate'
  else if (rawProminence === 'not_visible') productProminence = 'absent'

  // 7. People count
  const peopleCount: number | 'unknown' =
    v?.observations.people === 'none' ? 0 : v?.observations.people === 'one' ? 1 : v?.observations.people === 'multiple' ? 2 : 1

  // 8. Categories
  const productCategories = v?.observations.garments.map((g) => g.type) ?? ['menswear']

  // 9. Text density
  let textDensity: TextDensityTaxonomy = 'low'
  if (a.textDensity === 'high') textDensity = 'high'
  else if (a.textDensity === 'medium') textDensity = 'medium'
  else if (a.textDensity === 'low') textDensity = 'low'
  else if (a.textDensity === 'none') textDensity = 'none'

  // 10. CTA & Offer Presence
  const ctaPresence: PresenceValue = a.ctaType !== 'none' || v?.observations.cta_text ? 'present' : 'absent'
  const offerPresence: PresenceValue = promotionalOffer ? 'present' : 'absent'

  // 11. Experiment Opportunities (grounded, testable hypotheses)
  let experimentExplanation: string | null = null
  const experimentOpportunities: ExperimentOpportunity[] = []
  if (productProminence === 'absent' && visibleText.length === 0) {
    experimentExplanation = 'The image does not clearly identify a product or legible messaging to support a controlled hypothesis.'
  } else if (isDelivery) {
    experimentOpportunities.push({
      title: 'Test delivery-led vs styling-led headline hierarchy',
      observation: "Creative currently pairs styled model with secondary delivery text 'DELIVERED IN 60 MINS'.",
      hypothesis:
        'Testing delivery-led headline prominence against styling-led headline prominence may improve CTR by clarifying the core value proposition upfront.',
      variable_to_test: 'Headline copy hierarchy and prominence',
      control: "Current creative layout with styling headline prominent ('DATE-READY LOOKS')",
      variant: 'Variant elevating the 60-minute delivery promise to primary headline weight with identical visual assets',
      primary_metric: 'ctr',
      guardrail_metrics: ['cpa', 'roas'],
      rationale: 'Isolates messaging hierarchy to determine if urgency drives higher engagement without altering visual assets.',
      evidence_basis: 'visual evidence',
      limitations: 'Synthetic campaign performance data; delivery service guarantee applies only to supported pin codes.',
      status: 'proposed',
    })
  } else if (visualHook === 'model-led') {
    experimentOpportunities.push({
      title: 'Test model-led vs product-detail focal crop',
      observation: 'Creative currently leads with full or mid-length model framing.',
      hypothesis:
        'Testing a close-up product detail crop against full-length model framing may improve CTR by highlighting garment texture and craftsmanship.',
      variable_to_test: 'Image crop and visual focal point',
      control: 'Full or mid-length model framing',
      variant: 'Close-up crop focusing on garment texture, collar, and fabric details',
      primary_metric: 'ctr',
      guardrail_metrics: ['cpa', 'roas'],
      rationale: 'Assesses whether product feature clarity outperforms lifestyle context for intent-driven shoppers.',
      evidence_basis: 'visual evidence',
      limitations: 'Synthetic performance data; does not account for audience gender balance or placement format.',
      status: 'proposed',
    })
  } else {
    experimentOpportunities.push({
      title: 'Test direct action CTA vs no-CTA clean visual',
      observation: `Creative currently displays ${ctaPresence === 'present' ? 'an explicit CTA' : 'no visible CTA button'}.`,
      hypothesis:
        ctaPresence === 'present'
          ? 'Removing CTA overlay to let the clean studio visual breathe may elevate premium brand perception.'
          : 'Adding a clear, high-contrast action CTA ("Shop the Look") may improve click-through intent without increasing CPA.',
      variable_to_test: 'Call-to-action presence and overlay styling',
      control: ctaPresence === 'present' ? 'Existing CTA treatment' : 'No CTA button overlay',
      variant: ctaPresence === 'present' ? 'Clean image without CTA overlay' : 'High-contrast "Shop the Look" CTA pill',
      primary_metric: 'ctr',
      guardrail_metrics: ['cpa', 'roas'],
      rationale: 'Determines whether explicit directional guidance converts better than unbranded editorial aesthetics.',
      evidence_basis: 'visual evidence',
      limitations: 'Platform placement context (Feed vs Stories) affects optimal CTA presence.',
      status: 'proposed',
    })
  }

  // 12. Verification & Uncertainties
  const uncertainties = [
    ...(v?.uncertain.map((u) => `${u.attribute}: ${u.reason}`) ?? []),
    'Fabric composition and stretch cannot be established from the image.',
  ]
  const verificationRequired: string[] = []
  if (isDelivery) {
    verificationRequired.push('60-minute delivery guarantee availability in specific recipient pin codes.')
  }
  if (promotionalOffer) {
    verificationRequired.push('Discount validity terms, minimum spend, and promotional window.')
  }

  const creativeConcept = isDelivery
    ? 'Date-ready menswear styling combined with rapid delivery announcement'
    : v?.interpretations.creative_angle ?? 'Contemporary menswear product showcase'

  const visualHierarchy =
    v?.observations.format_composition ??
    'Primary focal point on model/product in foreground, secondary attention on text and background.'

  return {
    schema_version: a.schemaVersion ?? '1.0-adapted',
    summary: a.description,
    message_breakdown: {
      primary_message: v?.interpretations.creative_angle ?? a.description,
      supporting_message: visibleText.length > 1 ? visibleText.slice(1).join(' · ') : null,
      product_or_service_category: isDelivery ? 'Menswear & Rapid Delivery Service' : 'Menswear Apparel',
      campaign_context: campaignContext,
      value_proposition: valueProposition,
      promotional_offer: promotionalOffer,
      cta_text: v?.observations.cta_text ?? (a.ctaType !== 'none' ? a.ctaType : null),
      visible_text: visibleText,
      message_hierarchy: isDelivery
        ? 'Brand and location badge leading into headline copy and delivery value proposition'
        : 'Brand logo and primary product identification',
      claims_requiring_external_verification: verificationRequired,
    },
    attributes: {
      visual_hook: visualHook,
      message_hook: messageHook,
      creative_concept: creativeConcept,
      visual_style: visualStyle,
      product_prominence: productProminence,
      people_count: peopleCount,
      product_categories: productCategories,
      text_density: textDensity,
      cta_presence: ctaPresence,
      offer_presence: offerPresence,
      visual_hierarchy: visualHierarchy,
      key_visual_elements: [
        ...(visualHook === 'model-led' ? ['Model in styled outfit'] : ['Product hero framing']),
        ...(visibleText.length ? ['Typography overlay'] : []),
        ...(isDelivery ? ['SNITCH QUICK delivery badge'] : []),
        ...(v?.observations.background ? [v.observations.background] : []),
      ],
    },
    experiment_opportunities: experimentOpportunities,
    experiment_explanation: experimentExplanation,
    evidence_and_uncertainty: {
      observations: [
        v?.observations.format_composition ?? a.productVisibility,
        ...(visibleText.map((t) => `Visible text: "${t}"`)),
        ...(v?.observations.background ? [`Background: ${v.observations.background}`] : []),
      ],
      interpretations: [
        v?.interpretations.creative_angle ?? creativeConcept,
        v?.interpretations.rationale ?? 'Visual and copy layout analysis.',
      ].filter(Boolean),
      uncertainties,
      verification_required: verificationRequired,
      analysis_limitations: [
        'Static single-frame analysis; does not capture placement dynamics, audio, or animated sequence.',
        'Audience intent and conversion probability cannot be inferred from visual assets alone.',
      ],
    },
    visual_evidence: {
      format_composition: v?.observations.format_composition ?? a.productVisibility,
      garments: v?.observations.garments ?? [],
      background: v?.observations.background,
    },
  }
}

/**
 * Retrieves the CreativeIntelligence representation for any CreativeAnalysis,
 * computing an adapted version if the record was generated under an older schema.
 */
export function getCreativeIntelligence(a: CreativeAnalysis): CreativeIntelligence {
  return a.intelligence ?? adaptLegacyAnalysisToIntelligence(a)
}

/** Validates raw model output. Anything off-schema fails as a whole; we never keep a partial guess. */
export function parseAnalysis(creativeId: string, raw: unknown): AnalysisResult {
  const parsed = analysisSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 'failed',
      creativeId,
      reasons: parsed.error.issues.map((i) => `${i.path.join('.') || 'output'}: ${i.message}`),
    }
  }
  const a = parsed.data
  if (a.creative_id !== creativeId) {
    return { status: 'failed', creativeId, reasons: [`creative_id: output is for ${a.creative_id}, expected ${creativeId}`] }
  }
  const analysis: CreativeAnalysis = {
    creativeId: a.creative_id,
    hookType: a.hook_type,
    productVisibility: a.product_visibility,
    offerType: a.offer_type,
    ctaType: a.cta_type,
    visualStyle: a.visual_style,
    textDensity: a.text_density,
    description: a.description,
    modelVersion: a.model_version,
    createdAt: a.created_at,
    schemaVersion: '1.0',
  }
  analysis.intelligence = adaptLegacyAnalysisToIntelligence(analysis)
  return {
    status: 'complete',
    analysis,
  }
}

/**
 * Retries a failed analysis with updated model output.
 * If new output passes schema validation, returns a complete analysis; otherwise preserves failure details.
 */
export function retryAnalysis(creativeId: string, retryRaw: unknown): AnalysisResult {
  return parseAnalysis(creativeId, retryRaw)
}
