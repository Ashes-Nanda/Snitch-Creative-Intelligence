import { z } from 'zod'
import { ctaTypes, hookTypes, productProminences, type AnalysisResult } from './analysis'

const nullableText = z.string().min(1).nullable()

/**
 * What a vision model must return for one creative image. Observations describe only what is visible;
 * interpretations are labelled as such; anything that can't be established goes in `uncertain`.
 */
const visionSchema = z
  .object({
    observations: z
      .object({
        format_composition: z.string().min(1).describe('Layout and composition as seen, e.g. single image, collage, text panel'),
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
          .describe('Garments that are clearly visible. Empty if none.'),
        product_prominence: z.enum(productProminences),
        people: z.enum(['none', 'one', 'multiple']),
        background: z.string().min(1),
        visual_style: z.enum(['studio', 'street', 'lifestyle', 'graphic', 'ugc']),
        visible_text: z.array(z.string()).describe('Text legible in the image, verbatim and short. Empty if none.'),
        offer_text: nullableText.describe('Offer or discount wording visible in the image, or null'),
        cta_text: nullableText.describe('Call-to-action wording visible in the image, or null'),
        text_density: z.enum(['none', 'low', 'medium', 'high']),
      })
      .strict(),
    classification: z
      .object({
        hook_type: z.enum(hookTypes).describe('What the image leads with'),
        cta_type: z.enum(ctaTypes),
      })
      .strict(),
    interpretations: z
      .object({
        creative_angle: z.string().min(1).describe('The likely message or angle. An interpretation, not an observation.'),
        rationale: z.string().min(1).describe('Which visible details the interpretation rests on'),
      })
      .strict(),
    uncertain: z
      .array(z.object({ attribute: z.string().min(1), reason: z.string().min(1) }).strict())
      .describe('Attributes that cannot be established from the image, with the reason'),
    summary: z.string().min(1).describe('One or two sentences describing only what is visible'),
  })
  .strict()

/** JSON Schema for the provider's structured-output request, generated from the same definition used to validate. */
export function visionJsonSchema(): object {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(visionSchema) as Record<string, unknown>
  return schema
}

function extractJson(text: string): unknown {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return JSON.parse(fenced ? fenced[1] : text)
}

/** Validates a model's raw text response. Anything malformed or off-schema fails as a whole. */
export function parseVisionOutput(creativeId: string, text: string, meta: { model: string; createdAt: string }): AnalysisResult {
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch {
    return { status: 'failed', creativeId, reasons: ['output: response was not valid JSON'] }
  }
  const parsed = visionSchema.safeParse(raw)
  if (!parsed.success) {
    return { status: 'failed', creativeId, reasons: parsed.error.issues.map((i) => `${i.path.join('.') || 'output'}: ${i.message}`) }
  }
  const v = parsed.data
  const o = v.observations
  return {
    status: 'complete',
    analysis: {
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
      vision: { observations: o, interpretations: v.interpretations, uncertain: v.uncertain },
    },
  }
}
