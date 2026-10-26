import { z } from 'zod'

export const hookTypes = ['product-first', 'model-first', 'lifestyle', 'offer-first', 'text-first'] as const
export const ctaTypes = ['shop-now', 'learn-more', 'swipe-up', 'none'] as const

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
  visualStyle: z.infer<typeof analysisSchema>['visual_style']
  textDensity: z.infer<typeof analysisSchema>['text_density']
  description: string
  modelVersion: string
  createdAt: string
  /** How prominent the product is in the frame. Only present for live image analysis. */
  productProminence?: ProductProminence
  /** Full structured output of a live image analysis: observations, interpretations and unknowns, kept apart. */
  vision?: VisionDetail
}

export const productProminences = ['dominant', 'prominent', 'secondary', 'not_visible'] as const
export type ProductProminence = (typeof productProminences)[number]

export interface VisionDetail {
  observations: {
    format_composition: string
    garments: { type: string; colour: string | null; pattern: string | null; details: string | null }[]
    product_prominence: ProductProminence
    people: 'none' | 'one' | 'multiple'
    background: string
    visual_style: CreativeAnalysis['visualStyle']
    visible_text: string[]
    offer_text: string | null
    cta_text: string | null
    text_density: CreativeAnalysis['textDensity']
  }
  interpretations: { creative_angle: string; rationale: string }
  uncertain: { attribute: string; reason: string }[]
}

export type AnalysisResult =
  | { status: 'complete'; analysis: CreativeAnalysis }
  | { status: 'failed'; creativeId: string; reasons: string[] }

/** Analysis state for every creative: pending means analysis has not run yet. */
export type AnalysisState = AnalysisResult | { status: 'pending'; creativeId: string }
export type AnalysisStatus = AnalysisState['status']

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
  return {
    status: 'complete',
    analysis: {
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
    },
  }
}

/**
 * Retries a failed analysis with updated model output.
 * If new output passes schema validation, returns a complete analysis; otherwise preserves failure details.
 */
export function retryAnalysis(creativeId: string, retryRaw: unknown): AnalysisResult {
  return parseAnalysis(creativeId, retryRaw)
}

