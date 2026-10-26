import { z } from 'zod'
import {
  adaptLegacyAnalysisToIntelligence,
  ctaTypes,
  experimentEvidenceBasisValues,
  experimentMetrics,
  experimentStatusValues,
  hookTypes,
  messageHooks,
  presenceValues,
  productProminences,
  productProminenceTaxonomy,
  textDensitiesTaxonomy,
  visualHooks,
  visualStylesTaxonomy,
  type AnalysisResult,
  type CreativeAnalysis,
  type CreativeIntelligence,
  type PresenceValue,
  type ProductProminence,
  type ProductProminenceTaxonomy,
  type TextDensityTaxonomy,
  type VisualHook,
  type VisualStyleTaxonomy,
} from './analysis'

const nullableText = z.string().min(1).nullable()

/**
 * Versioned Creative Intelligence Schema (v2.0)
 * Reorganizes analysis around:
 * 1. What is this creative communicating? (summary & message_breakdown)
 * 2. What standardized attributes describe it? (attributes taxonomy)
 * 3. What creative variables could be tested? (experiment_opportunities)
 * 4. What evidence supports/contradicts a hypothesis? (evidence_and_uncertainty)
 * 5. What remains unknown? (uncertainties & verification_required)
 */
export const creativeIntelligenceSchema = z
  .object({
    schema_version: z.string().min(1).default('2.0'),
    summary: z
      .string()
      .min(1)
      .describe(
        'Concise factual summary of the creative in 1-2 sentences. Describe product/service, main message, visible value proposition, and campaign context. Distinguish what the image literally shows from what copy communicates.',
      ),
    message_breakdown: z
      .object({
        primary_message: z.string().min(1).describe('Primary message communicated by the creative'),
        supporting_message: nullableText.describe('Supporting or secondary message, or null if absent'),
        product_or_service_category: z.string().min(1).describe('Identified product or service category'),
        campaign_context: nullableText.describe('Campaign or launch context (e.g., service launch in Delhi), or null if absent'),
        value_proposition: nullableText.describe('Visible value proposition (e.g., 60-minute delivery promise, date-ready styling), or null if absent'),
        promotional_offer: nullableText.describe(
          'Explicit promotional discount/sale wording (e.g. 50% off, flat ₹500 off), or null if absent. Note: Delivery speed is a value proposition, not a promotional offer.',
        ),
        cta_text: nullableText.describe('Call-to-action text visible in the creative, or null if absent'),
        visible_text: z.array(z.string()).describe('All legible text in the image verbatim. Empty if none.'),
        message_hierarchy: z.string().min(1).describe('Concise description of the messaging hierarchy and reading sequence'),
        claims_requiring_external_verification: z
          .array(z.string())
          .describe('Factual claims requiring external verification (e.g. delivery turnaround, geographic availability, discounts). Empty if none.'),
      })
      .strict(),
    attributes: z
      .object({
        visual_hook: z.enum(visualHooks).describe('Primary visual anchor leading the frame'),
        message_hook: z.enum(messageHooks).describe('Primary message hook theme (classified independently from visual hook)'),
        creative_concept: z.string().min(1).describe('Concise description of the central concept'),
        visual_style: z.enum(visualStylesTaxonomy).describe('Visual production style'),
        product_prominence: z.enum(productProminenceTaxonomy).describe('Prominence of the product in the frame'),
        people_count: z.union([z.number().int().nonnegative(), z.literal('unknown')]).describe('Count of identifiable people, or "unknown"'),
        product_categories: z.array(z.string()).describe('Identified product categories visually supported'),
        text_density: z.enum(textDensitiesTaxonomy).describe('Density of text across the creative'),
        cta_presence: z.enum(presenceValues).describe('Whether a call to action is present, absent, or uncertain'),
        offer_presence: z.enum(presenceValues).describe('Whether a promotional discount/offer is present, absent, or uncertain'),
        visual_hierarchy: z.string().min(1).describe('Concise description of the main focal point and eye movement path'),
        key_visual_elements: z.array(z.string()).describe('Key visible elements relevant to creative comparison'),
      })
      .strict(),
    experiment_opportunities: z
      .array(
        z
          .object({
            title: z.string().min(1).describe('Concise experiment title'),
            observation: z.string().min(1).describe('What is actually visible or supported by existing evidence'),
            hypothesis: z.string().min(1).describe('Testable hypothesis: what change might improve an outcome and why'),
            variable_to_test: z.string().min(1).describe('Specific creative element to change (single variable)'),
            control: z.string().min(1).describe('Current treatment or baseline description'),
            variant: z.string().min(1).describe('Proposed alternative treatment description'),
            primary_metric: z.enum(experimentMetrics).describe('Suggested primary measurable outcome'),
            guardrail_metrics: z.array(z.enum(experimentMetrics)).describe('Metrics to protect against regressions'),
            rationale: z.string().min(1).describe('Why this test is worth running'),
            evidence_basis: z.enum(experimentEvidenceBasisValues).describe('Evidence basis: visual evidence, historical performance evidence, or both'),
            limitations: z.string().min(1).describe('Confounders, unobserved variables, or external dependencies'),
            status: z.enum(experimentStatusValues).default('proposed'),
          })
          .strict(),
      )
      .max(3)
      .describe('0 to 3 actionable controlled test opportunities. Do not generate filler if evidence is insufficient.'),
    experiment_explanation: nullableText.optional().describe('Explanation if 0 experiment opportunities are proposed'),
    evidence_and_uncertainty: z
      .object({
        observations: z.array(z.string()).describe('Directly visible elements or verbatim text'),
        interpretations: z.array(z.string()).describe('Cautious interpretations grounded in observations'),
        uncertainties: z.array(z.string()).describe('Important attributes the image cannot establish (e.g. fabric, exact colour, video context)'),
        verification_required: z.array(z.string()).describe('Claims requiring external data verification'),
        analysis_limitations: z.array(z.string()).describe('Limitations of static image analysis or input quality'),
      })
      .strict(),
    visual_evidence: z
      .object({
        format_composition: z.string().min(1).describe('Layout, aspect ratio, framing, and composition'),
        garments: z
          .array(
            z
              .object({
                type: z.string().min(1),
                colour: nullableText,
                pattern: nullableText,
                details: nullableText,
              })
              .strict(),
          )
          .describe('Garments that are clearly visible'),
        background: z.string().min(1).describe('Background setting or backdrop'),
        people_description: nullableText.optional(),
      })
      .strict(),
  })
  .strict()

/**
 * Legacy schema (v1.0) preserved for backward compatibility with recorded fixtures and older tests.
 */
export const legacyVisionSchema = z
  .object({
    observations: z
      .object({
        format_composition: z.string().min(1),
        garments: z.array(
          z
            .object({
              type: z.string().min(1),
              colour: nullableText,
              pattern: nullableText,
              details: nullableText,
            })
            .strict(),
        ),
        product_prominence: z.enum(productProminences),
        people: z.enum(['none', 'one', 'multiple']),
        background: z.string().min(1),
        visual_style: z.enum(['studio', 'street', 'lifestyle', 'graphic', 'ugc']),
        visible_text: z.array(z.string()),
        offer_text: nullableText,
        cta_text: nullableText,
        text_density: z.enum(['none', 'low', 'medium', 'high']),
      })
      .strict(),
    classification: z
      .object({
        hook_type: z.enum(hookTypes),
        cta_type: z.enum(ctaTypes),
      })
      .strict(),
    interpretations: z
      .object({
        creative_angle: z.string().min(1),
        rationale: z.string().min(1),
      })
      .strict(),
    uncertain: z.array(z.object({ attribute: z.string().min(1), reason: z.string().min(1) }).strict()),
    summary: z.string().min(1),
  })
  .strict()

/** JSON Schema for OpenRouter's structured-output request. */
export function visionJsonSchema(): object {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(creativeIntelligenceSchema) as Record<string, unknown>
  return schema
}

function extractJson(text: string): unknown {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return JSON.parse(fenced ? fenced[1] : text)
}

function mapVisualHookToLegacy(vh: VisualHook): (typeof hookTypes)[number] {
  if (vh === 'model-led') return 'model-first'
  if (vh === 'product-led' || vh === 'product-detail-led') return 'product-first'
  if (vh === 'lifestyle-scene-led') return 'lifestyle'
  if (vh === 'offer-led') return 'offer-first'
  if (vh === 'text-led') return 'text-first'
  return 'product-first'
}

function mapVisualStyleToLegacy(vs: VisualStyleTaxonomy): CreativeAnalysis['visualStyle'] {
  if (vs === 'street') return 'street'
  if (vs === 'lifestyle') return 'lifestyle'
  if (vs === 'graphic-led') return 'graphic'
  return 'studio'
}

function mapProminenceToLegacy(p: ProductProminenceTaxonomy): ProductProminence {
  if (p === 'prominent') return 'prominent'
  if (p === 'absent') return 'not_visible'
  return 'secondary'
}

function mapTextDensityToLegacy(td: TextDensityTaxonomy): CreativeAnalysis['textDensity'] {
  if (td === 'none') return 'none'
  if (td === 'high') return 'high'
  if (td === 'medium') return 'medium'
  return 'low'
}

function mapCtaToLegacy(ctaText: string | null, presence: PresenceValue): (typeof ctaTypes)[number] {
  if (presence === 'absent' || !ctaText) return 'none'
  const lower = ctaText.toLowerCase()
  if (lower.includes('shop') || lower.includes('buy')) return 'shop-now'
  if (lower.includes('learn') || lower.includes('discover')) return 'learn-more'
  if (lower.includes('swipe')) return 'swipe-up'
  return 'none'
}

/**
 * Validates a model's raw text response against the Creative Intelligence schema.
 * Supports transparent fallback parsing for legacy fixture data.
 */
export function parseVisionOutput(creativeId: string, text: string, meta: { model: string; createdAt: string }): AnalysisResult {
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch {
    return { status: 'failed', creativeId, reasons: ['output: response was not valid JSON'] }
  }

  // Detect if the raw payload was formatted according to the legacy v1 schema
  const isLegacyShape =
    !!raw && typeof raw === 'object' && ('classification' in raw || ('observations' in raw && !('message_breakdown' in raw)))

  if (isLegacyShape) {
    const legacyResult = legacyVisionSchema.safeParse(raw)
    if (legacyResult.success) {
      const v = legacyResult.data
      const o = v.observations
      const legacyAnalysis: CreativeAnalysis = {
        creativeId,
        hookType: v.classification.hook_type,
        productVisibility: `Product prominence: ${o.product_prominence.replace('_', ' ')}. ${o.format_composition}`,
        offerType: o.offer_text,
        ctaType: v.classification.cta_type,
        visualStyle: o.visual_style,
        textDensity: o.text_density,
        description: v.summary,
        modelVersion: meta.model,
        createdAt: meta.createdAt,
        productProminence: o.product_prominence,
        schemaVersion: '1.0-adapted',
        vision: { observations: o, interpretations: v.interpretations, uncertain: v.uncertain },
      }
      legacyAnalysis.intelligence = adaptLegacyAnalysisToIntelligence(legacyAnalysis)
      return {
        status: 'complete',
        analysis: legacyAnalysis,
      }
    }
    return {
      status: 'failed',
      creativeId,
      reasons: legacyResult.error.issues.map((i) => `${i.path.join('.') || 'output'}: ${i.message}`),
    }
  }

  // Attempt to parse against the full Creative Intelligence v2 schema
  const v2Result = creativeIntelligenceSchema.safeParse(raw)
  if (v2Result.success) {
    const ci = v2Result.data
    const mb = ci.message_breakdown
    const attr = ci.attributes
    const ve = ci.visual_evidence
    const legacyHook = mapVisualHookToLegacy(attr.visual_hook)
    const legacyStyle = mapVisualStyleToLegacy(attr.visual_style)
    const legacyProminence = mapProminenceToLegacy(attr.product_prominence)
    const legacyDensity = mapTextDensityToLegacy(attr.text_density)
    const legacyCta = mapCtaToLegacy(mb.cta_text, attr.cta_presence)

    const analysis: CreativeAnalysis = {
      creativeId,
      hookType: legacyHook,
      productVisibility: `Product prominence: ${attr.product_prominence}. ${ve.format_composition}`,
      offerType: mb.promotional_offer,
      ctaType: legacyCta,
      visualStyle: legacyStyle,
      textDensity: legacyDensity,
      description: ci.summary,
      modelVersion: meta.model,
      createdAt: meta.createdAt,
      productProminence: legacyProminence,
      schemaVersion: ci.schema_version,
      intelligence: ci as CreativeIntelligence,
      vision: {
        observations: {
          format_composition: ve.format_composition,
          garments: ve.garments,
          product_prominence: legacyProminence,
          people: attr.people_count === 0 ? 'none' : attr.people_count === 1 ? 'one' : 'multiple',
          background: ve.background,
          visual_style: legacyStyle,
          visible_text: mb.visible_text,
          offer_text: mb.promotional_offer,
          cta_text: mb.cta_text,
          text_density: legacyDensity,
        },
        interpretations: {
          creative_angle: ci.evidence_and_uncertainty.interpretations[0] ?? attr.creative_concept,
          rationale: ci.evidence_and_uncertainty.interpretations[1] ?? attr.visual_hierarchy,
        },
        uncertain: ci.evidence_and_uncertainty.uncertainties.map((u) => {
          const colonIdx = u.indexOf(':')
          if (colonIdx !== -1) {
            return { attribute: u.slice(0, colonIdx).trim(), reason: u.slice(colonIdx + 1).trim() }
          }
          return { attribute: 'uncertain_attribute', reason: u }
        }),
      },
    }

    return { status: 'complete', analysis }
  }

  // Failed v2 validation: return clear validation reasons
  return {
    status: 'failed',
    creativeId,
    reasons: v2Result.error.issues.map((i) => `${i.path.join('.') || 'output'}: ${i.message}`),
  }
}
