import { useMemo, useState } from 'react'
import { daysUntil, Sheet, LocationChips } from './components'
import {
  changeQty, removeRow, addToList, onList, checkOff, uncheck, deleteListEntry, clearBought,
} from './actions'
import { supabase } from './supabase'
import { itemIcon } from './icons'
import { locColor } from './theme'
import { Sparkle, ClaudeUsage } from './aiScreens'
import { BudgetCard, PriceHistory, BudgetSetting } from './money'

const fmt = (n) => (Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(1))

function expiryText(date) {
  const n = daysUntil(date)
  if (n === null) return null
  if (n < 0) return { text: `Expired ${-n === 1 ? 'yesterday' : `${-n} days ago`}`, cls: 'bad' }
  if (n === 0) return { text: 'Expires today', cls: 'bad' }
  if (n === 1) return { text: 'Expires tomorrow', cls: 'warn' }
  if (n <= 3) return { text: `Expires in ${n} days`, cls: 'warn' }
  return { text: `Expires ${new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, cls: '' }
}

// One item in a grouped list: icon · name/details · quantity stepper. Tap the row for more actions.
export function InventoryRow({ ctx, row, showLocation, locations, onOpen, onToast }) {
  const item = ctx.items.find((i) => i.id === row.item_id)
  const loc = locations.find((l) => l.id === row.location_id)
  if (!item) return null
  const listed = onList(ctx, item.id)
  const exp = expiryText(row.expires_on)

  const minus = async () => {
    if (Number(row.quantity) <= 1) {
      await removeRow(ctx, row)
      const stillHave = ctx.inventory.some((r) => r.item_id === item.id && r.id !== row.id)
      onToast(stillHave || listed ? { text: `Used up ${item.name}` }
        : { text: `Used up ${item.name}`, action: { label: 'Add to list', run: () => addToList(ctx, { name: item.name, itemId: item.id }) } })
    } else changeQty(ctx, row, -1)
  }

  return (
    <div className="row-item" style={{ '--loc': locColor(loc?.name) }}>
      <button className="row-tap" onClick={() => onOpen(row)}>
        <span className="row-icon">{itemIcon(item.name, loc?.icon)}</span>
        <span className="row-body">
          <span className="row-title">{item.name}</span>
          <span className="row-sub">
            {showLocation && loc && <span>{loc.name}</span>}
            {exp && <span className={`exp ${exp.cls}`}>{exp.text}</span>}
            {listed && <span className="tag">On list</span>}
          </span>
        </span>
      </button>
      <div className="qty">
        <button onClick={minus} aria-label="One less">−</button>
        <span className="qty-n" key={row.quantity}>{fmt(row.quantity)}<small>{row.unit !== 'ct' ? ` ${row.unit}` : ''}</small></span>
        <button onClick={() => changeQty(ctx, row, 1)} aria-label="One more">+</button>
      </div>
    </div>
  )
}

// Tap a row → big, clear actions.
export function ItemActionsSheet({ ctx, row: given, locations, onClose, onEdit, onToast }) {
  const row = ctx.inventory.find((r) => r.id === given.id) || given
  const item = ctx.items.find((i) => i.id === row.item_id)
  const loc = locations.find((l) => l.id === row.location_id)
  if (!item) return null
  const listed = onList(ctx, item.id)
  return (
    <Sheet title={<span className="sheet-title-icon">{itemIcon(item.name, loc?.icon)} {item.name}</span>} onClose={onClose}>
      <p className="hint">{fmt(row.quantity)} {row.unit}{loc ? ` · ${loc.name}` : ''}</p>
      <PriceHistory ctx={ctx} itemId={item.id} />
      <div className="action-list">
        <button disabled={listed} onClick={async () => { await addToList(ctx, { name: item.name, itemId: item.id }); onToast({ text: `${item.name} added to list` }); onClose() }}>
          <span>🛒</span>{listed ? 'Already on the shopping list' : 'Running low — add to list'}
        </button>
        <button className="danger-action" onClick={async () => {
          await removeRow(ctx, row)
          onToast(listed ? { text: `Used up ${item.name}` } : { text: `Used up ${item.name}`, action: { label: 'Add to list', run: () => addToList(ctx, { name: item.name, itemId: item.id }) } })
          onClose()
        }}><span>✓</span>Used it all up</button>
        <button onClick={() => onEdit(row)}><span>✎</span>Edit details & low-stock alert</button>
      </div>
    </Sheet>
  )
}

function Group({ title, count, children, right, color }) {
  return (
    <section className="group" style={color ? { '--loc': color } : undefined}>
      {(title || right) && (
        <div className="group-head">
          <span>{title}{count != null && <span className="group-count">{count}</span>}</span>
          {right}
        </div>
      )}
      <div className="group-card">{children}</div>
    </section>
  )
}

function totals(ctx) {
  const t = {}
  ctx.inventory.forEach((r) => { t[r.item_id] = (t[r.item_id] || 0) + Number(r.quantity) })
  return t
}

export function HomeScreen({ ctx, locations, onAdd, onScan, onOpen, onToast, onAsk, onQuickAdd, onSpending }) {
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
  const rowProps = { ctx, locations, onOpen, onToast, showLocation: true }

  return (
    <div className="screen">
      <div className="search-wrap">
        <span className="search-icon"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></span>
        <input className="search" placeholder="Do we have…?" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear">✕</button>}
      </div>
      {q.trim() ? (
        results.length ? (
          <Group title="In the house" count={results.length}>
            {results.map((r) => <InventoryRow key={r.id} row={r} {...rowProps} />)}
          </Group>
        ) : (
          <div className="empty">
            <div className="empty-icon">🤷</div>
            <p>No “{q.trim()}” in the house.</p>
            <button className="primary" onClick={async () => { await addToList(ctx, { name: q }); onToast({ text: `${q.trim()} added to list` }); setQ('') }}>Add to shopping list</button>
          </div>
        )
      ) : (
        <>
          <button className="ask-card" onClick={onAsk}>
            <span className="ask-icon"><Sparkle size={22} /></span>
            <span className="ask-text"><b>Ask Claude</b><span>“What can I make tonight?”</span></span>
            <span className="ask-arrow">›</span>
          </button>
          <div className="quick-actions">
            <button className="qa qa-add" onClick={onAdd}><span><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>Add item</button>
            <button className="qa qa-scan" onClick={onScan}><span><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" /><path d="M8 9v6M11 9v6M14 9v6M17 9v6" /></svg></span>Scan barcode</button>
          </div>
          <button className="haul-btn" onClick={onQuickAdd}><Sparkle size={16} /> Just went shopping? Snap the receipt or type it all</button>
          <div className="stats">
            <div><b>{ctx.inventory.length}</b><span>items</span></div>
            <div className={expiring.length ? 'warn' : ''}><b>{expiring.length}</b><span>expiring</span></div>
            <div><b>{ctx.shopping_list.filter((l) => !l.checked).length}</b><span>on list</span></div>
          </div>
          <BudgetCard ctx={ctx} onOpen={onSpending} />
          <Group title="Expiring soon" count={expiring.length || null}>
            {expiring.length === 0 ? <p className="group-empty">Nothing expiring in the next 3 days.</p>
              : expiring.map((r) => <InventoryRow key={r.id} row={r} {...rowProps} />)}
          </Group>
          <Group title="Running low" count={runningLow.length || null}>
            {runningLow.length === 0 ? <p className="group-empty">Nothing low. Tap any item to set a low-stock alert.</p>
              : runningLow.map((i) => (
                <div className="row-item" key={i.id}>
                  <span className="row-tap static">
                    <span className="row-icon">{itemIcon(i.name)}</span>
                    <span className="row-body">
                      <span className="row-title">{i.name}</span>
                      <span className="row-sub"><span>{fmt(t[i.id] || 0)} left</span></span>
                    </span>
                  </span>
                  {onList(ctx, i.id) ? <span className="tag">On list</span>
                    : <button className="pill-btn" onClick={() => addToList(ctx, { name: i.name, itemId: i.id })}>Add to list</button>}
                </div>
              ))}
          </Group>
        </>
      )}
    </div>
  )
}

export function InventoryScreen({ ctx, locations, onOpen, onToast, onAdd }) {
  const [locId, setLocId] = useState('all')
  const name = (r) => ctx.items.find((i) => i.id === r.item_id)?.name || ''
  const byLoc = useMemo(() => {
    const sorted = [...ctx.inventory].sort((a, b) => name(a).localeCompare(name(b)))
    return locations.map((l) => ({ loc: l, rows: sorted.filter((r) => r.location_id === l.id) }))
      .concat([{ loc: { id: null, name: 'Unsorted', icon: '📦' }, rows: sorted.filter((r) => !r.location_id) }])
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.inventory, ctx.items, locations])
  const shown = locId === 'all' ? byLoc.filter((g) => g.rows.length) : byLoc.filter((g) => g.loc.id === locId)
  const rowProps = { ctx, locations, onOpen, onToast, showLocation: false }

  return (
    <div className="screen">
      <div className="seg">
        <button className={locId === 'all' ? 'on' : ''} onClick={() => setLocId('all')}>All</button>
        {locations.map((l) => (
          <button key={l.id} className={`loc-chip ${locId === l.id ? 'on' : ''}`} style={{ '--loc': locColor(l.name) }} onClick={() => setLocId(l.id)}>
            <span className="loc-dot" />{l.name}
            {ctx.inventory.some((r) => r.location_id === l.id) && <span className="seg-count">{ctx.inventory.filter((r) => r.location_id === l.id).length}</span>}
          </button>
        ))}
      </div>
      {shown.length === 0 || shown.every((g) => !g.rows.length) ? (
        <div className="empty">
          <div className="empty-icon">{locId === 'all' ? '🏠' : locations.find((l) => l.id === locId)?.icon}</div>
          <p>Nothing here yet.</p>
          <button className="primary" onClick={() => onAdd(locId === 'all' ? undefined : locId)}>Add something</button>
        </div>
      ) : shown.map((g) => (
        <Group key={g.loc.id || 'none'} title={<span className="loc-title"><span className="loc-dot" />{g.loc.name}</span>} count={g.rows.length} color={locColor(g.loc.name)}>
          {g.rows.map((r) => <InventoryRow key={r.id} row={r} {...rowProps} />)}
        </Group>
      ))}
    </div>
  )
}

export function ShoppingScreen({ ctx, locations, members, onToast }) {
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(null)
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
      onToast({ text: `${entry.name} → ${loc?.name || 'house'}` })
    } else setPicking(entry)
  }

  return (
    <div className="screen">
      <form className="add-bar" onSubmit={add}>
        <input placeholder="Add to list…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={!text.trim()}>Add</button>
      </form>
      {open.length === 0 ? (
        <div className="empty"><div className="empty-icon">✅</div><p>All caught up.</p></div>
      ) : (
        <Group title="To buy" count={open.length}>
          {open.map((l) => (
            <div className="row-item" key={l.id}>
              <button className="check" onClick={() => tick(l)} aria-label="Bought" />
              <span className="row-body grow">
                <span className="row-title">{itemIcon(l.name, '')} {l.name}{Number(l.quantity) !== 1 && <span className="muted"> × {fmt(l.quantity)}</span>}</span>
                <span className="row-sub">{l.auto ? <span className="exp warn">Running low</span> : who(l.added_by) && <span>{who(l.added_by)}</span>}</span>
              </span>
              <button className="icon-btn" onClick={() => deleteListEntry(ctx, l)} aria-label="Remove">✕</button>
            </div>
          ))}
        </Group>
      )}
      {bought.length > 0 && (
        <Group title="Bought" count={bought.length} right={<button className="text-btn" onClick={() => clearBought(ctx)}>Clear</button>}>
          {bought.map((l) => (
            <div className="row-item done" key={l.id}>
              <button className="check on" onClick={() => uncheck(ctx, l)} aria-label="Not bought">✓</button>
              <span className="row-body grow">
                <span className="row-title">{l.name}</span>
                <span className="row-sub">{who(l.checked_by) && <span>Got it: {who(l.checked_by)}</span>}</span>
              </span>
            </div>
          ))}
        </Group>
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
      <Group title={household.name} count={members.length}>
        {members.map((m) => (
          <div className="row-item" key={m.user_id}>
            <span className="row-tap static">
              <span className="row-icon avatar">{(m.display_name || '?')[0].toUpperCase()}</span>
              <span className="row-body">
                <span className="row-title">{m.display_name}{m.user_id === session.user.id && <span className="muted"> (you)</span>}</span>
                <span className="row-sub"><span>{m.role === 'owner' ? 'Owner' : 'Member'}</span></span>
              </span>
            </span>
          </div>
        ))}
      </Group>
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
      <BudgetSetting ctx={ctx} householdId={household.id} />
      <ClaudeUsage householdId={household.id} />
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
