import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, configured } from './supabase'
import { useHousehold } from './useHousehold'
import { AddItemSheet, EditSheet, ScannerSheet, Toast } from './components'
import { AskClaudeSheet, QuickAddSheet } from './aiScreens'
import { SpendingSheet, TripSheet, LogTripSheet } from './money'
import { CookSheet } from './cook'
import { RecipesScreen, RecipeDetailSheet, RecipeFormSheet } from './recipeScreens'
import { HomeScreen, InventoryScreen, ShoppingScreen, SettingsScreen, ItemActionsSheet } from './screens'

// Something shared into the app from another app's share menu (Android).
const sp = new URLSearchParams(window.location.search)
const sharedIn = (sp.get('shared_url') || sp.get('shared_text')) ? { url: sp.get('shared_url') || '', text: [sp.get('shared_title'), sp.get('shared_text')].filter(Boolean).join(' ') } : null
if (sharedIn) window.history.replaceState({}, '', window.location.pathname)

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
  const [mode, setMode] = useState(pendingJoin() ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const creds = { email: email.trim(), password }
    const { data, error } = mode === 'signup'
      ? await supabase.auth.signUp(creds)
      : await supabase.auth.signInWithPassword(creds)
    if (error && mode === 'signup' && /already registered|already exists/i.test(error.message)) {
      // They already have an account (e.g. made it in the browser) — just sign them in.
      const { error: e2 } = await supabase.auth.signInWithPassword(creds)
      if (e2) { setMode('signin'); setErr('You already have an account. Enter your password to sign in.') }
    } else if (error) {
      setErr(/invalid login/i.test(error.message) ? 'Wrong email or password. Passwords are case-sensitive.' : error.message)
    } else if (mode === 'signup' && !data.session) {
      setErr('Account created, but email confirmation is on. Ask Brett to turn it off in Supabase.')
    }
    setBusy(false)
  }

  return (
    <div className="center-page">
      <h1>🥫 Kitchen</h1>
      <p className="muted">{pendingJoin() ? 'Create an account to join your family’s kitchen.' : 'Your family’s shared kitchen & house inventory.'}</p>
      <form className="form" onSubmit={submit}>
        <input className="big-input" type="email" inputMode="email" autoComplete="email"
          placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="big-input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'Pick a password (6+ characters)' : 'Password'}
          value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        <button className="primary big" disabled={busy}>
          {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErr('') }}>
          {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </form>
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

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const svg = (d) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const TABS = [
  { id: 'home', label: 'Home', icon: svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>) },
  { id: 'inventory', label: 'Inventory', icon: svg(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16M9 7.5h2M9 16.5h2" /></>) },
  { id: 'recipes', label: 'Recipes', icon: svg(<><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /><path d="M9 8h6" /></>) },
  { id: 'list', label: 'List', icon: svg(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>) },
  { id: 'settings', label: 'Family', icon: svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.6.1 4.4 1.6 5 4.8" /></>) },
]

function Main({ session, household }) {
  const hh = useHousehold(household.id)
  const [tab, setTabState] = useState('home')
  const [sheet, setSheetState] = useState(null) // {type:'add'|'scan'|'edit', ...}

  // Back-button / swipe-back support: every page and tab change goes into the browser history,
  // so the phone's back gesture closes the current page instead of leaving the app.
  const stackRef = useRef([])
  const sheetRef = useRef(null)
  const tabRef = useRef('home')
  sheetRef.current = sheet
  tabRef.current = tab
  useEffect(() => {
    window.history.replaceState({ tab: 'home', depth: 0 }, '')
    const onPop = (e) => {
      const depth = e.state?.depth || 0
      let s = sheetRef.current
      while (stackRef.current.length > depth) s = stackRef.current.pop()
      setSheetState(depth === 0 ? null : s)
      setTabDir('left')
      setTabState(e.state?.tab || 'home')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const sharedDone = useRef(false)
  useEffect(() => {
    if (!sharedIn || sharedDone.current || hh.loading) return
    sharedDone.current = true
    setTabState('recipes')
    stackRef.current.push(null)
    setSheetState({ type: 'recipeForm', shared: sharedIn })
    window.history.pushState({ tab: 'recipes', depth: 1 }, '')
  }, [hh.loading])
  const openSheet = useCallback((next) => {
    stackRef.current.push(sheetRef.current)
    setSheetState(next)
    window.history.pushState({ tab: tabRef.current, depth: stackRef.current.length }, '')
  }, [])
  const replaceSheet = useCallback((next) => setSheetState(next), [])
  const closeSheet = useCallback(() => { if (stackRef.current.length) window.history.back(); else setSheetState(null) }, [])
  const closeAll = useCallback(() => { const d = stackRef.current.length; if (d) window.history.go(-d); else setSheetState(null) }, [])
  const [tabDir, setTabDir] = useState('none')
  const setTab = useCallback((id) => {
    if (id === tabRef.current) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const order = ['home', 'inventory', 'recipes', 'list', 'settings']
    setTabDir(order.indexOf(id) > order.indexOf(tabRef.current) ? 'right' : 'left')
    setTabState(id)
    window.scrollTo(0, 0)
    window.history.pushState({ tab: id, depth: 0 }, '')
  }, [])
  const [toast, setToast] = useState(null)

  const ctx = useMemo(() => ({
    householdId: household.id, userId: session.user.id,
    items: hh.items, inventory: hh.inventory, shopping_list: hh.shopping_list, recipes: hh.recipes, reload: hh.reload,
    purchases: hh.purchases, purchase_items: hh.purchase_items, cook_log: hh.cook_log,
    budget: Number(hh.households[0]?.monthly_budget ?? household.monthly_budget ?? 700),
    members: hh.household_members,
  }), [household.id, household.monthly_budget, session.user.id, hh.items, hh.inventory, hh.shopping_list, hh.recipes, hh.reload, hh.purchases, hh.purchase_items, hh.cook_log, hh.households, hh.household_members])

  const myName = hh.household_members.find((m) => m.user_id === session.user.id)?.display_name?.split(' ')[0]
  const showToast = useCallback((t) => setToast(typeof t === 'string' ? { text: t } : t), [])
  const clearToast = useCallback(() => setToast(null), [])
  const onScanResult = useCallback((r) => replaceSheet({ type: 'add', preset: r }), [replaceSheet])
  const listCount = hh.shopping_list.filter((l) => !l.checked).length

  const common = { ctx, locations: hh.locations, onToast: showToast, onOpen: (row) => openSheet({ type: 'actions', row }) }

  return (
    <div className="app">
      <header className="top">
        {tab === 'home' && <p className="greeting">{greeting()}{myName ? `, ${myName}` : ''}</p>}
        <h1 key={tab} className="title-in">{tab === 'home' ? household.name : TABS.find((t) => t.id === tab).label}</h1>
      </header>
      <main key={tab} className={`tab-pane slide-${tabDir}`}>
        {hh.loading ? <p className="muted center">Loading…</p> : <>
          {tab === 'home' && <HomeScreen {...common} onAdd={() => openSheet({ type: 'add' })} onScan={() => openSheet({ type: 'scan' })} onAsk={() => openSheet({ type: 'ask' })} onQuickAdd={() => openSheet({ type: 'quickadd' })} onSpending={() => openSheet({ type: 'spending' })} />}
          {tab === 'inventory' && <InventoryScreen {...common} onAdd={(locationId) => openSheet({ type: 'add', preset: { locationId } })} />}
          {tab === 'recipes' && <RecipesScreen ctx={ctx} onToast={showToast} onOpen={(r) => openSheet({ type: 'recipe', recipe: r })} onAdd={() => openSheet({ type: 'recipeForm' })} />}
          {tab === 'list' && <ShoppingScreen ctx={ctx} locations={hh.locations} members={hh.household_members} onToast={showToast} />}
          {tab === 'settings' && <SettingsScreen ctx={ctx} household={household} members={hh.household_members} session={session} />}
        </>}
      </main>

      {(tab === 'inventory' || tab === 'list') && (
        <button className="fab" onClick={() => openSheet({ type: 'scan' })} aria-label="Scan">{svg(<><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" /><path d="M8 9v6M11 9v6M14 9v6M17 9v6" /></>)}</button>
      )}

      <nav className="tabbar" style={{ '--tab-i': TABS.findIndex((t) => t.id === tab), '--tab-n': TABS.length }}>
        <span className="tab-blob" aria-hidden="true" />
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="tab-icon">{t.icon}{t.id === 'list' && listCount > 0 && <span className="dot">{listCount}</span>}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {sheet?.type === 'add' && <AddItemSheet ctx={ctx} locations={hh.locations} preset={sheet.preset} onClose={closeSheet} onAdded={showToast} onQuickAdd={() => replaceSheet({ type: 'quickadd' })} />}
      {sheet?.type === 'ask' && <AskClaudeSheet ctx={ctx} locations={hh.locations} onClose={closeSheet} onToast={showToast} onOpenRecipe={(r) => openSheet({ type: 'recipe', recipe: r })} />}
      {sheet?.type === 'spending' && <SpendingSheet ctx={ctx} onClose={closeSheet} onOpenTrip={(t) => openSheet({ type: 'trip', trip: t })} onLogTrip={() => openSheet({ type: 'logTrip' })} />}
      {sheet?.type === 'trip' && <TripSheet ctx={ctx} trip={sheet.trip} onClose={closeSheet} />}
      {sheet?.type === 'logTrip' && <LogTripSheet ctx={ctx} onClose={closeSheet} onToast={showToast} />}
      {sheet?.type === 'quickadd' && <QuickAddSheet ctx={ctx} locations={hh.locations} onClose={closeSheet} onToast={showToast} />}
      {sheet?.type === 'scan' && <ScannerSheet ctx={ctx} onClose={closeSheet} onResult={onScanResult} />}
      {sheet?.type === 'recipe' && <RecipeDetailSheet ctx={ctx} recipe={sheet.recipe} onClose={closeSheet} onEdit={(r) => openSheet({ type: 'recipeForm', recipe: r })} onToast={showToast} onCook={(r, servings) => openSheet({ type: 'cook', recipe: r, servings })} />}
      {sheet?.type === 'cook' && <CookSheet ctx={ctx} recipe={sheet.recipe} servings={sheet.servings} onClose={closeSheet} onToast={showToast} />}
      {sheet?.type === 'recipeForm' && <RecipeFormSheet ctx={ctx} locations={hh.locations} recipe={sheet.recipe} shared={sheet.shared} onClose={closeSheet} onSaved={(r) => { replaceSheet({ type: 'recipe', recipe: r }); showToast('Recipe saved') }} />}
      {sheet?.type === 'actions' && <ItemActionsSheet ctx={ctx} row={sheet.row} locations={hh.locations} onClose={closeSheet} onEdit={(row) => openSheet({ type: 'edit', row })} onToast={showToast} />}
      {sheet?.type === 'edit' && <EditSheet ctx={ctx} row={sheet.row} locations={hh.locations} onClose={closeAll} onToast={showToast} />}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  )
}
