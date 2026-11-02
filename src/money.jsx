import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { Sheet } from './components'
import { logPurchase } from './ai'
import { localDate, localMonth } from './dates'

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`
const money0 = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`
const monthKey = (d) => String(d).slice(0, 7)
const thisMonth = () => localMonth()
const shiftMonth = (key, by) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + by, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthName = (key, opts = { month: 'long', year: 'numeric' }) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, opts) }
const shortDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const CAT_ICON = { Produce: '🥦', 'Meat & Seafood': '🥩', 'Dairy & Eggs': '🥛', Bakery: '🍞', Pantry: '🥫', Frozen: '🧊', Snacks: '🍿', Drinks: '🥤', Household: '🧻', 'Personal care': '🧴', Other: '🛒', 'Not itemized': '🧾' }

export function monthStats(ctx, key) {
  const trips = ctx.purchases.filter((p) => monthKey(p.purchased_on) === key)
  const total = trips.reduce((a, p) => a + Number(p.total || 0), 0)
  const ids = new Set(trips.map((p) => p.id))
  const lines = ctx.purchase_items.filter((i) => ids.has(i.purchase_id))
  const byCat = {}
  lines.forEach((i) => { const c = i.category || 'Other'; byCat[c] = (byCat[c] || 0) + Number(i.price || 0) })
  // Money on trips without item prices (manual trips, or receipts missing line prices)
  const itemized = Object.values(byCat).reduce((a, b) => a + b, 0)
  if (total - itemized > 0.5) byCat['Not itemized'] = total - itemized
  const byStore = {}
  trips.forEach((p) => { const s = p.store || 'Unknown store'; byStore[s] = (byStore[s] || 0) + Number(p.total || 0) })
  return { trips, total, byCat, byStore }
}

export function priceHistory(ctx, itemId) {
  const trips = new Map(ctx.purchases.map((p) => [p.id, p]))
  return ctx.purchase_items
    .filter((i) => i.item_id === itemId && i.price != null)
    .map((i) => ({ ...i, trip: trips.get(i.purchase_id) }))
    .filter((i) => i.trip)
    .sort((a, b) => b.trip.purchased_on.localeCompare(a.trip.purchased_on))
}

export function PriceHistory({ ctx, itemId }) {
  const h = priceHistory(ctx, itemId)
  if (!h.length) return null
  const unitPrice = (i) => Number(i.price) / (Number(i.quantity) || 1)
  const last = h[0]
  const avg = h.reduce((a, i) => a + unitPrice(i), 0) / h.length
  return (
    <div className="price-hist">
      <b>Last paid {money(last.price)}</b>{last.trip.store ? ` at ${last.trip.store}` : ''} · {shortDate(last.trip.purchased_on)}
      {h.length > 1 && <span className="muted"> · usually {money(avg)}{last.unit && last.unit !== 'ct' ? `/${last.unit}` : ' each'}</span>}
    </div>
  )
}

function Bar({ value, max, warn }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div className="bar"><div className={`bar-fill ${warn ? 'warn' : ''}`} style={{ width: `${pct}%` }} /></div>
}

export function BudgetCard({ ctx, onOpen }) {
  const { total } = monthStats(ctx, thisMonth())
  const budget = ctx.budget || 0
  const over = budget && total > budget
  return (
    <button className="budget-card" onClick={onOpen}>
      <div className="row between">
        <span className="budget-label">{monthName(thisMonth(), { month: 'long' })} groceries</span>
        <span className="budget-arrow">›</span>
      </div>
      <div className="budget-nums"><b className={over ? 'over' : ''}>{money0(total)}</b><span> of {money0(budget)}</span></div>
      <Bar value={total} max={budget} warn={over || total > budget * 0.9} />
      <span className="muted small">{budget ? (over ? `${money0(total - budget)} over budget` : `${money0(budget - total)} left this month`) : 'Set a budget in the Family tab'}</span>
    </button>
  )
}

export function SpendingSheet({ ctx, onClose, onOpenTrip, onLogTrip }) {
  const [key, setKey] = useState(thisMonth())
  const s = useMemo(() => monthStats(ctx, key), [ctx, key])
  const prev = useMemo(() => monthStats(ctx, shiftMonth(key, -1)), [ctx, key])
  const budget = ctx.budget || 0
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1])
  const stores = Object.entries(s.byStore).sort((a, b) => b[1] - a[1])
  const maxCat = cats[0]?.[1] || 0
  const isNow = key === thisMonth()
  const delta = s.total - prev.total

  return (
    <Sheet title="Grocery spending" onClose={onClose} full>
      <div className="month-nav">
        <button onClick={() => setKey(shiftMonth(key, -1))} aria-label="Previous month">‹</button>
        <b>{monthName(key)}</b>
        <button onClick={() => setKey(shiftMonth(key, 1))} disabled={isNow} aria-label="Next month">›</button>
      </div>
      <div className="spend-hero">
        <div className="budget-nums big"><b className={budget && s.total > budget ? 'over' : ''}>{money(s.total)}</b>{budget ? <span> of {money0(budget)}</span> : null}</div>
        {budget > 0 && <Bar value={s.total} max={budget} warn={s.total > budget * 0.9} />}
        <div className="row between small">
          <span className="muted">{s.trips.length} trip{s.trips.length === 1 ? '' : 's'}</span>
          {prev.total > 0 && <span className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '▲' : '▼'} {money0(Math.abs(delta))} vs {monthName(shiftMonth(key, -1), { month: 'short' })}</span>}
        </div>
      </div>
      <button className="secondary big" style={{ marginTop: 12 }} onClick={onLogTrip}>＋ Log a trip without a receipt</button>

      {cats.length > 0 && (
        <section className="group">
          <div className="group-head"><span>By category</span></div>
          <div className="group-card">
            {cats.map(([c, v]) => (
              <div className="cat-row" key={c}>
                <span className="cat-icon">{CAT_ICON[c] || '🛒'}</span>
                <span className="cat-body">
                  <span className="row between"><span>{c}</span><b>{money(v)}</b></span>
                  <Bar value={v} max={maxCat} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {stores.length > 0 && (
        <section className="group">
          <div className="group-head"><span>By store</span></div>
          <div className="group-card">
            {stores.map(([st, v]) => <div className="simple-line" key={st}><span>{st}</span><b>{money(v)}</b></div>)}
          </div>
        </section>
      )}
      <section className="group">
        <div className="group-head"><span>Trips</span></div>
        <div className="group-card">
          {s.trips.length === 0 && <p className="group-empty">No trips logged {isNow ? 'yet this month. Snap a receipt from Home → “Just went shopping?”' : 'this month.'}</p>}
          {s.trips.map((p) => {
            const n = ctx.purchase_items.filter((i) => i.purchase_id === p.id).length
            return (
              <button className="simple-line trip" key={p.id} onClick={() => onOpenTrip(p)}>
                <span className="trip-main">
                  <span>{p.store || (p.source === 'manual' ? 'Shopping trip' : 'Receipt')}</span>
                  <span className="muted small">{shortDate(p.purchased_on)}{n ? ` · ${n} items` : p.note ? ` · ${p.note}` : ''}</span>
                </span>
                <b>{money(p.total)}</b>
              </button>
            )
          })}
        </div>
      </section>
    </Sheet>
  )
}

export function TripSheet({ ctx, trip: given, onClose }) {
  const trip = ctx.purchases.find((p) => p.id === given.id) || given
  const lines = ctx.purchase_items.filter((i) => i.purchase_id === trip.id)
  const del = async () => {
    if (!window.confirm('Delete this trip from your spending? (Items stay in the house.)')) return
    await supabase.from('purchases').delete().eq('id', trip.id)
    await Promise.all([ctx.reload('purchases'), ctx.reload('purchase_items')])
    onClose()
  }
  return (
    <Sheet title={trip.store || 'Shopping trip'} onClose={onClose}>
      <p className="hint">{new Date(trip.purchased_on + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <div className="group-card">
        {lines.map((i) => (
          <div className="simple-line" key={i.id}>
            <span>{i.name}{i.quantity && Number(i.quantity) !== 1 ? <span className="muted"> × {Number(i.quantity)}{i.unit && i.unit !== 'ct' ? ` ${i.unit}` : ''}</span> : null}</span>
            <span>{i.price != null ? money(i.price) : '—'}</span>
          </div>
        ))}
        {trip.tax ? <div className="simple-line muted"><span>Tax</span><span>{money(trip.tax)}</span></div> : null}
        <div className="simple-line"><b>Total</b><b>{money(trip.total)}</b></div>
      </div>
      {trip.note && <p className="hint">{trip.note}</p>}
      <button className="danger" onClick={del}>Delete trip</button>
    </Sheet>
  )
}

export function LogTripSheet({ ctx, onClose, onToast }) {
  const [store, setStore] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(localDate())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const stores = [...new Set(ctx.purchases.map((p) => p.store).filter(Boolean))].slice(0, 6)
  const save = async (e) => {
    e.preventDefault()
    if (!(Number(amount) > 0)) return
    setBusy(true)
    try {
      await logPurchase(ctx, { store, total: amount, date, note, source: 'manual' })
      onToast({ text: `Logged ${money(amount)}${store ? ` at ${store}` : ''}` })
      onClose()
    } catch (ex) { onToast({ text: 'Couldn’t save: ' + ex.message }); setBusy(false) }
  }
  return (
    <Sheet title="Log a trip" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>How much?</label>
        <div className="money-input"><span>$</span><input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" /></div>
        <label>Where?</label>
        <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Store name" />
        {stores.length > 0 && <div className="chips">{stores.map((s) => <button type="button" key={s} className={`chip ${store === s ? 'on' : ''}`} onClick={() => setStore(s)}>{s}</button>)}</div>}
        <label>When?</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. milk & bread run" />
        <button className="primary big" disabled={busy || !(Number(amount) > 0)}>Save</button>
      </form>
    </Sheet>
  )
}

export function BudgetSetting({ ctx, householdId }) {
  const [val, setVal] = useState(String(ctx.budget || ''))
  const [saved, setSaved] = useState(false)
  const save = async () => {
    await supabase.from('households').update({ monthly_budget: Number(val) || 0 }).eq('id', householdId)
    await ctx.reload('households')
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  return (
    <section>
      <h3>Monthly grocery budget</h3>
      <div className="row">
        <div className="money-input" style={{ flex: 1 }}><span>$</span><input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        <button className="secondary" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</button>
      </div>
    </section>
  )
}
