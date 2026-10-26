import type { CreativeAnalysis } from './analysis'
import type { AssetType } from './ingest'

/** Fewer analysed creatives than this of a kind and the counts are too small to describe. */
export const MIN_OBSERVED = 5
/** Ads and product images must differ by at least this share (in proportion points) to suggest a test. */
export const MIN_SHARE_GAP = 0.4

type Kind = 'ads' | 'productImages'
export type ObservedAttribute = 'prominence' | 'visualStyle' | 'hookType' | 'offer'

const valueOf: Record<ObservedAttribute, (a: CreativeAnalysis) => string | undefined> = {
  prominence: (a) => a.productProminence,
  visualStyle: (a) => a.visualStyle,
  hookType: (a) => a.hookType,
  offer: (a) => (a.offerType ? 'visible offer' : 'no visible offer'),
}

const attributeLabel: Record<ObservedAttribute, string> = {
  prominence: 'product prominence',
  visualStyle: 'visual style',
  hookType: 'opening hook',
  offer: 'offer wording',
}

export interface ValueCount {
  value: string
  count: number
  creativeIds: string[]
}

export type KindSummary =
  | { status: 'insufficient_evidence'; analysed: number; needed: number }
  | { status: 'ok'; analysed: number; distributions: Record<ObservedAttribute, ValueCount[]> }

export interface ObservedHypothesis {
  attribute: ObservedAttribute
  value: string
  ads: { count: number; total: number }
  productImages: { count: number; total: number }
  supportingCreativeIds: string[]
  statement: string
  nextStep: string
  limitation: string
}

const kindOf = (t: AssetType | undefined): Kind => (t === 'product_image' ? 'productImages' : 'ads')

function summarise(ids: string[], analyses: Map<string, CreativeAnalysis>): KindSummary {
  if (ids.length < MIN_OBSERVED) return { status: 'insufficient_evidence', analysed: ids.length, needed: MIN_OBSERVED }
  const distributions = {} as Record<ObservedAttribute, ValueCount[]>
  for (const attribute of Object.keys(valueOf) as ObservedAttribute[]) {
    const counts = new Map<string, string[]>()
    for (const id of ids) {
      const v = valueOf[attribute](analyses.get(id)!)
      if (v === undefined) continue
      counts.set(v, [...(counts.get(v) ?? []), id])
    }
    distributions[attribute] = [...counts]
      .map(([value, creativeIds]) => ({ value, count: creativeIds.length, creativeIds }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }
  return { status: 'ok', analysed: ids.length, distributions }
}

/**
 * Describes how analysed public creatives look, by kind (ads vs product images), and suggests tests where the
 * two kinds differ markedly. Purely observational: no performance data is used or implied.
 */
export function observedPatterns(
  creatives: { creativeId: string; assetType?: AssetType }[],
  analyses: Map<string, CreativeAnalysis>,
): { kinds: Record<Kind, KindSummary>; hypotheses: ObservedHypothesis[] } {
  const ids: Record<Kind, string[]> = { ads: [], productImages: [] }
  for (const c of creatives) if (analyses.has(c.creativeId)) ids[kindOf(c.assetType)].push(c.creativeId)
  const kinds = { ads: summarise(ids.ads, analyses), productImages: summarise(ids.productImages, analyses) }

  const hypotheses: ObservedHypothesis[] = []
  if (kinds.ads.status === 'ok' && kinds.productImages.status === 'ok') {
    const [ads, products] = [kinds.ads, kinds.productImages]
    for (const attribute of Object.keys(valueOf) as ObservedAttribute[]) {
      const values = [...new Set([...ads.distributions[attribute], ...products.distributions[attribute]].map((v) => v.value))].sort()
      const share = (s: typeof ads, v: string) => (s.distributions[attribute].find((x) => x.value === v)?.count ?? 0) / s.analysed
      let best: { value: string; gap: number } | null = null
      for (const v of values) {
        const gap = Math.abs(share(ads, v) - share(products, v))
        if (gap >= MIN_SHARE_GAP && (!best || gap > best.gap)) best = { value: v, gap }
      }
      if (!best) continue
      const a = ads.distributions[attribute].find((x) => x.value === best.value)?.count ?? 0
      const p = products.distributions[attribute].find((x) => x.value === best.value)?.count ?? 0
      const label = `${attributeLabel[attribute]} “${best.value.replace('_', ' ')}”`
      hypotheses.push({
        attribute,
        value: best.value,
        ads: { count: a, total: ads.analysed },
        productImages: { count: p, total: products.analysed },
        supportingCreativeIds: [...ids.ads, ...ids.productImages],
        statement: `${a} of ${ads.analysed} ads have ${label}, against ${p} of ${products.analysed} product images.`,
        nextStep: `Worth a controlled test: an ad variant that changes only its ${attributeLabel[attribute]}, measured against the current ad.`,
        limitation:
          'Observed by an AI model from public images. It describes how the creatives look and says nothing about performance; public sources hold no performance data for these ads.',
      })
    }
  }
  return { kinds, hypotheses }
}
