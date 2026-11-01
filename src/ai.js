// Talking to Claude through the app's server endpoint, plus helpers to carry out what Claude proposes.
import { supabase } from './supabase'
import { LIBRARY } from './library'
import { addToInventory, addToList, removeRow } from './actions'
import { matchItem, parseIngredient, keyWords } from './recipes'

// A compact text snapshot of the household for Claude.
export function buildContext(ctx, locations) {
  const loc = (id) => locations.find((l) => l.id === id)?.name || 'Unsorted'
  const itemName = (id) => ctx.items.find((i) => i.id === id)?.name || '?'
  const inv = ctx.inventory
    .map((r) => `- ${itemName(r.item_id)}: ${Number(r.quantity)} ${r.unit} (${loc(r.location_id)}${r.expires_on ? `, expires ${r.expires_on}` : ''})`)
    .sort()
  const list = ctx.shopping_list.filter((l) => !l.checked).map((l) => `- ${l.name}`)
  const mine = ctx.recipes.map((r) => `- ${r.title}: ${(r.ingredients || []).map((i) => i.name).join(', ')}`)
  const savedTitles = new Set(ctx.recipes.map((r) => r.title.toLowerCase()))
  const lib = LIBRARY.filter((r) => !savedTitles.has(r.title.toLowerCase()))
    .map((r) => `- ${r.title} [${r.tags.join(', ')}]: ${r.ingredients.map((i) => i.name).join(', ')}`)
  return [
    `Locations: ${locations.map((l) => l.name).join(', ')}`,
    `\nInventory (${inv.length} items):\n${inv.join('\n') || '(empty)'}`,
    `\nShopping list:\n${list.join('\n') || '(empty)'}`,
    `\nSaved family recipes:\n${mine.join('\n') || '(none yet)'}`,
    `\nBuilt-in recipe library (in the app's Browse tab):\n${lib.join('\n')}`,
  ].join('\n')
}

export async function askClaude({ ctx, locations, mode = 'chat', messages, text, image }) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode, householdId: ctx.householdId, context: buildContext(ctx, locations), messages, text, image }),
  })
  let json = {}
  try { json = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error(json.error || 'Claude couldn’t answer right now.')
  return json
}

// Shrink a photo before sending (keeps it fast and under size limits).
export function photoToBase64(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      const url = c.toDataURL('image/jpeg', 0.82)
      URL.revokeObjectURL(img.src)
      resolve({ media_type: 'image/jpeg', data: url.split(',')[1] })
    }
    img.onerror = () => reject(new Error('Couldn’t read that photo.'))
    img.src = URL.createObjectURL(file)
  })
}

const isoInDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const findLocation = (locations, name) => {
  const n = String(name || '').toLowerCase()
  return locations.find((l) => l.name.toLowerCase() === n)?.id ||
    locations.find((l) => n.includes(l.name.toLowerCase()) || l.name.toLowerCase().includes(n))?.id ||
    locations.find((l) => l.name === 'Pantry')?.id || locations[0]?.id
}

// Turn Claude's add_to_inventory items into editable rows for the confirm screen.
export function toInventoryRows(items, locations) {
  return (items || []).filter((i) => i?.name).map((i, k) => ({
    key: k,
    name: String(i.name).trim(),
    quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
    unit: i.unit || 'ct',
    locationId: findLocation(locations, i.location),
    expiresOn: Number.isFinite(Number(i.expires_in_days)) && i.expires_in_days != null ? isoInDays(Number(i.expires_in_days)) : '',
  }))
}

export async function applyInventoryRows(ctx, rows) {
  // Run one at a time so repeated items merge correctly.
  let local = { ...ctx }
  for (const r of rows) {
    await addToInventory(local, { name: r.name, quantity: r.quantity, unit: r.unit, locationId: r.locationId, expiresOn: r.expiresOn || null })
    const { data: items } = await supabase.from('items').select('*').eq('household_id', ctx.householdId)
    const { data: inventory } = await supabase.from('inventory').select('*').eq('household_id', ctx.householdId)
    local = { ...local, items: items || local.items, inventory: inventory || local.inventory }
  }
}

export async function applyShopping(ctx, items) {
  let n = 0
  for (const i of items || []) {
    if (!i?.name) continue
    const match = matchItem(i.name, ctx.items)
    await addToList(ctx, { name: match?.name || i.name, itemId: match?.id, quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1 })
    n++
  }
  return n
}

export async function applyRemovals(ctx, items) {
  const removed = []
  for (const i of items || []) {
    const item = matchItem(i?.name || '', ctx.items.filter((it) => ctx.inventory.some((r) => r.item_id === it.id)))
    if (!item) continue
    for (const row of ctx.inventory.filter((r) => r.item_id === item.id)) await removeRow(ctx, row)
    removed.push(item.name)
  }
  return removed
}

// Claude's create_recipe → the shape the recipe form expects.
export function toRecipeDraft(input) {
  return {
    title: input.title || 'Untitled recipe',
    servings: input.servings ?? null,
    prep_minutes: input.prep_minutes ?? null,
    cook_minutes: input.cook_minutes ?? null,
    tags: Array.isArray(input.tags) ? input.tags : [],
    ingredients: (input.ingredients || []).map(String),
    steps: (input.steps || []).map(String),
    notes: input.notes || '',
  }
}

export async function saveRecipeDraft(ctx, draft) {
  const { data, error } = await supabase.from('recipes').insert({
    household_id: ctx.householdId, created_by: ctx.userId,
    title: draft.title, servings: draft.servings, prep_minutes: draft.prep_minutes, cook_minutes: draft.cook_minutes,
    tags: draft.tags, ingredients: draft.ingredients.map(parseIngredient), steps: draft.steps, notes: draft.notes || null,
  }).select().single()
  if (error) throw error
  await ctx.reload('recipes')
  return data
}

export const describeItems = (items) => (items || []).map((i) => i.name).filter(Boolean)
export { keyWords }
