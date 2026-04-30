const META_API = 'https://graph.facebook.com/v21.0'

function cfg() {
  return {
    accessToken: process.env.META_ACCESS_TOKEN || '',
    adAccountId: process.env.META_AD_ACCOUNT_ID || '',
    pageId: process.env.META_PAGE_ID || '',
    pixelId: process.env.META_PIXEL_ID || '',
  }
}

function isMockMode(): boolean {
  const c = cfg()
  return !c.accessToken || !c.adAccountId || !c.pageId
}

interface MetaError { error: { message: string; code: number } }

async function metaPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { accessToken } = cfg()
  const resp = await fetch(`${META_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: accessToken }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await resp.json() as Record<string, unknown> | MetaError
  if (!resp.ok || 'error' in data) {
    const e = (data as MetaError).error
    throw new Error(`Meta API ${resp.status}: ${e?.message ?? JSON.stringify(data)}`)
  }
  return data as Record<string, unknown>
}

async function metaPatch(path: string, body: Record<string, unknown>): Promise<void> {
  const { accessToken } = cfg()
  const resp = await fetch(`${META_API}/${path}`, {
    method: 'POST', // Graph API uses POST for updates too (with method override not needed)
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: accessToken }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Meta PATCH ${path} mislukt ${resp.status}: ${txt.slice(0, 200)}`)
  }
}

export interface CampaignParams {
  runId: string
  brandName: string
  niche: string
  dailyBudgetEur: number
  adCopy: {
    primaryText: string
    headline: string
    hooks: string[]
  }
  targetingCountries?: string[]
  imageUrl?: string
  productUrl: string
}

export interface LaunchedCampaign {
  campaignId: string
  adSetId: string
  adId: string
  status: 'PAUSED' | 'ACTIVE'
  mock?: boolean
}

export async function launchCampaign(params: CampaignParams): Promise<LaunchedCampaign> {
  if (isMockMode()) {
    console.log(`[meta-ads] mock: campagne aangemaakt voor "${params.brandName}" (${params.niche})`)
    return {
      campaignId: `mock_campaign_${Date.now()}`,
      adSetId: `mock_adset_${Date.now()}`,
      adId: `mock_ad_${Date.now()}`,
      status: 'PAUSED',
      mock: true,
    }
  }

  const { adAccountId, pageId, pixelId } = cfg()
  const accountId = `act_${adAccountId.replace(/^act_/, '')}`

  // 1 — Campaign
  const campaign = await metaPost(`${accountId}/campaigns`, {
    name: `[AUTO] ${params.brandName} — ${params.niche}`,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
  })

  // 2 — AdSet
  const adSetBody: Record<string, unknown> = {
    name: `${params.brandName} AdSet`,
    campaign_id: campaign.id,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: Math.round(params.dailyBudgetEur * 100),
    targeting: {
      geo_locations: { countries: params.targetingCountries ?? ['NL', 'BE', 'DE', 'FR'] },
      age_min: 18,
      age_max: 65,
      facebook_positions: ['feed', 'instagram_feed', 'instagram_reels'],
    },
    status: 'PAUSED',
  }
  if (pixelId) {
    adSetBody.promoted_object = { pixel_id: pixelId, custom_event_type: 'PURCHASE' }
  }
  const adSet = await metaPost(`${accountId}/adsets`, adSetBody)

  // 3 — Ad Creative
  const creative = await metaPost(`${accountId}/adcreatives`, {
    name: `${params.brandName} Creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: params.adCopy.primaryText,
        link: params.productUrl,
        name: params.adCopy.headline,
        ...(params.imageUrl ? { image_url: params.imageUrl } : {}),
        call_to_action: { type: 'SHOP_NOW', value: { link: params.productUrl } },
      },
    },
  })

  // 4 — Ad
  const ad = await metaPost(`${accountId}/ads`, {
    name: `${params.brandName} Ad`,
    adset_id: adSet.id,
    creative: { creative_id: creative.id },
    status: 'PAUSED',
  })

  console.log(`[meta-ads] campagne aangemaakt: ${campaign.id} (PAUSED)`)
  return {
    campaignId: campaign.id as string,
    adSetId: adSet.id as string,
    adId: ad.id as string,
    status: 'PAUSED',
  }
}

export async function activateCampaign(campaignId: string, adSetId: string): Promise<void> {
  if (isMockMode()) {
    console.log(`[meta-ads] mock: campagne ${campaignId} geactiveerd`)
    return
  }
  await metaPatch(`${campaignId}`, { status: 'ACTIVE' })
  await metaPatch(`${adSetId}`, { status: 'ACTIVE' })
  console.log(`[meta-ads] campagne ${campaignId} + adset ${adSetId} geactiveerd`)
}
