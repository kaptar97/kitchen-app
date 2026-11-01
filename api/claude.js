// Vercel serverless function: POST /api/claude
// The app's private doorway to Claude. The API key lives only here (Vercel env var ANTHROPIC_API_KEY).
// Only signed-in household members can use it, with a daily request limit per household.

export const config = { maxDuration: 60 }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://woovsqjqcxklcgiebuly.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_4_1uzEjUB77INb-EQGT1Aw_sPqlZmKr'
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5'
const DAILY_LIMIT = Number(process.env.CLAUDE_DAILY_LIMIT || 100)
const ANTHROPIC_URL = process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages'

const LOCATION_HINT = 'Use one of the household locations listed in the context (e.g. Fridge, Freezer, Pantry).'

const TOOLS = {
  add_to_shopping_list: {
    name: 'add_to_shopping_list',
    description: 'Propose adding items to the household shopping list. The family confirms before anything changes.',
    input_schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', description: 'Short grocery name, e.g. "Eggs"' }, quantity: { type: 'number' } }, required: ['name'] } },
      },
      required: ['items'],
    },
  },
  add_to_inventory: {
    name: 'add_to_inventory',
    description: 'Propose adding items to the kitchen/house inventory. The family confirms before anything changes.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Short item name, title case, e.g. "Chicken thighs"' },
              quantity: { type: 'number' },
              unit: { type: 'string', enum: ['ct', 'pack', 'box', 'can', 'bottle', 'bag', 'jar', 'lb', 'oz', 'gal', 'roll', 'dozen'] },
              location: { type: 'string', description: LOCATION_HINT },
              expires_in_days: { type: 'integer', description: 'Typical fridge/freezer life for perishables; omit for shelf-stable items and non-food.' },
            },
            required: ['name', 'quantity', 'unit', 'location'],
          },
        },
      },
      required: ['items'],
    },
  },
  remove_from_inventory: {
    name: 'remove_from_inventory',
    description: 'Propose marking items as used up / removing them from the inventory. The family confirms first.',
    input_schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
      required: ['items'],
    },
  },
  create_recipe: {
    name: 'create_recipe',
    description: 'Write out a full recipe the family can save. Ingredients one per line with amounts, e.g. "1 1/2 lb chicken thighs".',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        servings: { type: 'integer' },
        prep_minutes: { type: 'integer' },
        cook_minutes: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' }, description: 'From: High-protein, Classic, Keto, Low-carb, Kid-friendly, Quick, Crockpot, Dinner, Breakfast, Lunch, Snack, Dessert, Meal prep' },
        ingredients: { type: 'array', items: { type: 'string' } },
        steps: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['title', 'ingredients', 'steps'],
    },
  },
}

function systemPrompt(mode, context) {
  const base = `You are the kitchen assistant inside a family's shared kitchen inventory app. Today is ${new Date().toDateString()}.

Here is the household's current data:
<kitchen>
${context}
</kitchen>`
  if (mode === 'quickadd') {
    return `${base}

The user is listing groceries they just bought or have. Call add_to_inventory with every item, cleaned up:
- Title-case short names ("Chicken thighs", "Paper towels"); split combined lines into separate items.
- Convert counts sensibly: "dozen eggs" → Eggs, 12 ct (or 1 dozen); "2 gallons milk" → Milk, 2 gal.
- Pick the best location from the household's locations (meat/fish → Freezer unless they say fresh for this week; dairy, produce → Fridge; dry goods → Pantry; paper and cleaning → Garage/Cleaning/Bathroom).
- Add expires_in_days for perishables using typical fridge life (milk 7, eggs 21, fresh chicken 2, ground beef 2, berries 5, lettuce 7, bread 7, frozen meat 90). Omit for shelf-stable and non-food.
Do not add anything the user didn't mention.`
  }
  if (mode === 'recipe') {
    return `${base}

The user is giving you a recipe as a photo or as messy pasted text. Call create_recipe with a clean version: the real title, servings, times if known, ingredients one per line with amounts, and clear numbered-style steps (without the numbers). Keep the original recipe; don't invent changes. If it's not a recipe, still call create_recipe with your best reading and put a short explanation in notes.`
  }
  return `${base}

How to help:
- Be brief and friendly — the family reads this on a phone. Short paragraphs or short bullet lists, no headers.
- Prefer meals they can make with what they have; say what's missing. Point out items expiring soon and suggest using them first.
- They may like recipes from their saved list or the app's built-in library (listed in the context) — mention those by exact title when they fit.
- Use the tools when the user asks for a change or it clearly helps (e.g. "add what I need" → add_to_shopping_list; "we finished the milk" → remove_from_inventory; "write me a recipe" → create_recipe). The app shows each proposed change for the family to confirm, so phrase it as a suggestion ("I can add these to your list") — never claim it's already done.
- Don't add salt, pepper, water or cooking oil to shopping lists unless asked.
- For anything medical, allergies or diets for health conditions, give general info and suggest checking with a professional.`
}

async function supa(path, token, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Claude isn’t connected yet. Add the Anthropic API key in Vercel settings.' })

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Please sign in again.' })

  const { mode = 'chat', householdId, context = '', messages = [], image, text } = req.body || {}
  if (!householdId) return res.status(400).json({ error: 'Missing household.' })

  // 1) Who is this? (Supabase checks the login token.)
  const me = await supa('/auth/v1/user', token)
  if (!me.ok) return res.status(401).json({ error: 'Please sign in again.' })

  // 2) Count the request against today's household limit (also checks membership).
  const counted = await supa('/rest/v1/rpc/ai_count_request', token, { hh: householdId })
  if (!counted.ok) return res.status(403).json({ error: 'You’re not part of this household.' })
  if (Number(counted.json) > DAILY_LIMIT) {
    return res.status(429).json({ error: `Daily Claude limit reached (${DAILY_LIMIT} requests). It resets tomorrow.` })
  }

  // 3) Build the request.
  const ctx = String(context).slice(0, 60000)
  let msgs
  let tools
  let toolChoice
  if (mode === 'quickadd') {
    msgs = [{ role: 'user', content: String(text || '').slice(0, 4000) }]
    tools = [TOOLS.add_to_inventory]
    toolChoice = { type: 'tool', name: 'add_to_inventory' }
  } else if (mode === 'recipe') {
    const content = []
    if (image?.data && /^image\/(jpeg|png|webp|gif)$/.test(image.media_type || '')) {
      if (String(image.data).length > 4_000_000) return res.status(413).json({ error: 'That photo is too big. Try a smaller one.' })
      content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } })
    }
    content.push({ type: 'text', text: text ? `Recipe text:\n${String(text).slice(0, 20000)}` : 'Read the recipe in this photo.' })
    msgs = [{ role: 'user', content }]
    tools = [TOOLS.create_recipe]
    toolChoice = { type: 'tool', name: 'create_recipe' }
  } else {
    msgs = (Array.isArray(messages) ? messages : [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    while (msgs.length && msgs[0].role !== 'user') msgs.shift()
    if (!msgs.length) return res.status(400).json({ error: 'Say something first.' })
    tools = Object.values(TOOLS)
    toolChoice = { type: 'auto' }
  }

  // 4) Ask Claude.
  let data
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: systemPrompt(mode, ctx), messages: msgs, tools, tool_choice: toolChoice }),
      signal: AbortSignal.timeout(55000),
    })
    data = await r.json()
    if (!r.ok) {
      console.error('anthropic error', r.status, JSON.stringify(data).slice(0, 500))
      const msg = data?.error?.message || ''
      if (/credit|balance|billing/i.test(msg)) return res.status(402).json({ error: 'Claude credits ran out. Add more in the Anthropic Console.' })
      if (r.status === 401) return res.status(502).json({ error: 'The Anthropic API key isn’t valid. Check it in Vercel settings.' })
      if (r.status === 429 || r.status === 529) return res.status(503).json({ error: 'Claude is busy right now. Try again in a minute.' })
      return res.status(502).json({ error: 'Claude had a problem answering. Try again.' })
    }
  } catch (e) {
    console.error('anthropic fetch failed', e?.message)
    return res.status(504).json({ error: 'Claude took too long. Try again.' })
  }

  // 5) Record usage for the meter (doesn't block the reply on failure).
  const usage = data.usage || {}
  await supa('/rest/v1/rpc/ai_record_tokens', token, {
    hh: householdId,
    in_tok: (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
    out_tok: usage.output_tokens || 0,
  }).catch(() => {})

  if (data.stop_reason === 'refusal') {
    return res.status(200).json({ reply: 'Sorry, I can’t help with that one.', actions: [] })
  }
  const blocks = Array.isArray(data.content) ? data.content : []
  const reply = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  const actions = blocks.filter((b) => b.type === 'tool_use' && TOOLS[b.name]).map((b) => ({ name: b.name, input: b.input || {} }))
  return res.status(200).json({ reply, actions, used_today: Number(counted.json), limit: DAILY_LIMIT })
}
