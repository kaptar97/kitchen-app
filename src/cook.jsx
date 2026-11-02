import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { Sheet } from './components'
import { checkRecipe, ingredientLine, fmtQty } from './recipes'
import { removeRow, updateRow } from './actions'

// ---------- Unit conversion between recipe amounts and inventory units ----------
const WEIGHT = { oz: 1, lb: 16, g: 0.035274, kg: 35.274 }
const VOLUME = { tsp: 1 / 48, tbsp: 1 / 16, cup: 1, pt: 2, qt: 4, gal: 16, ml: 1 / 236.6, l: 4.227 }
const COUNT = { ct: 1, dozen: 12, '': 1 }
const SAME = { can: ['can'], jar: ['jar'], pkg: ['pack', 'box', 'bag'], slice: ['ct'], stick: ['ct'], clove: [], head: ['ct'], bunch: ['ct'], bottle: ['bottle'] }

export function convert(qty, from, to) {
  if (qty == null) return null
  const f = from || ''
  if (f === to) return qty
  if (WEIGHT[f] && WEIGHT[to]) return (qty * WEIGHT[f]) / WEIGHT[to]
  if (VOLUME[f] && VOLUME[to]) return (qty * VOLUME[f]) / VOLUME[to]
  if (f in COUNT && to in COUNT) return (qty * COUNT[f]) / COUNT[to]
  if (SAME[f]?.includes(to)) return qty
  return null
}

const round = (n) => Math.round(n * 100) / 100
const unitLabel = (u, n) => (u === 'ct' ? '' : ` ${u}`) + (u === 'ct' && n !== 1 ? '' : '')

export function cookHistory(ctx, recipe) {
  const t = recipe.title.toLowerCase()
  const log = ctx.cook_log.filter((c) => (recipe.id && c.recipe_id === recipe.id) || c.recipe_title.toLowerCase() === t)
  return { count: log.length, last: log[0]?.made_at || null }
}

export function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

export function CookSheet({ ctx, recipe, servings, onClose, onToast }) {
  const base = Number(recipe.servings) || null
  const scale = base && servings ? servings / base : 1

  // Work out what each ingredient would take out of the house.
  const initial = useMemo(() => {
    return checkRecipe(recipe, ctx.items, ctx.inventory)
      .filter((i) => i.status === 'have')
      .map((ing, k) => {
        const rows = ctx.inventory.filter((r) => r.item_id === ing.item.id)
          .sort((a, b) => (a.expires_on || '9999').localeCompare(b.expires_on || '9999'))
        const unit = rows[0]?.unit || 'ct'
        const have = rows.filter((r) => r.unit === unit).reduce((a, r) => a + Number(r.quantity), 0)
        const amt = convert(ing.qty != null ? ing.qty * scale : null, ing.unit, unit)
        let mode = amt == null ? 'some' : 'exact'
        if (amt != null && amt >= have * 0.95) mode = 'all'
        return { k, ing, item: ing.item, rows, unit, have, amt: amt == null ? '' : String(round(amt)), mode }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState(false)
  const set = (k, patch) => setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...patch } : r)))
  const changing = rows.filter((r) => r.mode === 'all' || (r.mode === 'exact' && Number(r.amt) > 0)).length

  const done = async () => {
    setBusy(true)
    try {
      for (const r of rows) {
        if (r.mode === 'all') {
          for (const row of r.rows) await removeRow(ctx, row)
        } else if (r.mode === 'exact') {
          let left = Number(r.amt) || 0
          for (const row of r.rows.filter((x) => x.unit === r.unit)) {
            if (left <= 0) break
            const q = Number(row.quantity)
            if (left >= q - 1e-9) { await removeRow(ctx, row); left -= q } else { await updateRow(ctx, row, { quantity: round(q - left) }); left = 0 }
          }
        }
      }
      await supabase.from('cook_log').insert({
        household_id: ctx.householdId, recipe_id: recipe.library ? null : recipe.id, recipe_title: recipe.title,
        servings: servings || null, made_by: ctx.userId,
      })
      await Promise.all([ctx.reload('cook_log'), ctx.reload('shopping_list')])
      onToast({ text: changing ? `Nice! Updated ${changing} item${changing === 1 ? '' : 's'} in the house` : 'Nice! Logged it' })
      onClose()
    } catch (e) {
      onToast({ text: 'Couldn’t update: ' + e.message }); setBusy(false)
    }
  }

  return (
    <Sheet title={`🍳 Made ${recipe.title}`} onClose={onClose}>
      <p className="hint">Here’s what will come out of the house{base && servings !== base ? ` (scaled to ${servings} servings)` : ''}. Adjust anything that’s off.</p>
      {rows.length === 0 ? (
        <p className="group-empty">None of this recipe’s ingredients are tracked in the house, so there’s nothing to subtract. We’ll just log that you made it.</p>
      ) : (
        <div className="group-card">
          {rows.map((r) => (
            <div className="cook-row" key={r.k}>
              <div className="row between">
                <span className="cook-name">{r.item.name}</span>
                <span className="muted small">have {fmtQty(r.have)}{unitLabel(r.unit, r.have)}</span>
              </div>
              <span className="muted small">Recipe: {ingredientLine(r.ing, scale)}</span>
              <div className="cook-modes">
                {r.amt !== '' && (
                  <button className={r.mode === 'exact' ? 'on' : ''} onClick={() => set(r.k, { mode: 'exact' })}>
                    Used {r.mode === 'exact'
                      ? <input inputMode="decimal" value={r.amt} onClick={(e) => e.stopPropagation()} onChange={(e) => set(r.k, { amt: e.target.value.replace(/[^\d.]/g, '') })} />
                      : fmtQty(Number(r.amt))}{unitLabel(r.unit)}
                  </button>
                )}
                <button className={r.mode === 'all' ? 'on' : ''} onClick={() => set(r.k, { mode: 'all' })}>Used it all</button>
                <button className={r.mode === 'some' ? 'on' : ''} onClick={() => set(r.k, { mode: 'some' })}>Some left</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Anything that runs low goes on the shopping list automatically if it has a low-stock alert.</p>
      <button className="primary big" disabled={busy} onClick={done}>{busy ? 'Updating…' : 'Done'}</button>
    </Sheet>
  )
}
