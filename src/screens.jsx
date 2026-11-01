import { useMemo, useState } from 'react'
import { ExpiryBadge, daysUntil, Sheet, LocationChips } from './components'
import {
  changeQty, removeRow, addToList, onList, checkOff, uncheck, deleteListEntry, clearBought,
} from './actions'
import { supabase } from './supabase'

const fmt = (n) => (Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(1))

export function InventoryRow({ ctx, row, showLocation, locations, onEdit, onToast }) {
  const item = ctx.items.find((i) => i.id === row.item_id)
  const loc = locations.find((l) => l.id === row.location_id)
  const listed = onList(ctx, item?.id)
  if (!item) return null

  const used = async () => {
    await removeRow(ctx, row)
    const stillHave = ctx.inventory.some((r) => r.item_id === item.id && r.id !== row.id)
    if (!stillHave && !onList(ctx, item.id)) {
      onToast({ text: `Used up ${item.name}`, action: { label: 'Add to list', run: () => addToList(ctx, { name: item.name, itemId: item.id }) } })
    } else onToast({ text: `Used up ${item.name}` })
  }
  const low = async () => {
    await addToList(ctx, { name: item.name, itemId: item.id })
    onToast({ text: `${item.name} added to shopping list` })
  }

  return (
    <div className="inv-row">
      <button className="inv-main" onClick={() => onEdit(row)}>
        <span className="inv-name">{item.name}</span>
        <span className="inv-meta">
          {fmt(row.quantity)} {row.unit}
          {showLocation && loc && <> · {loc.icon} {loc.name}</>}
          {listed && <> · 🛒</>}
        </span>
        <ExpiryBadge date={row.expires_on} />
      </button>
      <div className="inv-actions">
        <button aria-label="One less" onClick={() => changeQty(ctx, row, -1)}>−</button>
        <button aria-label="One more" onClick={() => changeQty(ctx, row, 1)}>+</button>
        <button className={`low ${listed ? 'on' : ''}`} onClick={low} disabled={listed}>Low</button>
        <button className="used" onClick={used}>Used</button>
      </div>
    </div>
  )
}

function totals(ctx) {
  const t = {}
  ctx.inventory.forEach((r) => { t[r.item_id] = (t[r.item_id] || 0) + Number(r.quantity) })
  return t
}

export function HomeScreen({ ctx, locations, onAdd, onScan, onEdit, onToast }) {
  const [q, setQ] = useState('')
  const itemName = (r) => ctx.items.find((i) => i.id === r.item_id)?.name || ''

  const results = q.trim()
    ? ctx.inventory.filter((r) => itemName(r).toLowerCase().includes(q.trim().toLowerCase()))
    : []
  const expiring = ctx.inventory
    .filter((r) => r.expires_on && daysUntil(r.expires_on) <= 3)
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on))
  const t = totals(ctx)
  const runningLow = ctx.items.filter((i) => i.low_threshold !== null && (t[i.id] || 0) <= Number(i.low_threshold))
  const missingFromSearch = q.trim() && results.length === 0

  return (
    <div className="screen">
      <input className="search" placeholder="🔍 Do we have…?" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() ? (
        <section>
          {results.map((r) => <InventoryRow key={r.id} ctx={ctx} row={r} showLocation locations={locations} onEdit={onEdit} onToast={onToast} />)}
          {missingFromSearch && (
            <div className="empty">
              <p>Nope, no “{q.trim()}” in the house.</p>
              <button className="secondary" onClick={async () => { await addToList(ctx, { name: q }); onToast({ text: `${q.trim()} added to shopping list` }); setQ('') }}>🛒 Add to shopping list</button>
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="big-actions">
            <button className="primary huge" onClick={onAdd}>＋ Add</button>
            <button className="primary huge alt" onClick={onScan}>📷 Scan</button>
          </div>
          <section>
            <h3>⏰ Expiring soon</h3>
            {expiring.length === 0 ? <p className="muted">Nothing expiring in the next 3 days.</p>
              : expiring.map((r) => <InventoryRow key={r.id} ctx={ctx} row={r} showLocation locations={locations} onEdit={onEdit} onToast={onToast} />)}
          </section>
          <section>
            <h3>📉 Running low</h3>
            {runningLow.length === 0 ? <p className="muted">Nothing low. Set a “low” level on any item by tapping it.</p>
              : runningLow.map((i) => (
                <div className="simple-row" key={i.id}>
                  <span>{i.name} <span className="muted">({fmt(t[i.id] || 0)} left)</span></span>
                  {onList(ctx, i.id) ? <span className="muted">🛒 On list</span>
                    : <button className="chip" onClick={() => addToList(ctx, { name: i.name, itemId: i.id })}>Add to list</button>}
                </div>
              ))}
          </section>
        </>
      )}
    </div>
  )
}

export function InventoryScreen({ ctx, locations, onEdit, onToast, onAdd }) {
  const [locId, setLocId] = useState('all')
  const rows = useMemo(() => {
    const name = (r) => ctx.items.find((i) => i.id === r.item_id)?.name || ''
    return ctx.inventory
      .filter((r) => locId === 'all' || r.location_id === locId)
      .sort((a, b) => name(a).localeCompare(name(b)))
  }, [ctx.inventory, ctx.items, locId])

  return (
    <div className="screen">
      <div className="tabs-scroll">
        <button className={`chip ${locId === 'all' ? 'on' : ''}`} onClick={() => setLocId('all')}>All</button>
        {locations.map((l) => {
          const n = ctx.inventory.filter((r) => r.location_id === l.id).length
          return (
            <button key={l.id} className={`chip ${locId === l.id ? 'on' : ''}`} onClick={() => setLocId(l.id)}>
              {l.icon} {l.name} {n > 0 && <span className="count">{n}</span>}
            </button>
          )
        })}
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p>Nothing here yet.</p>
          <button className="secondary" onClick={() => onAdd(locId === 'all' ? undefined : locId)}>＋ Add something</button>
        </div>
      ) : rows.map((r) => (
        <InventoryRow key={r.id} ctx={ctx} row={r} showLocation={locId === 'all'} locations={locations} onEdit={onEdit} onToast={onToast} />
      ))}
    </div>
  )
}

export function ShoppingScreen({ ctx, locations, members, onToast }) {
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(null) // list entry waiting for a location
  const open = ctx.shopping_list.filter((l) => !l.checked)
  const bought = ctx.shopping_list.filter((l) => l.checked)
  const who = (id) => members.find((m) => m.user_id === id)?.display_name

  const add = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    await addToList(ctx, { name: text })
    setText('')
  }

  const tick = async (entry) => {
    const item = ctx.items.find((i) => i.id === entry.item_id) ||
      ctx.items.find((i) => i.name.toLowerCase() === entry.name.toLowerCase())
    if (item?.default_location_id) {
      await checkOff(ctx, entry, item.default_location_id)
      const loc = locations.find((l) => l.id === item.default_location_id)
      onToast({ text: `${entry.name} → ${loc?.icon || ''} ${loc?.name || 'house'}` })
    } else setPicking(entry)
  }

  return (
    <div className="screen">
      <form className="row add-row" onSubmit={add}>
        <input className="big-input" placeholder="Add to list…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary">Add</button>
      </form>
      {open.length === 0 && <p className="muted center">List is empty. 🎉</p>}
      {open.map((l) => (
        <div className="list-row" key={l.id}>
          <button className="check" onClick={() => tick(l)} aria-label="Bought" />
          <div className="list-text">
            <span>{l.name}{Number(l.quantity) !== 1 && <span className="muted"> × {fmt(l.quantity)}</span>}</span>
            <span className="muted small">{l.auto ? 'Auto: running low' : who(l.added_by) ? `Added by ${who(l.added_by)}` : ''}</span>
          </div>
          <button className="icon-btn" onClick={() => deleteListEntry(ctx, l)} aria-label="Remove">✕</button>
        </div>
      ))}
      {bought.length > 0 && (
        <section>
          <div className="row between">
            <h3>Bought</h3>
            <button className="chip" onClick={() => clearBought(ctx)}>Clear</button>
          </div>
          {bought.map((l) => (
            <div className="list-row done" key={l.id}>
              <button className="check on" onClick={() => uncheck(ctx, l)} aria-label="Not bought">✓</button>
              <div className="list-text">
                <span>{l.name}</span>
                <span className="muted small">{who(l.checked_by) ? `Got it: ${who(l.checked_by)}` : ''}</span>
              </div>
            </div>
          ))}
        </section>
      )}
      {picking && (
        <Sheet title={`Where does ${picking.name} go?`} onClose={() => setPicking(null)}>
          <LocationChips locations={locations} value={null} onChange={async (locId) => {
            const entry = picking; setPicking(null)
            await checkOff(ctx, entry, locId)
            onToast({ text: `${entry.name} added to house` })
          }} />
          <p className="hint">It'll remember this next time.</p>
        </Sheet>
      )}
    </div>
  )
}

export function SettingsScreen({ ctx, household, members, session }) {
  const [code, setCode] = useState(null)
  const me = members.find((m) => m.user_id === session.user.id)
  const [myName, setMyName] = useState(me?.display_name || '')

  const invite = async () => {
    const { data, error } = await supabase.rpc('create_invite', { hh: household.id })
    if (error) alert(error.message); else setCode(data)
  }
  const link = code ? `${window.location.origin}/?join=${code}` : ''

  return (
    <div className="screen">
      <section>
        <h3>🏠 {household.name}</h3>
        {members.map((m) => (
          <div className="simple-row" key={m.user_id}>
            <span>{m.display_name}{m.user_id === session.user.id && ' (you)'}</span>
            <span className="muted small">{m.role === 'owner' ? 'Owner' : 'Member'}</span>
          </div>
        ))}
      </section>
      <section>
        <h3>Invite family</h3>
        {!code ? <button className="primary big" onClick={invite}>Create invite link</button> : (
          <div className="invite">
            <div className="code">{code}</div>
            <p className="hint">Send them this link (good for 7 days):</p>
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="row">
              {navigator.share && <button className="secondary" onClick={() => navigator.share({ title: 'Join our kitchen', text: `Join our kitchen app! Code: ${code}`, url: link })}>Share…</button>}
              <button className="secondary" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
            </div>
          </div>
        )}
      </section>
      <section>
        <h3>Your name (what the family sees)</h3>
        <div className="row">
          <input value={myName} onChange={(e) => setMyName(e.target.value)} />
          <button className="secondary" onClick={async () => {
            await supabase.from('household_members').update({ display_name: myName.trim() })
              .eq('household_id', household.id).eq('user_id', session.user.id)
            ctx.reload('household_members')
          }}>Save</button>
        </div>
      </section>
      <ChangeEmail session={session} />
      <ChangePassword />
      <section>
        <p className="muted small">Signed in as {session.user.email}</p>
        <button className="danger" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    </div>
  )
}

function ChangePassword() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const save = async (e) => {
    e.preventDefault(); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setMsg(error.message)
    else { setMsg('Password updated. Use it to sign in on your other devices.'); setPw('') }
  }
  return (
    <section>
      <h3>Change password</h3>
      <form className="row" onSubmit={save}>
        <input type="password" autoComplete="new-password" placeholder="New password (6+ characters)"
          value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required />
        <button className="secondary">Save</button>
      </form>
      {msg && <p className="hint">{msg}</p>}
    </section>
  )
}

function ChangeEmail({ session }) {
  const [email, setEmail] = useState(session.user.email || '')
  const [msg, setMsg] = useState('')
  const save = async (e) => {
    e.preventDefault(); setMsg('')
    const next = email.trim().toLowerCase()
    if (next === session.user.email) { setMsg('That’s already your email.'); return }
    const { data, error } = await supabase.auth.updateUser({ email: next })
    if (error) setMsg(error.message)
    else if (data.user?.email === next) setMsg(`Email changed to ${next}. Use it to sign in from now on.`)
    else setMsg('Check both inboxes for a confirmation link to finish the change.')
  }
  return (
    <section>
      <h3>Sign-in email</h3>
      <form className="row" onSubmit={save}>
        <input type="email" inputMode="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <button className="secondary">Save</button>
      </form>
      {msg && <p className="hint">{msg}</p>}
    </section>
  )
}
