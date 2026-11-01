import { supabase } from './supabase'

// All writes go through here. `ctx` = { householdId, userId, items, inventory, shopping_list, reload }

const norm = (s) => s.trim().toLowerCase()

export function findItem(ctx, name) {
  return ctx.items.find((i) => norm(i.name) === norm(name))
}

async function ensureItem(ctx, { name, unit, locationId, barcode, category }) {
  let item = findItem(ctx, name)
  if (item) {
    const patch = {}
    if (barcode && !item.barcode) patch.barcode = barcode
    if (locationId && item.default_location_id !== locationId) patch.default_location_id = locationId
    if (unit && item.default_unit !== unit) patch.default_unit = unit
    if (Object.keys(patch).length) {
      const { data } = await supabase.from('items').update(patch).eq('id', item.id).select().single()
      item = data || item
    }
    return item
  }
  const { data, error } = await supabase.from('items').insert({
    household_id: ctx.householdId,
    name: name.trim(),
    barcode: barcode || null,
    category: category || null,
    default_unit: unit || 'ct',
    default_location_id: locationId || null,
  }).select().single()
  if (error) {
    // Someone else added the same name a moment ago — use theirs.
    const { data: existing } = await supabase.from('items').select('*')
      .eq('household_id', ctx.householdId).ilike('name', name.trim()).maybeSingle()
    if (existing) return existing
    throw error
  }
  return data
}

export async function addToInventory(ctx, { name, quantity = 1, unit = 'ct', locationId, expiresOn, barcode, category }) {
  if (!name?.trim()) return
  const item = await ensureItem(ctx, { name, unit, locationId, barcode, category })
  const existing = ctx.inventory.find((r) =>
    r.item_id === item.id && r.location_id === (locationId || null) &&
    (r.expires_on || null) === (expiresOn || null) && r.unit === unit)
  if (existing) {
    await supabase.from('inventory').update({
      quantity: Number(existing.quantity) + Number(quantity),
      updated_by: ctx.userId, updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    await supabase.from('inventory').insert({
      household_id: ctx.householdId, item_id: item.id, location_id: locationId || null,
      quantity: Number(quantity), unit, expires_on: expiresOn || null,
      added_by: ctx.userId, updated_by: ctx.userId,
    })
  }
  await Promise.all([ctx.reload('items'), ctx.reload('inventory')])
  return item
}

export async function changeQty(ctx, row, delta) {
  const q = Math.max(0, Number(row.quantity) + delta)
  if (q === 0) return removeRow(ctx, row)
  await supabase.from('inventory').update({
    quantity: q, updated_by: ctx.userId, updated_at: new Date().toISOString(),
  }).eq('id', row.id)
  await ctx.reload('inventory')
}

export async function removeRow(ctx, row) {
  await supabase.from('inventory').delete().eq('id', row.id)
  await Promise.all([ctx.reload('inventory'), ctx.reload('shopping_list')])
}

export async function updateRow(ctx, row, patch) {
  await supabase.from('inventory').update({
    ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString(),
  }).eq('id', row.id)
  await ctx.reload('inventory')
}

export async function updateItem(ctx, itemId, patch) {
  await supabase.from('items').update(patch).eq('id', itemId)
  await ctx.reload('items')
}

export function onList(ctx, itemId, name) {
  return ctx.shopping_list.some((l) => !l.checked &&
    (itemId ? l.item_id === itemId : norm(l.name) === norm(name)))
}

export async function addToList(ctx, { name, itemId, quantity = 1, unit }) {
  if (!name?.trim()) return
  const item = itemId ? ctx.items.find((i) => i.id === itemId) : findItem(ctx, name)
  if (onList(ctx, item?.id, name)) return
  // Double-check the server (the low-stock rule may have just added it).
  let dupe = supabase.from('shopping_list').select('id').eq('household_id', ctx.householdId).eq('checked', false)
  dupe = item ? dupe.eq('item_id', item.id) : dupe.ilike('name', name.trim())
  const { data: existing } = await dupe.limit(1)
  if (existing?.length) { await ctx.reload('shopping_list'); return }
  await supabase.from('shopping_list').insert({
    household_id: ctx.householdId, item_id: item?.id || null, name: item?.name || name.trim(),
    quantity, unit: unit || item?.default_unit || 'ct', added_by: ctx.userId,
  })
  await ctx.reload('shopping_list')
}

// Checking off = bought. Put it back into inventory.
export async function checkOff(ctx, entry, locationId) {
  await supabase.from('shopping_list').update({
    checked: true, checked_by: ctx.userId, checked_at: new Date().toISOString(),
  }).eq('id', entry.id)
  await addToInventory(ctx, {
    name: entry.name, quantity: entry.quantity, unit: entry.unit, locationId,
  })
  await ctx.reload('shopping_list')
}

export async function uncheck(ctx, entry) {
  await supabase.from('shopping_list').update({ checked: false, checked_by: null, checked_at: null }).eq('id', entry.id)
  await ctx.reload('shopping_list')
}

export async function deleteListEntry(ctx, entry) {
  await supabase.from('shopping_list').delete().eq('id', entry.id)
  await ctx.reload('shopping_list')
}

export async function clearBought(ctx) {
  await supabase.from('shopping_list').delete().eq('household_id', ctx.householdId).eq('checked', true)
  await ctx.reload('shopping_list')
}

// Barcode lookup: our own catalog first, then Open Food Facts (free).
export async function lookupBarcode(ctx, code) {
  const mine = ctx.items.find((i) => i.barcode === code)
  if (mine) return { name: mine.name, item: mine }
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity`)
    const json = await res.json()
    if (json.status === 1 && json.product?.product_name) {
      const brand = json.product.brands?.split(',')[0]?.trim()
      const name = brand && !json.product.product_name.toLowerCase().includes(brand.toLowerCase())
        ? `${brand} ${json.product.product_name}` : json.product.product_name
      return { name }
    }
  } catch { /* offline or not found */ }
  return { name: '' }
}
