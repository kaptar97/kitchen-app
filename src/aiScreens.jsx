import { useEffect, useRef, useState } from 'react'
import { Sheet, UNITS } from './components'
import { supabase } from './supabase'
import { localDate } from './dates'
import { matchItem } from './recipes'
import { locColor } from './theme'
import {
  askClaude, photoToBase64, toInventoryRows, applyInventoryRows, logPurchase, applyShopping, applyRemovals, toRecipeDraft, saveRecipeDraft, describeItems,
} from './ai'

export const Sparkle = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M12 2.5c.4 3.9 2.6 6.1 6.5 6.5-3.9.4-6.1 2.6-6.5 6.5-.4-3.9-2.6-6.1-6.5-6.5 3.9-.4 6.1-2.6 6.5-6.5Z" />
    <path d="M18.5 14c.2 2 1.3 3.1 3.3 3.3-2 .2-3.1 1.3-3.3 3.3-.2-2-1.3-3.1-3.3-3.3 2-.2 3.1-1.3 3.3-3.3Z" opacity=".7" />
  </svg>
)

const SUGGESTIONS = [
  'What can I make for dinner tonight?',
  'Use up what’s expiring soon',
  'Plan 5 dinners and add what I need to the list',
  'High-protein lunch ideas with what we have',
  'Write me a recipe with chicken and rice',
  '📷 Send a receipt photo and I’ll add what you bought',
]

// Conversation survives closing and reopening the chat (until the app is closed).
let savedChat = []

function summarize(actions) {
  return (actions || []).map((a) => {
    if (a.name === 'add_to_shopping_list') return `Proposed adding to shopping list: ${describeItems(a.input.items).join(', ')}`
    if (a.name === 'add_to_inventory') return `Proposed adding to inventory: ${describeItems(a.input.items).join(', ')}`
    if (a.name === 'remove_from_inventory') return `Proposed marking used up: ${describeItems(a.input.items).join(', ')}`
    if (a.name === 'create_recipe') return `Wrote recipe: ${a.input.title}`
    return ''
  }).filter(Boolean).map((s) => `(${s}${''})`).join('\n')
}

export function AskClaudeSheet({ ctx, locations, onClose, onToast, onOpenRecipe }) {
  const [msgs, setMsgs] = useState(savedChat)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  useEffect(() => { savedChat = msgs; endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, busy])

  const [photo, setPhoto] = useState(null) // { file, url }
  const fileRef = useRef(null)
  const send = async (q) => {
    const question = (q ?? text).trim() || (photo ? 'Here’s a photo. If it’s a receipt, add what I bought.' : '')
    if (!question || busy) return
    setText('')
    const sentPhoto = photo
    setPhoto(null)
    const next = [...msgs, { role: 'user', content: question, photoUrl: sentPhoto?.url }]
    setMsgs(next)
    setBusy(true)
    try {
      const history = next.map((m, i) => ({
        role: m.role,
        content: m.role === 'assistant' ? [m.content, summarize(m.actions)].filter(Boolean).join('\n') || '(ok)'
          : (m.photoUrl && i < next.length - 1 ? `${m.content}\n(sent a photo earlier)` : m.content),
      }))
      const image = sentPhoto ? await photoToBase64(sentPhoto.file) : undefined
      const r = await askClaude({ ctx, locations, mode: 'chat', messages: history, image })
      setMsgs([...next, { role: 'assistant', content: r.reply, actions: (r.actions || []).map((a) => ({ ...a, status: 'new' })) }])
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: e.message, error: true }])
    }
    setBusy(false)
  }

  const setStatus = (mi, ai, status, extra = {}) => setMsgs((all) => all.map((m, i) => i !== mi ? m
    : { ...m, actions: m.actions.map((a, j) => (j === ai ? { ...a, status, ...extra } : a)) }))

  const run = async (mi, ai) => {
    const a = msgs[mi].actions[ai]
    setStatus(mi, ai, 'working')
    try {
      if (a.name === 'add_to_shopping_list') {
        const n = await applyShopping(ctx, a.input.items)
        setStatus(mi, ai, 'done', { result: `Added ${n} to the list` })
      } else if (a.name === 'add_to_inventory') {
        const rows = toInventoryRows(a.input.items, locations)
        const itemIds = await applyInventoryRows(ctx, rows)
        const rc = a.input.receipt
        if (rc || rows.some((r) => r.price !== '')) {
          const trip = await logPurchase(ctx, { ...rc, items: rows, itemIds })
          setStatus(mi, ai, 'done', { result: `Added ${rows.length} to the house · logged $${Number(trip.total).toFixed(2)}${trip.store ? ` at ${trip.store}` : ''}` })
        } else setStatus(mi, ai, 'done', { result: `Added ${rows.length} to the house` })
      } else if (a.name === 'remove_from_inventory') {
        const gone = await applyRemovals(ctx, a.input.items)
        setStatus(mi, ai, 'done', { result: gone.length ? `Marked used up: ${gone.join(', ')}` : 'Couldn’t find those in the house' })
      } else if (a.name === 'create_recipe') {
        const saved = await saveRecipeDraft(ctx, toRecipeDraft(a.input))
        setStatus(mi, ai, 'done', { result: 'Saved to your recipes', saved })
      }
    } catch (e) {
      setStatus(mi, ai, 'new')
      onToast({ text: 'Couldn’t do that: ' + e.message })
    }
  }

  return (
    <Sheet title={<span className="ai-title"><Sparkle /> Ask Claude</span>} onClose={onClose} full>
      <div className="chat">
        {msgs.length === 0 && (
          <div className="chat-intro">
            <p>I can see what’s in your kitchen, your recipes and your shopping list. Ask me anything food-related. I can also update your list and inventory (you’ll confirm first).</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => (s.startsWith('📷') ? fileRef.current?.click() : send(s))}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, mi) => (
          <div key={mi} className={`bubble-wrap ${m.role}`}>
            {m.photoUrl && <img className="bubble-photo" src={m.photoUrl} alt="" />}
            {m.content && <div className={`bubble ${m.role} ${m.error ? 'error' : ''}`}>{m.content}</div>}
            {(m.actions || []).map((a, ai) => (
              <ActionCard key={ai} a={a} locations={locations} onRun={() => run(mi, ai)} onOpenRecipe={onOpenRecipe} />
            ))}
          </div>
        ))}
        {busy && <div className="bubble-wrap assistant"><div className="bubble assistant typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send() }}>
        {photo && (
          <div className="attach-preview">
            <img src={photo.url} alt="" />
            <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo">✕</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0]; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); e.target.value = ''
        }} />
        <button type="button" className="icon-btn attach" onClick={() => fileRef.current?.click()} aria-label="Add a photo">📷</button>
        <input placeholder={photo ? 'Add a note (optional)…' : 'Ask about dinner, recipes, groceries…'} value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="send" />
        <button className="primary" disabled={busy || (!text.trim() && !photo)} aria-label="Send">↑</button>
      </form>
      {msgs.length > 0 && <button className="link small-link" onClick={() => { setMsgs([]); savedChat = [] }}>Start a new chat</button>}
    </Sheet>
  )
}

function ActionCard({ a, locations, onRun, onOpenRecipe }) {
  const [open, setOpen] = useState(false)
  const done = a.status === 'done'
  const working = a.status === 'working'
  let icon, title, body, cta
  if (a.name === 'add_to_shopping_list') {
    icon = '🛒'; title = 'Add to shopping list'; cta = `Add ${a.input.items?.length || 0} items`
    body = <div className="pill-list">{describeItems(a.input.items).map((n, i) => <span key={i}>{n}</span>)}</div>
  } else if (a.name === 'add_to_inventory') {
    const rows = toInventoryRows(a.input.items, locations)
    icon = '📦'; title = 'Add to the house'; cta = `Add ${rows.length} items`
    body = <ul className="mini-list">{rows.map((r) => <li key={r.key}>{r.name} <span className="muted">· {r.quantity} {r.unit} · {locations.find((l) => l.id === r.locationId)?.name}</span></li>)}</ul>
  } else if (a.name === 'remove_from_inventory') {
    icon = '✓'; title = 'Mark as used up'; cta = 'Confirm'
    body = <div className="pill-list">{describeItems(a.input.items).map((n, i) => <span key={i}>{n}</span>)}</div>
  } else if (a.name === 'create_recipe') {
    const d = toRecipeDraft(a.input)
    icon = '📖'; title = d.title; cta = 'Save recipe'
    body = (
      <>
        <p className="muted small">{[d.servings && `${d.servings} servings`, (d.prep_minutes || d.cook_minutes) && `${(d.prep_minutes || 0) + (d.cook_minutes || 0)} min`, `${d.ingredients.length} ingredients`].filter(Boolean).join(' · ')}</p>
        <button className="text-btn" onClick={() => setOpen(!open)}>{open ? 'Hide recipe' : 'Show recipe'}</button>
        {open && (
          <div className="recipe-preview">
            <ul>{d.ingredients.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <ol>{d.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </div>
        )}
      </>
    )
  } else return null
  return (
    <div className={`action-card ${done ? 'done' : ''}`}>
      <div className="action-head"><span className="action-icon">{icon}</span><b>{title}</b></div>
      {body}
      {done ? (
        <div className="action-done">
          ✓ {a.result}
          {a.saved && <button className="text-btn" onClick={() => onOpenRecipe(a.saved)}>Open</button>}
        </div>
      ) : <button className="primary" disabled={working} onClick={onRun}>{working ? 'Working…' : cta}</button>}
    </div>
  )
}

// "I bought…" — one sentence in, a clean list out.
export function QuickAddSheet({ ctx, locations, onClose, onToast }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)
  const [receipt, setReceipt] = useState(null) // { store, date, total, tax }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const receiptRef = useRef(null)
  const shelfRef = useRef(null)
  const [shelfLoc, setShelfLoc] = useState(null) // location id while choosing a shelf photo
  const [isShelf, setIsShelf] = useState(false)
  const sort = async (file, kind) => {
    setBusy(true); setErr('')
    const shelfName = kind === 'shelf' ? locations.find((l) => l.id === shelfLoc)?.name : undefined
    try {
      const image = file ? await photoToBase64(file, 2000) : undefined
      const r = await askClaude({ ctx, locations, mode: 'quickadd', text: file ? '' : text, image, kind, location: shelfName })
      const input = r.actions?.find((a) => a.name === 'add_to_inventory')?.input
      const items = input?.items
      const next = toInventoryRows(items, locations)
      const rc = input?.receipt
      setIsShelf(kind === 'shelf')
      if (kind === 'shelf') {
        // Things already tracked start unticked so the photo doesn't double-count them.
        const inHouse = ctx.items.filter((it) => ctx.inventory.some((x) => x.item_id === it.id))
        next.forEach((row) => {
          if (shelfLoc) row.locationId = shelfLoc
          const m = matchItem(row.name, inHouse)
          row.existing = m ? m.name : null
          row.include = !m
        })
      }
      setReceipt(kind !== 'shelf' && (file || rc) ? {
        store: rc?.store || '', date: /^\d{4}-\d{2}-\d{2}$/.test(rc?.date || '') ? rc.date : localDate(),
        total: rc?.total != null ? Number(rc.total).toFixed(2) : '', tax: rc?.tax ?? null,
      } : null)
      if (!next.length) setErr(kind === 'shelf' ? 'Claude couldn’t make out items in that photo. Try a closer, brighter shot of one shelf.' : file ? 'Couldn’t read items from that photo. Try a closer, flatter, well-lit shot.' : 'Claude didn’t find any items. Try listing them like “2 gallons milk, dozen eggs”.')
      else setRows(next)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const chosen = rows ? rows.filter((r) => r.include !== false) : []
  const addAll = async () => {
    setBusy(true)
    const rows = chosen
    try {
      const itemIds = await applyInventoryRows(ctx, rows)
      if (receipt) {
        const trip = await logPurchase(ctx, { ...receipt, items: rows, itemIds })
        onToast({ text: `Added ${rows.length} items · logged $${Number(trip.total).toFixed(2)}${trip.store ? ` at ${trip.store}` : ''}` })
      } else onToast({ text: `Added ${rows.length} item${rows.length === 1 ? '' : 's'} to the house` })
      onClose()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title={<span className="ai-title"><Sparkle /> Add a bunch at once</span>} onClose={onClose}>
      {!rows ? (
        <div className="form">
          <input ref={receiptRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sort(f) }} />
          <input ref={shelfRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sort(f, 'shelf') }} />
          <button className="secondary big ai-btn" disabled={busy} onClick={() => receiptRef.current?.click()}>{busy ? 'Reading…' : '🧾 Snap a receipt'}</button>
          {shelfLoc === null ? (
            <button className="secondary big ai-btn" disabled={busy} onClick={() => setShelfLoc(locations.find((l) => /fridge/i.test(l.name))?.id || locations[0]?.id)}>📷 Photo of your fridge or pantry</button>
          ) : (
            <div className="shelf-pick">
              <p className="hint">Where’s the photo of?</p>
              <div className="chips">
                {locations.map((l) => (
                  <button type="button" key={l.id} style={{ '--loc': locColor(l.name) }} className={`chip loc-chip ${shelfLoc === l.id ? 'on' : ''}`} onClick={() => setShelfLoc(l.id)}>
                    <span className="loc-dot" />{l.name}
                  </button>
                ))}
              </div>
              <button className="primary big" disabled={busy} onClick={() => shelfRef.current?.click()}>{busy ? 'Claude is looking…' : '📷 Take the photo'}</button>
              <p className="hint">Open the door, step back so a whole shelf or two is in frame, good light helps. Claude lists what it can see; you check it over.</p>
            </div>
          )}
          <div className="or"><span>or type it</span></div>
          <p className="hint">Type or say what you bought. Claude sorts it into items, picks where each goes, and guesses expiration dates.</p>
          <textarea className="big-text" rows={5} autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder="2 gallons milk, dozen eggs, 3 lb chicken thighs, bananas, paper towels, 2 boxes pasta" />
          <p className="hint">Tip: tap the 🎤 on your keyboard to talk instead of typing.</p>
          <button className="primary big" disabled={busy || !text.trim()} onClick={() => sort()}>{busy ? 'Sorting…' : <><Sparkle /> Sort it out</>}</button>
          {err && <p className="error">{err}</p>}
        </div>
      ) : (
        <div className="form">
          <p className="hint">{isShelf ? 'Here’s what Claude spotted. Things already in the house are unticked so nothing gets counted twice.' : 'Check it over, fix anything, then add.'}</p>
          {receipt && (
            <div className="receipt-box">
              <div className="row">
                <input placeholder="Store" value={receipt.store} onChange={(e) => setReceipt({ ...receipt, store: e.target.value })} />
                <input type="date" value={receipt.date} onChange={(e) => setReceipt({ ...receipt, date: e.target.value })} />
              </div>
              <div className="row">
                <span className="muted">Total paid $</span>
                <input inputMode="decimal" value={receipt.total} onChange={(e) => setReceipt({ ...receipt, total: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0.00" />
              </div>
              <p className="hint">This trip will be logged in your grocery spending.</p>
            </div>
          )}
          <div className="qa-rows">
            {rows.map((r) => (
              <div className={`qa-row ${r.include === false ? 'off' : ''}`} key={r.key}>
                <div className="row">
                  {isShelf && <button type="button" className={`check ${r.include !== false ? 'on' : ''}`} onClick={() => update(r.key, { include: r.include === false })} aria-label="Include">{r.include !== false ? '✓' : ''}</button>}
                  <input className="qa-name" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
                  <button className="icon-btn" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove">✕</button>
                </div>
                {r.existing && <span className="already">Already in the house as “{r.existing}”. Tick to add more</span>}
                <div className="qa-meta">
                  <input inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                  <select value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                  <select value={r.locationId} onChange={(e) => update(r.key, { locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                  <input type="date" value={r.expiresOn} onChange={(e) => update(r.key, { expiresOn: e.target.value })} />
                  {receipt && <span className="price-in">$<input inputMode="decimal" placeholder="price" value={r.price} onChange={(e) => update(r.key, { price: e.target.value.replace(/[^\d.]/g, '') })} /></span>}
                </div>
              </div>
            ))}
          </div>
          <button className="primary big" disabled={busy || !chosen.length} onClick={addAll}>{busy ? 'Adding…' : `Add ${chosen.length} item${chosen.length === 1 ? '' : 's'}`}</button>
          <button className="link" onClick={() => { setRows(null); setReceipt(null); setIsShelf(false) }}>Back</button>
          {err && <p className="error">{err}</p>}
        </div>
      )}
    </Sheet>
  )
}

// Family tab: how much Claude has been used.
export function ClaudeUsage({ householdId }) {
  const [u, setU] = useState(null)
  useEffect(() => {
    const first = new Date(); first.setDate(1)
    supabase.from('ai_usage').select('*').eq('household_id', householdId).gte('day', first.toISOString().slice(0, 10))
      .then(({ data }) => {
        const rows = data || []
        const today = new Date().toISOString().slice(0, 10)
        const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0)
        setU({
          month: sum('requests'),
          today: rows.find((r) => r.day === today)?.requests || 0,
          cost: (sum('input_tokens') * 0.10 + sum('output_tokens') * 0.50) / 1e6,
        })
      })
  }, [householdId])
  if (!u) return null
  return (
    <section className="group">
      <div className="group-head"><span><Sparkle size={13} /> Claude usage</span></div>
      <div className="group-card usage">
        <div><b>{u.month}</b><span>questions this month</span></div>
        <div><b>${u.cost < 0.01 && u.cost > 0 ? '<0.01' : u.cost.toFixed(2)}</b><span>estimated cost</span></div>
        <div><b>{u.today}/100</b><span>today’s limit</span></div>
      </div>
    </section>
  )
}
