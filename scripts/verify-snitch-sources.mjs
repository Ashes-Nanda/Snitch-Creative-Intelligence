// Verifies the SNITCH source manifest against its public sources and promotes only confirmed facts.
// Run: npm run verify-sources   (needs network; respects snitch.com's 1-second crawl delay)
//
// - Image URLs: HEAD request. A 4xx/5xx marks the asset unavailable.
// - Product records: the product page must contain the image file name. The listed price is read from the
//   page; candidate attributes are kept only if their value appears on the page.
// - Ad records: the image must appear on the third-party directory page. Candidate ad copy is kept only if it
//   appears there. Ads never carry a price or product attributes.
// If a source page can't be fetched, nothing is written and the last verified files stay in place.
import { readFileSync, writeFileSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const read = (name) => JSON.parse(readFileSync(new URL(name, dataDir), 'utf8'))
const UA = 'Mozilla/5.0 (CreativeIntelligencePrototype source verification)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
}

async function headStatus(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
    return { ok: res.ok && (res.headers.get('content-type') ?? '').startsWith('image/'), status: res.status }
  } catch (e) {
    return { ok: false, status: String(e.message ?? e) }
  }
}

/** The schema.org Product block on a product page: the page's own structured description of the product. */
function productData(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const json = JSON.parse(m[1])
      const product = [].concat(json['@graph'] ?? json).find((x) => x && x['@type'] === 'Product')
      if (product) return product
    } catch {
      // ignore malformed blocks
    }
  }
  return null
}

const imageKey = (url) => (url.includes('/files/') ? url.split('/files/')[1].split('?')[0] : url.split('/').pop().split('.')[0])

const manifest = read('snitch-source-manifest.json')
const checkedAt = new Date().toISOString()
const log = []

let directoryHtml
try {
  directoryHtml = await fetchText('https://www.zooptrack.co.in/brand/snitch')
} catch (e) {
  console.error(`Could not fetch the ad directory page: ${e.message}. Nothing written; last verified data kept.`)
  process.exit(1)
}

const verified = []
for (const asset of manifest.assets) {
  const candidate = asset.candidate ?? {}
  const notes = []
  const image = await headStatus(asset.assetUrl)
  const isAd = asset.assetType !== 'product_image'
  const out = { ...asset, price: null, currency: null, attributes: null, adCopy: null }

  if (isAd) {
    const onDirectory = directoryHtml.includes(imageKey(asset.assetUrl))
    notes.push(onDirectory ? 'Image found on the third-party ad directory page.' : 'Image not found on the ad directory page.')
    notes.push('Not confirmed in the Meta Ad Library; no ad ID, start date or spend is available.')
    if (candidate.adCopy) {
      const found = directoryHtml.includes(candidate.adCopy.slice(0, 40))
      out.adCopy = found ? candidate.adCopy : null
      notes.push(found ? 'Ad copy matches the directory page.' : 'Ad copy could not be confirmed, so it was dropped.')
    }
    if (candidate.price || candidate.attributes) notes.push('Price and product attributes are not shown in ads and were dropped.')
    out.source = {
      sourceType: 'third_party_ad_directory',
      sourceUrl: 'https://www.zooptrack.co.in/brand/snitch',
      retrievedAt: checkedAt,
      verificationStatus: !image.ok ? 'unavailable' : onDirectory ? 'partially_verified' : 'unverified',
      notes: image.ok ? notes : [`Image URL returned ${image.status}.`, ...notes],
    }
  } else {
    let page
    try {
      await sleep(1000)
      page = await fetchText(asset.productUrl)
    } catch (e) {
      console.error(`Could not fetch ${asset.productUrl}: ${e.message}. Nothing written; last verified data kept.`)
      process.exit(1)
    }
    const imageOnPage = page.includes(imageKey(asset.assetUrl))
    notes.push(imageOnPage ? 'Image appears on the product page.' : 'Image not found on the product page.')
    const product = productData(page)
    if (!product) notes.push('No structured product data on the page; name, price and attributes not confirmed.')
    if (product?.name) {
      if (product.name !== asset.name) notes.push(`Name taken from the product page (was “${asset.name}”).`)
      out.name = product.name
    }
    const offer = [].concat(product?.offers ?? [])[0]
    if (offer?.price !== undefined) {
      out.price = Number(offer.price)
      out.currency = offer.priceCurrency ?? 'INR'
      notes.push(`Listed price read from the product page on ${checkedAt.slice(0, 10)}; prices change.`)
      if (candidate.price && Number(candidate.price) !== out.price) notes.push(`Earlier researched price (${candidate.price}) did not match and was replaced.`)
    } else notes.push('No listed price found in the product data.')
    // Attributes count as confirmed only if the product's own name or description states them.
    const own = `${product?.name ?? ''} ${product?.description ?? ''}`.toLowerCase()
    const kept = {}
    const dropped = []
    for (const [k, v] of Object.entries(candidate.attributes ?? {})) {
      if (v && own.includes(String(v).toLowerCase())) kept[k] = v
      else dropped.push(`${k} “${v}”`)
    }
    out.attributes = Object.keys(kept).length ? kept : null
    if (dropped.length) notes.push(`Not stated in the product description, so dropped: ${dropped.join(', ')}.`)
    out.source = {
      sourceType: 'official_product_page',
      sourceUrl: asset.productUrl,
      retrievedAt: checkedAt,
      verificationStatus: !image.ok ? 'unavailable' : imageOnPage ? 'verified' : 'unverified',
      notes: image.ok ? notes : [`Image URL returned ${image.status}.`, ...notes],
    }
  }
  verified.push(out)
  log.push({ creativeId: asset.creativeId, status: out.source.verificationStatus, image: image.status, notes: out.source.notes })
  await sleep(250)
}

// Apply to the manifest and to the creatives in both demo exports.
const byId = new Map(verified.map((v) => [v.creativeId, v]))
manifest.assets = verified
manifest.retrievedAt = checkedAt
manifest.verificationSummary = verified.reduce((acc, v) => ({ ...acc, [v.source.verificationStatus]: (acc[v.source.verificationStatus] ?? 0) + 1 }), {})
writeFileSync(new URL('snitch-source-manifest.json', dataDir), JSON.stringify(manifest, null, 2))

for (const file of ['dataset.json', 'dataset-next.json']) {
  const data = read(file)
  for (const c of data.creatives) {
    const v = byId.get(c.creative_id)
    if (!v) continue
    Object.assign(c, {
      name: v.name,
      price: v.price,
      currency: v.currency,
      attributes: v.attributes,
      ad_copy: v.adCopy,
      source: {
        source_type: v.source.sourceType,
        source_url: v.source.sourceUrl,
        retrieved_at: v.source.retrievedAt,
        verification_status: v.source.verificationStatus,
        notes: v.source.notes,
      },
    })
  }
  writeFileSync(new URL(file, dataDir), JSON.stringify(data, null, 2))
}

writeFileSync(new URL('snitch-verification-log.json', dataDir), JSON.stringify({ checkedAt, results: log }, null, 2))
console.log(`Verified ${verified.length} assets:`, manifest.verificationSummary)
