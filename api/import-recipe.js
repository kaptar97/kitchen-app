// Vercel serverless function: GET /api/import-recipe?url=https://...
// Reads the schema.org "Recipe" data most recipe sites embed for Google, and returns a clean recipe.

export const config = { maxDuration: 30 }

const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  let target
  try {
    target = new URL(String(req.query.url || ''))
    if (!/^https?:$/.test(target.protocol) || BLOCKED_HOST.test(target.hostname)) throw new Error()
  } catch {
    return res.status(400).json({ error: 'That doesn’t look like a web link.' })
  }

  // 1) Try the site directly. 2) If it blocks servers, go through a free page-reader service.
  const debug = []
  let html = await fetchDirect(target, debug)
  let recipe = html && extractRecipe(html)
  if (!recipe) {
    html = await fetchViaReader(target, debug)
    recipe = html && extractRecipe(html)
  }
  if (!recipe) return res.status(422).json({ debug, error: 'Couldn’t read a recipe from that page. Copy the recipe text and use “Paste recipe text” instead.' })
  recipe.source_url = target.toString()
  return res.status(200).json(recipe)
}

async function fetchDirect(target, debug = []) {
  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    })
    debug.push(`direct ${r.status}`)
    if (!r.ok) return null
    return (await r.text()).slice(0, 3_000_000)
  } catch (e) { debug.push(`direct err ${e.message}`); return null }
}

async function fetchViaReader(target, debug = []) {
  try {
    const r = await fetch(`https://r.jina.ai/${target.toString()}`, {
      headers: { 'X-Return-Format': 'html', 'X-No-Cache': 'true' },
      signal: AbortSignal.timeout(20000),
    })
    const body = (await r.text()).slice(0, 3_000_000)
    debug.push(`reader ${r.status} len=${body.length} ldjson=${(body.match(/ld\+json/g) || []).length} ld=${(body.match(/<script[^>]*ld\+json[^>]*>([\s\S]{0,300})/) || [])[1] || ''} head=${body.slice(0, 120).replace(/\s+/g, ' ')}`)
    if (!r.ok) return null
    return body
  } catch (e) { debug.push(`reader err ${e.message}`); return null }
}


export function extractRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const [, raw] of blocks) {
    let data
    try { data = JSON.parse(raw.trim()) } catch {
      try { data = JSON.parse(raw.trim().replace(/[\u0000-\u001f]+/g, ' ')) } catch { continue }
    }
    const node = findRecipeNode(data)
    if (node) return normalize(node)
  }
  return null
}

function isRecipe(n) {
  const t = n && n['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

function findRecipeNode(data, depth = 0) {
  if (!data || depth > 6) return null
  if (Array.isArray(data)) {
    for (const d of data) { const f = findRecipeNode(d, depth + 1); if (f) return f }
    return null
  }
  if (typeof data !== 'object') return null
  if (isRecipe(data)) return data
  if (data['@graph']) return findRecipeNode(data['@graph'], depth + 1)
  if (data.mainEntity) return findRecipeNode(data.mainEntity, depth + 1)
  return null
}

const decode = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, '’')
  .replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim()

function minutes(iso) {
  if (!iso || typeof iso !== 'string') return null
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m) return null
  const total = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)
  return total || null
}

function flattenSteps(ins) {
  if (!ins) return []
  if (typeof ins === 'string') return ins.split(/\n+|(?<=\.)\s+(?=\d+\.\s)/).map(decode).filter(Boolean)
  if (Array.isArray(ins)) return ins.flatMap(flattenSteps)
  if (ins['@type'] === 'HowToSection' || ins.itemListElement) return flattenSteps(ins.itemListElement)
  return [decode(ins.text || ins.name)].filter(Boolean)
}

function normalize(n) {
  const img = Array.isArray(n.image) ? n.image[0] : n.image
  const yieldRaw = Array.isArray(n.recipeYield) ? n.recipeYield[0] : n.recipeYield
  const servings = parseInt(String(yieldRaw ?? '').match(/\d+/)?.[0] || '', 10) || null
  const kw = typeof n.keywords === 'string' ? n.keywords : ''
  return {
    title: decode(n.name) || 'Untitled recipe',
    servings,
    prep_minutes: minutes(n.prepTime),
    cook_minutes: minutes(n.cookTime) || (minutes(n.totalTime) && !minutes(n.prepTime) ? minutes(n.totalTime) : null),
    ingredients: (n.recipeIngredient || n.ingredients || []).map(decode).filter(Boolean),
    steps: flattenSteps(n.recipeInstructions),
    image_url: typeof img === 'string' ? img : img?.url || null,
    keywords: kw,
  }
}
