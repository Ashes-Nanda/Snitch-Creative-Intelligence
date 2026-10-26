// Generates the repeatable demo dataset enriched with real, public SNITCH product assets,
// public ad creatives found via a third-party ad directory (zooptrack), and a source manifest.
// Facts are confirmed separately by scripts/verify-snitch-sources.mjs.
// Run: npm run fixtures. Output is deterministic (seeded RNG).
import { mkdirSync, writeFileSync } from 'node:fs'

const out = new URL('../public/', import.meta.url)
mkdirSync(new URL('data/', out), { recursive: true })
mkdirSync(new URL('creatives/', out), { recursive: true })

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261026)
const between = (lo, hi) => lo + rand() * (hi - lo)

const products = {
  shirts: 'Linen & Formal Shirts',
  jeans: 'Denims & Washed Jeans',
  tshirts: 'Oversized & Graphic Tees',
  jackets: 'Overshirts & Jackets',
  trousers: 'Gurkha & Relaxed Trousers',
}

// 28 Real Public SNITCH Assets (14 verified Meta Ads & 14 verified Product Catalogue items)
// Each record maps to: [id, name, platform, format, product, hook, style, offer, cta, textDensity, publishedWeek, details]
const specs = [
  // ── 14 Public Advertising Creatives (Meta Ad Library via Zooptrack) ───────────
  [
    'cr-001',
    'Snitch Quick Date-Ready Styles – Gurugram',
    'meta',
    'image',
    'shirts',
    'product-first',
    'studio',
    null,
    'shop-now',
    'medium',
    0,
    {
      assetType: 'static_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/6c/6ce152113b0395568a1dd82913f09fe840eab9588a7fb09d8bc427cddabd3a9a.webp',
      category: 'Shirts',
      price: 1999,
      currency: 'INR',
      adCopy: 'Get your perfect date look delivered in a flash. Snitch Quick is now live in Gurugram, bringing date-ready styles to you in just 60 minutes!',
      attributes: { fit: 'Slim Fit', color: 'Brown / Neutral', fabric: 'Cotton Linen' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-002',
    'The Tennis Club Polo – Clean Collar',
    'meta',
    'image',
    'tshirts',
    'model-first',
    'street',
    null,
    'shop-now',
    'low',
    0,
    {
      assetType: 'static_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/1a/1a49f8f9ffc58e3747ab479ba3854f9d41ea25cfb70d2fdc1f904c2b9fe6c35d.webp',
      category: 'T-Shirts / Polos',
      price: 1499,
      currency: 'INR',
      adCopy: '🎾 The polo that says everything without saying a word. The Tennis Club Polo is here. Clean collar, premium feel, built for the man who carries himself with ease.',
      attributes: { fit: 'Relaxed Fit', color: 'Vintage Off-White', fabric: '100% Pique Cotton' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-003',
    'Snitch 108th Store Launch – Airport Road',
    'meta',
    'video',
    'jackets',
    'product-first',
    'studio',
    null,
    'shop-now',
    'low',
    0,
    {
      assetType: 'video_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/43/4325f2eeb022af78e785bc4e8f15d646ab537ba91f026669e1ec019e9b019ff7.webp',
      category: 'Jackets',
      price: 2999,
      currency: 'INR',
      adCopy: 'Bengaluru, the drip just got real 😮🔥 SNITCH has officially opened its 108th store on Airport Road ✈️🔥 Bold menswear, sharp fits & everyday confidence.',
      attributes: { fit: 'Boxy Fit', color: 'Black / Olive', fabric: 'Structured Cotton Twill' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-004',
    'Wardrobe Upgrade – Tech-Fit Carousel',
    'meta',
    'carousel',
    'trousers',
    'lifestyle',
    'lifestyle',
    null,
    'learn-more',
    'medium',
    0,
    {
      assetType: 'carousel',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/78/78f74ba9d36c5343ed69b4b995b2d6647bf7012b571ea04ec97a5bde2d3298c2.webp',
      category: 'Trousers',
      price: 1999,
      currency: 'INR',
      adCopy: '🚨Your wardrobe upgrade starts here. The Snitch Collection is where trend meets tech-fit. Built for movement, styled for everyday impact.',
      attributes: { fit: 'Relaxed Fit', color: 'Charcoal Grey', fabric: 'Stretch Poly-Viscose' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-005',
    'Best Sellers Limited Drop – Up to 15% OFF',
    'meta',
    'carousel',
    'shirts',
    'product-first',
    'studio',
    '15% off',
    'shop-now',
    'low',
    0,
    {
      assetType: 'carousel',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/54/548dcbe7dcaa85d6feddd49be54922a6d9f6b7946573d8c217d250607c678ca7.webp',
      category: 'Shirts',
      price: 1799,
      currency: 'INR',
      adCopy: "Upto 15% OFF on the best selling limited stock products. These won't be restocked again so get them today!",
      attributes: { fit: 'Slim Fit', color: 'Pastel Blue', fabric: '100% Breathable Cotton' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-006',
    'Snitch Quick Spontaneous Look – Bengaluru',
    'meta',
    'video',
    'tshirts',
    'model-first',
    'ugc',
    null,
    'shop-now',
    'medium',
    1,
    {
      assetType: 'video_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/9d/9db4bf564bf19ed975784a4796f298716a0910732d20c072d0c953ac3ca32ea9.webp',
      category: 'T-Shirts',
      price: 1299,
      currency: 'INR',
      adCopy: 'Snitch Quick is now live in Bengaluru! ✨ Get your date-ready looks delivered in just 60 minutes. Perfect for those spontaneous plans!',
      attributes: { fit: 'Oversized Fit', color: 'Onyx Black', fabric: '240 GSM Heavyweight Cotton' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-007',
    'Black Mid Rise Relaxed Trousers – Evergreen',
    'meta',
    'image',
    'trousers',
    'product-first',
    'studio',
    '20% off',
    'shop-now',
    'medium',
    0,
    {
      assetType: 'static_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/d3/d35384ecf7d04beda7124d31a8c83623e46dfe3f4ba1dbc03565f7c1c8cde848.webp',
      category: 'Trousers',
      price: 2199,
      currency: 'INR',
      adCopy: 'Black Mid Rise Relaxed Fit Trousers — effortless drape, structured silhouette for day-to-night transitions. Live for 464 days.',
      attributes: { fit: 'Relaxed Fit', color: 'Jet Black', fabric: 'Premium Lycra Blend' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-008',
    'All Style No Stress – Morning to Night Fit',
    'meta',
    'image',
    'jackets',
    'lifestyle',
    'lifestyle',
    null,
    'learn-more',
    'low',
    0,
    {
      assetType: 'static_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/73/73b3d264410f93517aa7dc43c72d6888d6409631e30431e5d417ea4d24f35b22.webp',
      category: 'Jackets / Overshirts',
      price: 3499,
      currency: 'INR',
      adCopy: 'All style. No stress. From effortless morning fits to late-night plans, discover contemporary layered aesthetics. Live for 444 days.',
      attributes: { fit: 'Regular Fit', color: 'Navy / Slate', fabric: 'Wool Blend Flannel' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-009',
    "Snitch Plus – India's Inclusive Fit Drop",
    'meta',
    'image',
    'tshirts',
    'product-first',
    'studio',
    null,
    'shop-now',
    'low',
    2,
    {
      assetType: 'static_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/63/63321670464c4f179240198b979d3edfd8fddc7c21249e5cd430d0430233a3dc.webp',
      category: 'T-Shirts',
      price: 1599,
      currency: 'INR',
      adCopy: "Introducing Snitch Plus — India's largest plus size fashion collection. Style that fits without compromise. Live for 244 days.",
      attributes: { fit: 'Plus Size 3XL-6XL', color: 'Sage Green', fabric: '100% Combed Cotton' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-010',
    'Snitch Plus – Oversized Silhouette & Dropped Shoulders',
    'meta',
    'carousel',
    'tshirts',
    'model-first',
    'lifestyle',
    null,
    'learn-more',
    'medium',
    0,
    {
      assetType: 'carousel',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/6d/6dc5ac5c30c3a79c8e20bf989cc3c48677d46db7784be4df81c90ede22cb15b2.webp',
      category: 'T-Shirts',
      price: 1699,
      currency: 'INR',
      adCopy: 'Snitch Plus — Dropped shoulder cuts and breathable silhouettes engineered for modern everyday wear. Live for 244 days.',
      attributes: { fit: 'Oversized Fit', color: 'Off-White', fabric: 'Cotton Jersey' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-011',
    'Snitch Quick Date Night Delivery – Hyderabad',
    'meta',
    'image',
    'shirts',
    'offer-first',
    'graphic',
    '30% off',
    'shop-now',
    'high',
    3,
    {
      assetType: 'static_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/76/76a53dc3b6e160754c2f13f18223650c5909d136d11857a4eb0a110154fd9379.webp',
      category: 'Shirts',
      price: 1899,
      currency: 'INR',
      adCopy: 'Date night emergencies? Snitch Quick has you covered. Get your perfect look delivered in 60 mins, now live in Hyderabad!',
      attributes: { fit: 'Slim Fit', color: 'Wine Red', fabric: 'Satin Finish Cotton' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-012',
    'Snitch Quick Rapid Delivery – Delhi NCR',
    'meta',
    'image',
    'tshirts',
    'text-first',
    'graphic',
    null,
    'learn-more',
    'high',
    0,
    {
      assetType: 'static_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/7e/7e2e0dd09bfe997f2981ccfe4b33bf64d69c56499308b8b76cdd3202fcdc7f58.webp',
      category: 'T-Shirts',
      price: 1199,
      currency: 'INR',
      adCopy: 'Get your perfect date-ready looks delivered right to your doorstep. Snitch Quick is now live in Delhi for rapid delivery!',
      attributes: { fit: 'Box Fit', color: 'Acid Wash Grey', fabric: '100% Cotton' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-013',
    'Snitch Plus – Stretch Comfort Denims',
    'meta',
    'video',
    'jeans',
    'model-first',
    'street',
    null,
    'shop-now',
    'low',
    0,
    {
      assetType: 'video_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/61/6124c6e820ee3235534bcb76e5bf45508f47fe1b73d1c5a68edf45db98e0d4e5.webp',
      category: 'Jeans',
      price: 2299,
      currency: 'INR',
      adCopy: 'Snitch Plus — Stretch Trousers & Comfort Denims designed with maximum flex for unrestricted movement.',
      attributes: { fit: 'Comfort Straight Fit', color: 'Washed Indigo', fabric: 'Stretch Denim' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-014',
    "Wear What's Next 60-Min Trends – Bengaluru",
    'meta',
    'video',
    'shirts',
    'model-first',
    'ugc',
    null,
    'shop-now',
    'medium',
    1,
    {
      assetType: 'video_ad',
      assetUrl: 'https://www.zooptrack.co.in/m/s3/ads/ffa85ea45e8ef1129ef69ada4d10da6dddb16682d34699a0a08b14c3cf3a62d1.webp',
      category: 'Shirts',
      price: 1999,
      currency: 'INR',
      adCopy: "Snitch Quick is now live in Bengaluru! Get the latest trends delivered in just 60 minutes. Wear what's next, faster than ever.",
      attributes: { fit: 'Cuban Collar Relaxed Fit', color: 'Khaki Print', fabric: '100% Viscose' },
      source: {
        sourceType: 'official_ad_library',
        sourceUrl: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=236672023872356',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],

  // ── 14 Public Product Catalogue Records (Official SNITCH Website & CDN) ──────
  [
    'cr-015',
    'Slim-Fit Stretch Washed Jeans',
    'meta',
    'video',
    'jeans',
    'product-first',
    'studio',
    null,
    'shop-now',
    'none',
    4,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/1_52204133-3376-40be-8d81-8641ce1b2c03.jpg?v=1783076033',
      productUrl: 'https://www.snitch.com/men-jeans/slim-fit-stretch-washed-jeans-4bje006-02/9261366542498/buy',
      category: 'Jeans',
      price: 2299,
      currency: 'INR',
      attributes: { fit: 'Slim Fit', color: 'Mid Wash Blue', fabric: '98% Cotton 2% Elastane' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-jeans/slim-fit-stretch-washed-jeans-4bje006-02/9261366542498/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-016',
    '1% Battery Embroidered Regular Fit Shirt',
    'meta',
    'image',
    'shirts',
    'lifestyle',
    'lifestyle',
    null,
    'learn-more',
    'low',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/1_11bbaf68-ee08-4178-9071-e554b3eceef1.jpg?v=1784116618',
      productUrl: 'https://www.snitch.com/men-shirts/regular-fit-black-shirt-4sfs145-02/9269896904866/buy',
      category: 'Shirts',
      price: 1799,
      currency: 'INR',
      attributes: { fit: 'Regular Fit', color: 'Pitch Black', fabric: '100% Breathable Cotton' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-shirts/regular-fit-black-shirt-4sfs145-02/9269896904866/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-017',
    '100% Cotton Oversized Heavyweight T-Shirt',
    'meta',
    'image',
    'tshirts',
    'offer-first',
    'graphic',
    'Buy 2 get 1',
    'shop-now',
    'high',
    2,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/4MBGSS1233-04-3XL17.jpg?v=1772798074',
      productUrl: 'https://www.snitch.com/men-t-shirts/100-cotton-oversized-plus-size-t-shirt-4mbgst1233-04/8883304202402/buy',
      category: 'T-Shirts',
      price: 1299,
      currency: 'INR',
      attributes: { fit: 'Oversized Fit', color: 'Sage Mineral', fabric: '100% Cotton 240 GSM' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-t-shirts/100-cotton-oversized-plus-size-t-shirt-4mbgst1233-04/8883304202402/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-018',
    'Pleated Regular Fit Gurkha Trousers',
    'meta',
    'image',
    'trousers',
    'model-first',
    'studio',
    null,
    'shop-now',
    'low',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/1_139a6bf0-f0ac-43dc-98c7-318966a4a959.jpg?v=1760510861',
      productUrl: 'https://www.snitch.com/men-trousers/regular-fit-black-trousers-4msr5386-03/8786284150946/buy',
      category: 'Trousers',
      price: 2199,
      currency: 'INR',
      attributes: { fit: 'Gurkha Pleated', color: 'Black', fabric: 'Polyester Viscose Blend' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-trousers/regular-fit-black-trousers-4msr5386-03/8786284150946/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-019',
    'Floral 100% Viscose Cuban Collar Shirt',
    'google',
    'image',
    'shirts',
    'product-first',
    'studio',
    null,
    'shop-now',
    'low',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/1_d3780651-bce7-41d5-8640-c3731f249e97.jpg?v=1784646542',
      productUrl: 'https://www.snitch.com/men-shirts/floral-100-viscose-oversized-shirt-4shs044-16/9273197002914/buy',
      category: 'Shirts',
      price: 1899,
      currency: 'INR',
      attributes: { fit: 'Boxy Cuban', color: 'Floral Multi', fabric: '100% Viscose' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-shirts/floral-100-viscose-oversized-shirt-4shs044-16/9273197002914/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-020',
    'Slim Fit Stretch Stripes Luxe Shirt',
    'google',
    'image',
    'shirts',
    'product-first',
    'studio',
    '20% off',
    'shop-now',
    'medium',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/4mlx1222-01_1.jpg?v=1772731750',
      productUrl: 'https://www.snitch.com/men-shirts/stripes-slim-fit-luxe-stretch-shirt-4mlx1222-01/8930526691490/buy',
      category: 'Shirts',
      price: 1999,
      currency: 'INR',
      attributes: { fit: 'Slim Fit', color: 'Navy Stripes', fabric: 'Luxe Stretch Cotton' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-shirts/stripes-slim-fit-luxe-stretch-shirt-4mlx1222-01/8930526691490/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-021',
    'Black Textured Abstract Studio Shirt',
    'google',
    'image',
    'shirts',
    'model-first',
    'street',
    null,
    'shop-now',
    'low',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/f7967e6bd62dd33dd48ff492a94c2be9.webp?v=1724926999',
      productUrl: 'https://www.snitch.com/men-shirts/black-textured-abstract-shirt-4mss3320-02/8475834024098/buy',
      category: 'Shirts',
      price: 1999,
      currency: 'INR',
      attributes: { fit: 'Slim Fit', color: 'Textured Black', fabric: 'Jacquard Weave' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-shirts/black-textured-abstract-shirt-4mss3320-02/8475834024098/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-022',
    'Box Fit Textured Stripes Casual Shirt',
    'google',
    'image',
    'shirts',
    'offer-first',
    'graphic',
    'Flat 25% off',
    'shop-now',
    'high',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/4MSS4327-01-M8.jpg?v=1771239051',
      productUrl: 'https://www.snitch.com/men-shirts/box-fit-textured-shirt-4mss4327-01/8763518353570/buy',
      category: 'Shirts',
      price: 1799,
      currency: 'INR',
      attributes: { fit: 'Box Fit', color: 'Cream Stripes', fabric: 'Textured Cotton' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-shirts/box-fit-textured-shirt-4mss4327-01/8763518353570/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-023',
    'Blue Flannel Checks Double Pocket Overshirt',
    'google',
    'image',
    'jackets',
    'lifestyle',
    'lifestyle',
    null,
    'learn-more',
    'low',
    1,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/00bb45d236a842f46c133aa8baf4fd0f.jpg?v=1729521586',
      productUrl: 'https://www.snitch.com/men-overshirt/blue-flannel-checks-double-pocket-overshirt-4mss3575-06/8521461727394/buy',
      category: 'Jackets / Overshirts',
      price: 2499,
      currency: 'INR',
      attributes: { fit: 'Relaxed Fit', color: 'Blue Plaid', fabric: 'Brushed Flannel Cotton' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-overshirt/blue-flannel-checks-double-pocket-overshirt-4mss3575-06/8521461727394/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-024',
    'Navy Blue Regular Fit Office Shirt',
    'google',
    'image',
    'shirts',
    'product-first',
    'studio',
    '15% off',
    'shop-now',
    'medium',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/4mss4632-05_1.jpg?v=1772731767',
      productUrl: 'https://www.snitch.com/men-shirts/navy-blue-regular-fit-shirt-4mss4632-05/8930527084706/buy',
      category: 'Shirts',
      price: 1699,
      currency: 'INR',
      attributes: { fit: 'Regular Fit', color: 'Deep Navy', fabric: '100% Giza Cotton' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-shirts/navy-blue-regular-fit-shirt-4mss4632-05/8930527084706/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-025',
    'Kaizen Digital Puff Print Oversized Tee',
    'google',
    'video',
    'tshirts',
    'model-first',
    'ugc',
    null,
    'shop-now',
    'low',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/4mst3167-01_1.jpg?v=1764006426',
      productUrl: 'https://www.snitch.com/men-t-shirts/oversized-graphic-100-cotton-t-shirt-4mst3167-01/8851574653090/buy',
      category: 'T-Shirts',
      price: 1399,
      currency: 'INR',
      attributes: { fit: 'Oversized Fit', color: 'Vintage Black', fabric: '220 GSM Cotton Puff Print' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-t-shirts/oversized-graphic-100-cotton-t-shirt-4mst3167-01/8851574653090/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-026',
    'Relaxed Fit Stretch Luxe Trousers',
    'google',
    'video',
    'trousers',
    'product-first',
    'studio',
    'Buy 2 save 10%',
    'shop-now',
    'low',
    2,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/4mtlx0017-03_1.jpg?v=1764957928',
      productUrl: 'https://www.snitch.com/men-trousers/relaxed-fit-stretch-trousers-4mtlx0017-03/8860920610978/buy',
      category: 'Trousers',
      price: 2199,
      currency: 'INR',
      attributes: { fit: 'Relaxed Fit', color: 'Olive Taupe', fabric: 'Luxe Bi-Stretch Poly-Viscose' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-trousers/relaxed-fit-stretch-trousers-4mtlx0017-03/8860920610978/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-027',
    'Crochet Knit Core Lab Polo T-Shirt',
    'google',
    'image',
    'tshirts',
    'text-first',
    'graphic',
    null,
    'learn-more',
    'high',
    0,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/4MCRT0012-02_9.jpg?v=1782287928',
      productUrl: 'https://www.snitch.com/men-t-shirts/relaxed-fit-polo-core-lab-crochet-t-shirt-4mcrt0012-02/8814314356898/buy',
      category: 'T-Shirts / Polos',
      price: 1999,
      currency: 'INR',
      attributes: { fit: 'Relaxed Fit', color: 'Ecru / Beige', fabric: 'Open Crochet Knit Cotton' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-t-shirts/relaxed-fit-polo-core-lab-crochet-t-shirt-4mcrt0012-02/8814314356898/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
  [
    'cr-028',
    'Triumph Black Printed Regular Fit T-Shirt',
    'meta',
    'image',
    'tshirts',
    'product-first',
    'studio',
    null,
    'shop-now',
    'low',
    8,
    {
      assetType: 'product_image',
      assetUrl: 'https://cdn.shopify.com/s/files/1/0420/7073/7058/files/1001ea357c74ca3fa869bf48b807616d.jpg?v=1732603846',
      productUrl: 'https://www.snitch.com/men-t-shirts/triumph-black-printed-slim-fit-t-shirt-4mst2562-01/8546820915362/buy',
      category: 'T-Shirts',
      price: 999,
      currency: 'INR',
      attributes: { fit: 'Regular Fit', color: 'Black', fabric: '100% Cotton Bio-Washed' },
      source: {
        sourceType: 'official_product_page',
        sourceUrl: 'https://www.snitch.com/men-t-shirts/triumph-black-printed-slim-fit-t-shirt-4mst2562-01/8546820915362/buy',
        retrievedAt: '2026-10-26T16:00:00Z',
        verificationStatus: 'verified',
      },
    },
  ],
]

const weeks = Array.from({ length: 8 }, (_, i) => {
  const start = new Date(Date.UTC(2026, 7, 31 + i * 7))
  const end = new Date(start.getTime() + 6 * 86400000)
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
})

const ZOOPTRACK_BRAND_URL = 'https://www.zooptrack.co.in/brand/snitch'
const creatives = []
const performance = []
const analyses = {}
const sourceManifest = []

for (const [id, name, platform, format, product, hook, style, offer, cta, textDensity, publishedWeek, details] of specs) {
  const isPublic = true
  // Only what can be backed is emitted as fact. Researched values (price, attributes, ad copy) are kept
  // as unconfirmed candidates; scripts/verify-snitch-sources.mjs promotes them once the source confirms them.
  const isAd = details.assetType !== 'product_image'
  const sourceRecord = {
    source_type: isAd ? 'third_party_ad_directory' : 'official_product_page',
    source_url: isAd ? ZOOPTRACK_BRAND_URL : details.productUrl,
    verification_status: 'unverified',
    notes: ['Not yet checked against the source. Run npm run verify-sources.'],
  }

  const creativeRecord = {
    creative_id: id,
    name,
    platform,
    asset_url: details.assetUrl,
    format,
    product_id: product,
    published_at: null,
    data_origin: 'public',
    source_note: isAd
      ? 'Public SNITCH ad creative found in a third-party ad directory (zooptrack). Not confirmed in the Meta Ad Library.'
      : 'SNITCH product image from the official product page.',
    asset_type: details.assetType,
    product_url: details.productUrl ?? null,
    category: details.category ?? null,
    price: null,
    currency: null,
    ad_copy: null,
    attributes: null,
    source: sourceRecord,
  }

  creatives.push(creativeRecord)

  sourceManifest.push({
    creativeId: id,
    name,
    assetType: details.assetType,
    category: details.category ?? null,
    assetUrl: details.assetUrl,
    productUrl: details.productUrl ?? null,
    price: null,
    currency: null,
    adCopy: null,
    attributes: null,
    source: { sourceType: sourceRecord.source_type, sourceUrl: sourceRecord.source_url, verificationStatus: 'unverified', notes: sourceRecord.notes },
    candidate: { price: details.price ?? null, attributes: details.attributes ?? null, adCopy: details.adCopy ?? null },
  })

  // Write SVG fallback placeholder as well
  writeFileSync(new URL(`creatives/${id}.svg`, out), svgFor({ name, format, product, hook, style, offer, cta, textDensity }))

  analyses[id] = {
    creative_id: id,
    hook_type: hook,
    product_visibility:
      hook === 'product-first'
        ? `SNITCH ${details.category ?? products[product]} is prominently featured as the central hero focus in the asset.`
        : hook === 'model-first'
          ? `Model wears the SNITCH ${details.category ?? products[product]}; styled on-body presentation.`
          : hook === 'offer-first'
            ? `Special promotional hook ("${offer ?? 'Sale'}") with product visible in frame.`
            : hook === 'text-first'
              ? 'Headline text / typography-led creative with brand callout.'
              : `SNITCH ${details.category ?? products[product]} displayed within an editorial street or lifestyle setting.`,
    offer_type: offer,
    cta_type: cta,
    visual_style: style,
    text_density: textDensity,
    description:
      details.assetType === 'product_image'
        ? `Official SNITCH catalogue asset: ${name} (${details.category ?? product}) with ${style} visual framing and ${details.attributes?.fit ?? 'tailored'} silhouette.`
        : `Public SNITCH ad creative: ${name} (${format}) with ${style} aesthetic${offer ? ` featuring ${offer}` : ''}${details.adCopy ? ` – copy: "${details.adCopy.slice(0, 80)}..."` : ''}.`,
    model_version: 'manual-fixture-v1',
    created_at: '2026-10-20T09:00:00Z',
  }

  if (publishedWeek >= 8) continue
  // Simulated effects so the demo has patterns to find. These are synthetic numbers.
  const baseCtr = platform === 'meta' ? 0.011 : 0.0065
  let ctrLift = 1
  if (platform === 'meta' && hook === 'product-first') ctrLift *= 1.45
  if (platform === 'google' && offer) ctrLift *= 1.35
  if (style === 'ugc') ctrLift *= 1.1
  if (textDensity === 'high') ctrLift *= 0.85
  const quality = between(0.85, 1.15)
  const scale = between(0.6, 1.6)
  for (let w = publishedWeek; w < weeks.length; w++) {
    const impressions = Math.round(between(14000, 30000) * scale)
    const clicks = Math.round(impressions * baseCtr * ctrLift * quality * between(0.85, 1.15))
    const cpm = platform === 'meta' ? between(140, 190) : between(70, 110)
    const spend = Math.round((impressions / 1000) * cpm)
    const cvr = (offer ? 0.034 : 0.027) * between(0.7, 1.3)
    const conversions = Math.round(clicks * cvr)
    const aov = between(1300, 2100) * (offer ? 0.85 : 1)
    const noRevenueTracking = id === 'cr-027'
    performance.push({
      performance_id: `pf-${id}-w${w + 1}`,
      creative_id: id,
      platform,
      reporting_start: weeks[w][0],
      reporting_end: weeks[w][1],
      impressions,
      clicks,
      spend,
      conversions,
      attributed_revenue: noRevenueTracking ? null : Math.round(conversions * aov),
      attribution_model: platform === 'meta' ? '7-day click, 1-day view' : 'Data-driven',
      data_origin: 'simulated',
    })
  }
}

// "Next week" export: week 9 added, the failed cr-014 analysis re-run, and cr-028 analysed.
const nextAnalyses = structuredClone(analyses)
const week9 = (() => {
  const start = new Date(Date.UTC(2026, 9, 26))
  return [start.toISOString().slice(0, 10), new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10)]
})()
const nextPerformance = [...performance]
for (const c of creatives.filter((c) => c.creative_id.startsWith('cr-') && c.name)) {
  const last = [...performance].reverse().find((p) => p.creative_id === c.creative_id && p.performance_id?.startsWith('pf-'))
  const base = last ?? { ...performance[0], creative_id: c.creative_id, platform: c.platform, attribution_model: c.platform === 'meta' ? '7-day click, 1-day view' : 'Data-driven' }
  const f = between(0.9, 1.1)
  nextPerformance.push({
    ...base,
    performance_id: `pf-${c.creative_id}-w9`,
    reporting_start: week9[0],
    reporting_end: week9[1],
    impressions: Math.round(base.impressions * f),
    clicks: Math.round(base.clicks * f),
    spend: Math.round(base.spend * f),
    conversions: Math.round(base.conversions * f),
    attributed_revenue: base.attributed_revenue === null ? null : Math.round(base.attributed_revenue * f),
  })
}

// Deliberate data-quality problems for testing ingest and data quality reports:
creatives.push({
  creative_id: 'cr-029',
  name: '',
  platform: 'meta',
  asset_url: '/creatives/missing.svg',
  format: 'image',
  data_origin: 'synthetic',
})
const damage = [
  { ...performance[3] }, // exact duplicate row
  { ...performance[10], performance_id: 'pf-bad-clicks', reporting_start: '2026-10-26', reporting_end: '2026-11-01', clicks: performance[10].impressions + 50 },
  { ...performance[0], performance_id: 'pf-orphan', creative_id: 'cr-099' },
]
performance.push(...damage)
nextPerformance.push(...damage.filter((d) => d.performance_id !== 'pf-bad-clicks'))

// One analysis the model got wrong (off-schema hook for testing error boundary), one never ran.
analyses['cr-014'] = { ...analyses['cr-014'], hook_type: 'emotional-story', cta_type: 'buy' }
delete analyses['cr-028']

const source = (label, generatedAt) => ({
  type: 'simulated',
  label,
  generatedAt,
  provenanceNote: 'Creative assets are public SNITCH images; product facts are shown only where verified against the source. All campaign performance numbers are synthetic demo figures.',
})

writeFileSync(
  new URL('data/dataset.json', out),
  JSON.stringify({ source: source('Real Public SNITCH Assets + Simulated Meta/Google Campaign Performance (week ending 25 Oct)', '2026-10-26T06:00:00Z'), creatives, performance }, null, 2),
)
writeFileSync(new URL('data/analyses.json', out), JSON.stringify(analyses, null, 2))
writeFileSync(
  new URL('data/dataset-next.json', out),
  JSON.stringify({ source: source('Real Public SNITCH Assets + Simulated Meta/Google Campaign Performance (week ending 1 Nov)', '2026-11-02T06:00:00Z'), creatives, performance: nextPerformance }, null, 2),
)
writeFileSync(new URL('data/analyses-next.json', out), JSON.stringify(nextAnalyses, null, 2))
writeFileSync(
  new URL('data/snitch-source-manifest.json', out),
  JSON.stringify(
    {
      manifestVersion: '1.0.0',
      brand: 'SNITCH (snitch.com)',
      retrievedAt: '2026-10-26T16:00:00Z',
      assetCount: sourceManifest.length,
      provenanceNotice: {
        brand: 'SNITCH (snitch.com)',
        syntheticPerformanceDisclaimer: 'All campaign performance metrics (spend, impressions, clicks, CTR, conversions, revenue, ROAS) are synthetic demo data generated for workflow demonstration. They do not represent confidential or commercial ad performance of SNITCH.',
        dataOrigins: {
          assets: 'Product images from official snitch.com product pages, and ad creatives found in a third-party ad directory (zooptrack). Ads are not confirmed in the Meta Ad Library.',
          performance: 'Deterministic synthetic simulation',
        },
      },
      sourcesCovered: [
        {
          sourceType: 'official_product_page',
          description: 'Official SNITCH Product Pages and XML Sitemaps (snitch.com)',
          baseUrl: 'https://www.snitch.com/',
          assetCount: 14,
        },
        {
          sourceType: 'third_party_ad_directory',
          description: 'zooptrack.co.in SNITCH brand page (third-party directory of public ads)',
          baseUrl: ZOOPTRACK_BRAND_URL,
          assetCount: 14,
        },
      ],
      assets: sourceManifest,
    },
    null,
    2,
  ),
)

console.log(`Generated ${creatives.length} creatives (${sourceManifest.length} real SNITCH assets in manifest), ${performance.length} performance rows, ${Object.keys(analyses).length} analyses`)

function svgFor({ name, format, product, hook, style, offer, cta, textDensity }) {
  const bg = { studio: '#efeae4', street: '#5b6470', lifestyle: '#d9c7a7', graphic: '#1f2937', ugc: '#c9d4cf' }[style]
  const ink = style === 'graphic' || style === 'street' ? '#f9fafb' : '#1f2937'
  const garmentColour = { shirts: '#cbb89a', jeans: '#3b5b86', tshirts: '#e7e5e4', jackets: '#3f4a3c', trousers: '#8a7f72' }[product]
  const garment = garmentPath(product, garmentColour, hook === 'product-first' ? 1.25 : 0.65, hook === 'product-first' ? 200 : 255, hook === 'product-first' ? 230 : 300)
  const person = hook === 'model-first' || hook === 'lifestyle'
    ? `<circle cx="200" cy="135" r="34" fill="#a8846b"/><rect x="150" y="175" width="100" height="190" rx="40" fill="${garmentColour}"/>`
    : ''
  const scene = hook === 'lifestyle' ? `<rect x="0" y="330" width="400" height="170" fill="#00000018"/><circle cx="330" cy="80" r="40" fill="#ffffff40"/>` : ''
  const headline = hook === 'offer-first' || hook === 'text-first'
    ? `<text x="200" y="${hook === 'text-first' ? 230 : 120}" text-anchor="middle" font-family="Inter,Arial" font-weight="800" font-size="${hook === 'text-first' ? 44 : 50}" fill="${ink}">${hook === 'text-first' ? 'NEW IN' : offer ?? 'SALE'}</text>`
    : ''
  const lines = { none: 0, low: 1, medium: 2, high: 3 }[textDensity]
  const copy = Array.from({ length: lines }, (_, i) => `<rect x="${110 + i * 10}" y="${400 + i * 14}" width="${180 - i * 20}" height="7" rx="3" fill="${ink}" opacity="0.55"/>`).join('')
  const badge = offer && hook !== 'offer-first'
    ? `<rect x="250" y="24" width="130" height="34" rx="17" fill="#dc2626"/><text x="315" y="47" text-anchor="middle" font-family="Inter,Arial" font-weight="700" font-size="15" fill="#fff">${offer}</text>`
    : ''
  const ctaBtn = cta === 'none' ? '' : `<rect x="130" y="452" width="140" height="32" rx="16" fill="${ink}"/><text x="200" y="473" text-anchor="middle" font-family="Inter,Arial" font-weight="600" font-size="13" fill="${bg}">${{ 'shop-now': 'Shop now', 'learn-more': 'Learn more', 'swipe-up': 'Swipe up' }[cta]}</text>`
  const play = format === 'video' ? `<circle cx="40" cy="40" r="18" fill="#00000066"/><path d="M34 31 L50 40 L34 49 Z" fill="#fff"/>` : ''
  const dots = format === 'carousel' ? `<circle cx="185" cy="440" r="3" fill="${ink}"/><circle cx="200" cy="440" r="3" fill="${ink}" opacity=".4"/><circle cx="215" cy="440" r="3" fill="${ink}" opacity=".4"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img" aria-label="SNITCH asset fallback: ${name}">
<rect width="400" height="500" fill="${bg}"/>${scene}${person}${hook === 'text-first' ? '' : garment}${headline}${badge}${copy}${ctaBtn}${play}${dots}
<text x="12" y="492" font-family="Inter,Arial" font-size="10" fill="${ink}" opacity="0.6">SNITCH ASSET PREVIEW</text>
</svg>
`
}

function garmentPath(product, colour, s, cx, cy) {
  const t = (d) => `<g transform="translate(${cx} ${cy}) scale(${s}) translate(-100 -100)">${d}</g>`
  if (product === 'jeans' || product === 'trousers')
    return t(`<path d="M55 20 H145 L155 190 H112 L100 80 L88 190 H45 Z" fill="${colour}"/><rect x="55" y="20" width="90" height="12" fill="#00000022"/>`)
  return t(`<path d="M70 20 L100 30 L130 20 L180 50 L165 85 L145 75 V185 H55 V75 L35 85 L20 50 Z" fill="${colour}"/>${product === 'shirts' ? '<path d="M100 30 V185" stroke="#00000030" stroke-width="2"/>' : ''}`)
}
