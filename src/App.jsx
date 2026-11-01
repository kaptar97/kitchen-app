import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, configured } from './supabase'
import { useHousehold } from './useHousehold'
import { AddItemSheet, EditSheet, ScannerSheet, Toast } from './components'
import { HomeScreen, InventoryScreen, ShoppingScreen, SettingsScreen } from './screens'

// Remember an invite code from the link, even across the sign-in step.
const urlJoin = new URLSearchParams(window.location.search).get('join')
if (urlJoin) {
  try { localStorage.setItem('pendingJoin', urlJoin) } catch { /* ignore */ }
  window.history.replaceState({}, '', window.location.pathname)
}
const pendingJoin = () => { try { return localStorage.getItem('pendingJoin') } catch { return null } }

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!configured) return <div className="center-page"><h1>🥫 Kitchen</h1><p>Missing Supabase settings. See README step 3.</p></div>
  if (session === undefined) return <div className="center-page"><p className="muted">Loading…</p></div>
  if (!session) return <SignIn />
  return <HouseholdGate session={session} />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setErr(error.message); else setSent(true)
  }
  const verify = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr('That code didn’t work. Check the newest email and try again.')
  }

  return (
    <div className="center-page">
      <h1>🥫 Kitchen</h1>
      <p className="muted">{pendingJoin() ? 'Sign in to join your family’s kitchen.' : 'Your family’s shared kitchen & house inventory.'}</p>
      {!sent ? (
        <form className="form" onSubmit={send}>
          <input className="big-input" type="email" inputMode="email" autoComplete="email"
            placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="primary big" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
        </form>
      ) : (
        <form className="form" onSubmit={verify}>
          <p>Check <b>{email}</b>. Type the code from the email here:</p>
          <input className="big-input code-input" inputMode="numeric" autoComplete="one-time-code"
            placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={8} />
          <button className="primary big" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="link" onClick={() => { setSent(false); setCode('') }}>Use a different email</button>
        </form>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  )
}

function HouseholdGate({ session }) {
  const [state, setState] = useState({ loading: true, household: null })

  const load = useCallback(async () => {
    const { data: mem } = await supabase.from('household_members')
      .select('household_id, households(*)').eq('user_id', session.user.id).order('joined_at').limit(1)
    setState({ loading: false, household: mem?.[0]?.households || null })
  }, [session.user.id])

  useEffect(() => { load() }, [load])

  if (state.loading) return <div className="center-page"><p className="muted">Loading…</p></div>
  if (!state.household) return <Onboarding onDone={load} />
  return <Main session={session} household={state.household} />
}

function Onboarding({ onDone }) {
  const [mode, setMode] = useState(pendingJoin() ? 'join' : 'choose')
  const [name, setName] = useState('')
  const [hhName, setHhName] = useState('')
  const [code, setCode] = useState(pendingJoin() || '')
  const [err, setErr] = useState('')

  const create = async (e) => {
    e.preventDefault(); setErr('')
    const { error } = await supabase.rpc('create_household', { hh_name: hhName.trim() || 'Our House', my_name: name.trim() })
    if (error) setErr(error.message); else onDone()
  }
  const join = async (e) => {
    e.preventDefault(); setErr('')
    const { error } = await supabase.rpc('join_household', { invite_code: code, my_name: name.trim() })
    if (error) setErr(error.message)
    else { try { localStorage.removeItem('pendingJoin') } catch { /* ignore */ } onDone() }
  }

  return (
    <div className="center-page">
      <h1>🥫 Welcome</h1>
      {mode === 'choose' && (
        <div className="form">
          <button className="primary big" onClick={() => setMode('create')}>Start a new household</button>
          <button className="secondary big" onClick={() => setMode('join')}>I have an invite code</button>
        </div>
      )}
      {mode === 'create' && (
        <form className="form" onSubmit={create}>
          <input className="big-input" placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="big-input" placeholder="Household name (e.g. The Zaugg House)" value={hhName} onChange={(e) => setHhName(e.target.value)} />
          <button className="primary big">Create</button>
          <button type="button" className="link" onClick={() => setMode('choose')}>Back</button>
        </form>
      )}
      {mode === 'join' && (
        <form className="form" onSubmit={join}>
          <input className="big-input" placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="big-input code-input" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
          <button className="primary big">Join</button>
          <button type="button" className="link" onClick={() => setMode('choose')}>Back</button>
        </form>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  )
}

const TABS = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'inventory', icon: '📦', label: 'Inventory' },
  { id: 'list', icon: '🛒', label: 'List' },
  { id: 'settings', icon: '⚙️', label: 'Family' },
]

function Main({ session, household }) {
  const hh = useHousehold(household.id)
  const [tab, setTab] = useState('home')
  const [sheet, setSheet] = useState(null) // {type:'add'|'scan'|'edit', ...}
  const [toast, setToast] = useState(null)

  const ctx = useMemo(() => ({
    householdId: household.id, userId: session.user.id,
    items: hh.items, inventory: hh.inventory, shopping_list: hh.shopping_list, reload: hh.reload,
  }), [household.id, session.user.id, hh.items, hh.inventory, hh.shopping_list, hh.reload])

  const showToast = useCallback((t) => setToast(typeof t === 'string' ? { text: t } : t), [])
  const clearToast = useCallback(() => setToast(null), [])
  const onScanResult = useCallback((r) => setSheet({ type: 'add', preset: r }), [])
  const listCount = hh.shopping_list.filter((l) => !l.checked).length

  const common = { ctx, locations: hh.locations, onToast: showToast, onEdit: (row) => setSheet({ type: 'edit', row }) }

  return (
    <div className="app">
      <header className="top">
        <span>{TABS.find((t) => t.id === tab).label === 'Home' ? `🥫 ${household.name}` : TABS.find((t) => t.id === tab).label}</span>
      </header>
      <main>
        {hh.loading ? <p className="muted center">Loading…</p> : <>
          {tab === 'home' && <HomeScreen {...common} onAdd={() => setSheet({ type: 'add' })} onScan={() => setSheet({ type: 'scan' })} />}
          {tab === 'inventory' && <InventoryScreen {...common} onAdd={(locationId) => setSheet({ type: 'add', preset: { locationId } })} />}
          {tab === 'list' && <ShoppingScreen ctx={ctx} locations={hh.locations} members={hh.household_members} onToast={showToast} />}
          {tab === 'settings' && <SettingsScreen ctx={ctx} household={household} members={hh.household_members} session={session} />}
        </>}
      </main>

      {(tab === 'inventory' || tab === 'list') && (
        <button className="fab" onClick={() => setSheet({ type: 'scan' })} aria-label="Scan">📷</button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}{t.id === 'list' && listCount > 0 && <span className="dot">{listCount}</span>}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {sheet?.type === 'add' && <AddItemSheet ctx={ctx} locations={hh.locations} preset={sheet.preset} onClose={() => setSheet(null)} onAdded={showToast} />}
      {sheet?.type === 'scan' && <ScannerSheet ctx={ctx} onClose={() => setSheet(null)} onResult={onScanResult} />}
      {sheet?.type === 'edit' && <EditSheet ctx={ctx} row={sheet.row} locations={hh.locations} onClose={() => setSheet(null)} onToast={showToast} />}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  )
}
