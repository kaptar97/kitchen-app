import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { Sheet } from './components'
import { addToList } from './actions'
import {
  parseIngredient, parsePastedRecipe, checkRecipe, ingredientLine, TAG_PRESETS, guessTags, keyWords,
} from './recipes'
import { LIBRARY } from './library'
import { itemIcon } from './icons'

const timeText = (r) => {
  const t = (r.prep_minutes || 0) + (r.cook_minutes || 0)
  if (!t) return null
  return t >= 60 ? `${Math.floor(t / 60)} hr${t % 60 ? ` ${t % 60} min` : ''}` : `${t} min`
}

function Thumb({ recipe, size = 56 }) {
  const [broken, setBroken] = useState(false)
  if (recipe.image_url && !broken) {
    return <img className="thumb" style={{ width: size, height: size }} src={recipe.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  }
  const emoji = recipe.emoji || LIBRARY.find((l) => l.title === recipe.title)?.emoji || itemIcon(recipe.title, '🍽️')
  return <span className="thumb thumb-empty" style={{ width: size, height: size }}>{emoji}</span>
}

// How a recipe stacks up against the house right now.
export function recipeStatus(recipe, ctx, expiringItemIds) {
  const checked = checkRecipe(recipe, ctx.items, ctx.inventory)
  const real = checked.filter((i) => i.status !== 'staple')
  const missing = real.filter((i) => i.status === 'missing')
  const usesExpiring = [...new Set(real.filter((i) => i.status === 'have' && expiringItemIds.has(i.item.id)).map((i) => i.item.name))]
  return { checked, have: real.length - missing.length, total: real.length, missing, usesExpiring }
}

function useExpiring(ctx) {
  return useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const ids = new Set()
    ctx.inventory.forEach((r) => {
      if (r.expires_on && Math.round((new Date(r.expires_on + 'T00:00:00') - today) / 86400000) <= 3) ids.add(r.item_id)
    })
    return ids
  }, [ctx.inventory])
}

const shortName = (ing) => ing.item?.name || cleanName(ing.name)

// Add every missing ingredient from several recipes, without duplicates.
export async function addMissingFor(ctx, recipes, expiringIds) {
  const seen = new Map()
  for (const r of recipes) {
    for (const m of recipeStatus(r, ctx, expiringIds).missing) {
      const key = m.item?.id || keyWords(m.name).join(' ')
      if (!seen.has(key)) seen.set(key, { name: shortName(m), itemId: m.item?.id })
    }
  }
  for (const v of seen.values()) await addToList(ctx, v)
  return seen.size
}

function RecipeRow({ r, st, selecting, selected, onTap, saved, showNeed }) {
  return (
    <button className={`row-item recipe-row ${selected ? 'selected' : ''}`} onClick={onTap}>
      {selecting && <span className={`check ${selected ? 'on' : ''}`}>{selected ? '✓' : ''}</span>}
      <Thumb recipe={r} />
      <span className="row-body grow">
        <span className="row-title">{r.title}</span>
        <span className="row-sub">
          {timeText(r) && <span>{timeText(r)}</span>}
          {st.total > 0 && (st.missing.length === 0
            ? <span className="exp ok">✓ Have everything</span>
            : <span>Have {st.have} of {st.total}</span>)}
          {saved && <span className="tag">Saved</span>}
        </span>
        {showNeed && st.missing.length > 0 && <span className="need-line">Need: {st.missing.map(shortName).join(', ')}</span>}
        {st.usesExpiring.length > 0 && <span className="use-up">⏰ Uses up {st.usesExpiring.join(', ')}</span>}
        {!showNeed && (r.tags || []).length > 0 && <span className="tag-row">{r.tags.slice(0, 3).map((t) => <span key={t} className="tag soft">{t}</span>)}</span>}
      </span>
    </button>
  )
}

export function RecipesScreen({ ctx, onOpen, onAdd, onToast }) {
  const [view, setView] = useState('cook')
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const [includeLib, setIncludeLib] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const expiring = useExpiring(ctx)

  const savedTitles = useMemo(() => new Set(ctx.recipes.map((r) => r.title.toLowerCase())), [ctx.recipes])
  const pool = view === 'mine' ? ctx.recipes
    : view === 'browse' ? LIBRARY
      : [...ctx.recipes, ...(includeLib ? LIBRARY.filter((l) => !savedTitles.has(l.title.toLowerCase())) : [])]

  const allTags = useMemo(() => [...new Set(pool.flatMap((r) => r.tags || []))].sort(), [pool])
  const rows = pool
    .filter((r) => !tag || (r.tags || []).includes(tag))
    .filter((r) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      (r.ingredients || []).some((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())))
    .map((r) => ({ r, st: recipeStatus(r, ctx, expiring) }))

  const byId = new Map(rows.map((x) => [x.r.id, x]))
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const tap = (r) => (selecting ? toggle(r.id) : onOpen(r))
  const selectedRecipes = [...selected].map((id) => byId.get(id)?.r || [...ctx.recipes, ...LIBRARY].find((r) => r.id === id)).filter(Boolean)
  const missingCount = (() => {
    const keys = new Set()
    selectedRecipes.forEach((r) => recipeStatus(r, ctx, expiring).missing.forEach((m) => keys.add(m.item?.id || keyWords(m.name).join(' '))))
    return keys.size
  })()

  const addSelected = async () => {
    setBusy(true)
    const n = await addMissingFor(ctx, selectedRecipes, expiring)
    setBusy(false)
    onToast({ text: n ? `Added ${n} item${n === 1 ? '' : 's'} to the list` : 'You already have everything for those' })
    setSelecting(false); setSelected(new Set())
  }

  // Sorting for "What can I make": fewest missing first, then recipes that use expiring food.
  const rank = (a, b) => (a.st.missing.length - b.st.missing.length) || (b.st.usesExpiring.length - a.st.usesExpiring.length) ||
    (b.st.have - a.st.have) || a.r.title.localeCompare(b.r.title)
  const ready = rows.filter((x) => x.st.total > 0 && x.st.missing.length === 0).sort(rank)
  const almost = rows.filter((x) => x.st.missing.length >= 1 && x.st.missing.length <= 2).sort(rank)
  const useUp = rows.filter((x) => x.st.usesExpiring.length && x.st.missing.length > 2).sort(rank)
  const sorted = [...rows].sort((a, b) => a.r.title.localeCompare(b.r.title))

  const rowEl = (x, extra = {}) => (
    <RecipeRow key={x.r.id} r={x.r} st={x.st} selecting={selecting} selected={selected.has(x.r.id)}
      onTap={() => tap(x.r)} saved={view === 'browse' && savedTitles.has(x.r.title.toLowerCase())} {...extra} />
  )

  return (
    <div className="screen">
      <div className="tabs3">
        {[['cook', 'What can I make'], ['mine', 'My recipes'], ['browse', 'Browse']].map(([id, label]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => { setView(id); setTag(null) }}>{label}</button>
        ))}
      </div>
      <div className="add-bar" style={{ marginTop: 10 }}>
        <div className="search-wrap" style={{ flex: 1, margin: 0 }}>
          <span className="search-icon"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></span>
          <input className="search" placeholder="Search recipes or ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === 'mine'
          ? <button className="primary" onClick={onAdd}>＋ New</button>
          : <button className={selecting ? 'primary' : 'secondary'} onClick={() => { setSelecting(!selecting); setSelected(new Set()) }}>{selecting ? 'Done' : 'Select'}</button>}
      </div>
      <div className="seg" style={{ marginTop: 10 }}>
        {view === 'mine' && ctx.recipes.length > 0 && <button className={selecting ? 'on' : ''} onClick={() => { setSelecting(!selecting); setSelected(new Set()) }}>{selecting ? '✓ Selecting' : 'Select'}</button>}
        {view === 'cook' && <button className={includeLib ? 'on' : ''} onClick={() => setIncludeLib(!includeLib)}>{includeLib ? '✓ ' : ''}Include library</button>}
        <button className={!tag ? 'on' : ''} onClick={() => setTag(null)}>All</button>
        {allTags.map((t) => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
      </div>
      {selecting && <p className="hint" style={{ marginTop: 10 }}>Tap recipes you want to make. Everything you’re missing goes on the shopping list.</p>}

      {view === 'cook' && (
        rows.length === 0 ? <div className="empty"><p>No recipes match.</p></div> : (
          <>
            <Group title="Ready to cook" count={ready.length}>
              {ready.length ? ready.map((x) => rowEl(x)) : <p className="group-empty">Nothing fully stocked yet. Check “Almost there” below.</p>}
            </Group>
            {almost.length > 0 && (
              <Group title="Almost there" count={almost.length}>
                {almost.map((x) => rowEl(x, { showNeed: true }))}
              </Group>
            )}
            {useUp.length > 0 && (
              <Group title="Uses food expiring soon" count={useUp.length}>
                {useUp.map((x) => rowEl(x, { showNeed: true }))}
              </Group>
            )}
            {ctx.inventory.length === 0 && <p className="hint center" style={{ marginTop: 16 }}>Add what’s in your kitchen and this fills in automatically.</p>}
          </>
        )
      )}

      {view === 'mine' && (
        ctx.recipes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📖</div>
            <p>No saved recipes yet. Add your own, or save some from Browse.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={onAdd}>Add a recipe</button>
              <button className="secondary" onClick={() => setView('browse')}>Browse</button>
            </div>
          </div>
        ) : rows.length === 0 ? <div className="empty"><p>No recipes match.</p></div>
          : <Group>{sorted.map((x) => rowEl(x))}</Group>
      )}

      {view === 'browse' && (
        rows.length === 0 ? <div className="empty"><p>No recipes match.</p></div>
          : <Group title="Starter recipes" count={rows.length}>{sorted.map((x) => rowEl(x))}</Group>
      )}

      {selecting && selected.size > 0 && (
        <div className="select-bar">
          <span><b>{selected.size}</b> recipe{selected.size === 1 ? '' : 's'} · {missingCount ? `${missingCount} to buy` : 'have everything'}</span>
          <button className="primary" disabled={busy || !missingCount} onClick={addSelected}>{busy ? 'Adding…' : '🛒 Add to list'}</button>
        </div>
      )}
    </div>
  )
}

function Group({ title, count, children }) {
  return (
    <section className="group">
      {title && <div className="group-head"><span>{title}{count != null && <span className="group-count">{count}</span>}</span></div>}
      <div className="group-card">{children}</div>
    </section>
  )
}

export function RecipeDetailSheet({ ctx, recipe: given, onClose, onEdit, onToast }) {
  const recipe = (!given.library && ctx.recipes.find((x) => x.id === given.id)) || given
  const base = Number(recipe.servings) || null
  const [servings, setServings] = useState(base || 1)
  const scale = base ? servings / base : 1
  const checked = checkRecipe(recipe, ctx.items, ctx.inventory)
  const missing = checked.filter((i) => i.status === 'missing')
  const [busy, setBusy] = useState(false)

  const addMissing = async () => {
    setBusy(true)
    for (const m of missing) await addToList(ctx, { name: shortName(m), itemId: m.item?.id })
    setBusy(false)
    onToast({ text: `Added ${missing.length} item${missing.length === 1 ? '' : 's'} to the list` })
  }
  const alreadySaved = recipe.library && ctx.recipes.some((r) => r.title.toLowerCase() === recipe.title.toLowerCase())
  const saveCopy = async () => {
    setBusy(true)
    const { error } = await supabase.from('recipes').insert({
      household_id: ctx.householdId, created_by: ctx.userId, title: recipe.title, servings: recipe.servings,
      prep_minutes: recipe.prep_minutes, cook_minutes: recipe.cook_minutes, ingredients: recipe.ingredients,
      steps: recipe.steps, tags: recipe.tags, notes: null, source_url: null, image_url: null,
    })
    await ctx.reload('recipes')
    setBusy(false)
    onToast(error ? { text: 'Could not save: ' + error.message } : { text: 'Saved to your recipes — edit it any way you like' })
  }
  const del = async () => {
    if (!window.confirm(`Delete “${recipe.title}”?`)) return
    await supabase.from('recipes').delete().eq('id', recipe.id)
    await ctx.reload('recipes')
    onClose()
  }

  return (
    <Sheet title="" onClose={onClose} full>
      <div className="recipe-detail">
        {recipe.image_url
          ? <img className="hero" src={recipe.image_url} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          : <div className="hero-emoji">{recipe.emoji || LIBRARY.find((l) => l.title === recipe.title)?.emoji || itemIcon(recipe.title, '🍽️')}</div>}
        <h2>{recipe.title}</h2>
        <div className="meta-row">
          {recipe.prep_minutes ? <span>Prep {recipe.prep_minutes} min</span> : null}
          {recipe.cook_minutes ? <span>Cook {recipe.cook_minutes} min</span> : null}
          {(recipe.tags || []).map((t) => <span key={t} className="tag soft">{t}</span>)}
        </div>

        <div className="group-head" style={{ marginTop: 20 }}>
          <span>Ingredients</span>
          {base && (
            <span className="serv">
              <button onClick={() => setServings(Math.max(1, servings - 1))} aria-label="Fewer servings">−</button>
              <b>{servings}</b> servings
              <button onClick={() => setServings(servings + 1)} aria-label="More servings">+</button>
            </span>
          )}
        </div>
        <div className="group-card">
          {checked.length === 0 && <p className="group-empty">No ingredients listed.</p>}
          {checked.map((ing, i) => (
            <div className={`ing-row ${ing.status}`} key={i}>
              <span className="ing-mark">{ing.status === 'have' ? '✓' : ing.status === 'staple' ? '·' : '○'}</span>
              <span className="ing-text">{ingredientLine(ing, scale)}</span>
              {ing.status === 'missing' && <span className="ing-flag">Need</span>}
            </div>
          ))}
        </div>
        {missing.length > 0 ? (
          <button className="primary big" style={{ marginTop: 12 }} disabled={busy} onClick={addMissing}>
            🛒 Add {missing.length} missing to shopping list
          </button>
        ) : checked.length > 0 && <p className="ready">✓ You have everything for this one.</p>}

        {(recipe.steps || []).length > 0 && (
          <>
            <div className="group-head" style={{ marginTop: 22 }}><span>Steps</span></div>
            <ol className="steps">
              {recipe.steps.map((s, i) => <li key={i}><span className="step-n">{i + 1}</span><span>{s}</span></li>)}
            </ol>
          </>
        )}
        {recipe.notes && (<><div className="group-head" style={{ marginTop: 22 }}><span>Notes</span></div><p className="notes">{recipe.notes}</p></>)}
        {recipe.source_url && <a className="source" href={recipe.source_url} target="_blank" rel="noreferrer">View original recipe ↗</a>}
        {recipe.library ? (
          alreadySaved
            ? <p className="ready" style={{ marginTop: 18 }}>✓ Saved to your recipes</p>
            : <button className="secondary big" style={{ marginTop: 18 }} disabled={busy} onClick={saveCopy}>⭐ Save to my recipes</button>
        ) : (
          <div className="row" style={{ marginTop: 18 }}>
            <button className="secondary" style={{ flex: 1 }} onClick={() => onEdit(recipe)}>Edit</button>
            <button className="danger" onClick={del}>Delete</button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

const cleanName = (n) => {
  const c = n.replace(/\b(large|small|medium|fresh|chopped|diced|minced|sliced)\b/gi, '').replace(/\s+/g, ' ').trim()
  return c.charAt(0).toUpperCase() + c.slice(1)
}

export function RecipeFormSheet({ ctx, recipe, onClose, onSaved }) {
  const editing = Boolean(recipe?.id)
  const [step, setStep] = useState(editing ? 'form' : 'choose')
  const [url, setUrl] = useState('')
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState(() => ({
    title: recipe?.title || '',
    servings: recipe?.servings ?? '',
    prep_minutes: recipe?.prep_minutes ?? '',
    cook_minutes: recipe?.cook_minutes ?? '',
    tags: recipe?.tags || [],
    ingredients: (recipe?.ingredients || []).map((i) => i.raw).join('\n'),
    steps: (recipe?.steps || []).join('\n'),
    notes: recipe?.notes || '',
    source_url: recipe?.source_url || '',
    image_url: recipe?.image_url || '',
  }))
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const fromImport = (r) => {
    setF({
      title: r.title || '', servings: r.servings ?? '', prep_minutes: r.prep_minutes ?? '', cook_minutes: r.cook_minutes ?? '',
      tags: guessTags(r), ingredients: (r.ingredients || []).join('\n'), steps: (r.steps || []).join('\n'),
      notes: '', source_url: r.source_url || '', image_url: r.image_url || '',
    })
    setStep('form')
  }

  const importLink = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const res = await fetch(`/api/import-recipe?url=${encodeURIComponent(url.trim())}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')
      fromImport(json)
    } catch {
      setErr('blocked')
      setStep('paste')
    }
    setBusy(false)
  }
  const importPaste = () => {
    setErr('')
    const r = parsePastedRecipe(paste)
    if (!r.ingredients.length && !r.steps.length) { setErr('Couldn’t find ingredients. Make sure the word “Ingredients” is on its own line above them.'); return }
    fromImport({ ...r, source_url: url.trim() || '' })
  }

  const save = async () => {
    if (!f.title.trim()) { setErr('Give it a name.'); return }
    setBusy(true); setErr('')
    const intOrNull = (v) => (v === '' || v == null ? null : Math.round(Number(v)) || null)
    const row = {
      household_id: ctx.householdId,
      title: f.title.trim(),
      servings: f.servings === '' ? null : Number(f.servings) || null,
      prep_minutes: intOrNull(f.prep_minutes),
      cook_minutes: intOrNull(f.cook_minutes),
      tags: f.tags,
      ingredients: f.ingredients.split('\n').map((l) => l.trim()).filter(Boolean).map(parseIngredient),
      steps: f.steps.split('\n').map((l) => l.trim().replace(/^(step\s*)?\d+[.):]\s*/i, '')).filter(Boolean),
      notes: f.notes.trim() || null,
      source_url: f.source_url || null,
      image_url: f.image_url || null,
      updated_at: new Date().toISOString(),
    }
    const q = editing
      ? supabase.from('recipes').update(row).eq('id', recipe.id).select().single()
      : supabase.from('recipes').insert({ ...row, created_by: ctx.userId }).select().single()
    const { data, error } = await q
    setBusy(false)
    if (error) { setErr(error.message); return }
    await ctx.reload('recipes')
    onSaved(data)
  }

  const toggleTag = (t) => set('tags', f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t])
  const [customTag, setCustomTag] = useState('')

  return (
    <Sheet title={editing ? 'Edit recipe' : 'New recipe'} onClose={onClose} full>
      {step === 'choose' && (
        <div className="form">
          <form onSubmit={importLink} className="form">
            <label>Paste a link</label>
            <div className="row">
              <input type="url" inputMode="url" placeholder="https://www.allrecipes.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="primary" disabled={busy || !url.trim()}>{busy ? '…' : 'Import'}</button>
            </div>
          </form>
          <div className="or"><span>or</span></div>
          <button className="secondary big" onClick={() => setStep('paste')}>Paste recipe text</button>
          <button className="secondary big" onClick={() => setStep('form')}>Type it in</button>
          {err && <p className="error">{err}</p>}
        </div>
      )}
      {step === 'paste' && (
        <div className="form">
          {err === 'blocked' ? (
            <div className="notice">
              <b>That site doesn’t let apps read it.</b> Here’s the quick way:
              <ol>
                <li>Open the recipe in your browser and tap <b>Jump to Recipe</b>.</li>
                <li>Press and hold on the recipe name, then drag to select down through the last step. (Or select all.)</li>
                <li>Tap <b>Copy</b>, come back, and paste below.</li>
              </ol>
            </div>
          ) : <p className="hint">Paste the recipe: name, ingredients and steps. Text copied from a website, a note, or a message all works. Extra junk around it gets ignored.</p>}
          <textarea className="big-text" rows={12} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Cheesy Beef Skillet\nServes 4\n\nIngredients\n1 lb ground beef\n1 cup shredded cheddar\n\nInstructions\n1. Brown the beef…'} />
          <button className="primary big" disabled={!paste.trim()} onClick={importPaste}>Read recipe</button>
          <button className="link" onClick={() => { setStep('choose'); setErr('') }}>Back</button>
          {err && err !== 'blocked' && <p className="error">{err}</p>}
        </div>
      )}
      {step === 'form' && (
        <div className="form">
          {!editing && f.source_url && <p className="hint">Imported. Check it over and tap Save.</p>}
          <label>Name</label>
          <input className="big-input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Grandma’s Chili" />
          <div className="three">
            <div><label>Servings</label><input inputMode="numeric" value={f.servings} onChange={(e) => set('servings', e.target.value.replace(/[^\d.]/g, ''))} /></div>
            <div><label>Prep min</label><input inputMode="numeric" value={f.prep_minutes} onChange={(e) => set('prep_minutes', e.target.value.replace(/\D/g, ''))} /></div>
            <div><label>Cook min</label><input inputMode="numeric" value={f.cook_minutes} onChange={(e) => set('cook_minutes', e.target.value.replace(/\D/g, ''))} /></div>
          </div>
          <label>Tags</label>
          <div className="chips">
            {[...new Set([...TAG_PRESETS, ...f.tags])].map((t) => (
              <button type="button" key={t} className={`chip ${f.tags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
          <div className="row">
            <input placeholder="Add your own tag" value={customTag} onChange={(e) => setCustomTag(e.target.value)} />
            <button type="button" className="secondary" disabled={!customTag.trim()} onClick={() => { toggleTag(customTag.trim()); setCustomTag('') }}>Add</button>
          </div>
          <label>Ingredients — one per line</label>
          <textarea className="big-text" rows={8} value={f.ingredients} onChange={(e) => set('ingredients', e.target.value)} placeholder={'1 lb ground beef\n2 cups shredded cheddar\n1 onion, diced'} />
          <label>Steps — one per line</label>
          <textarea className="big-text" rows={8} value={f.steps} onChange={(e) => set('steps', e.target.value)} placeholder={'Brown the beef.\nStir in the cheese.'} />
          <label>Notes (optional)</label>
          <textarea className="big-text" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Swaps, tips, who loves it…" />
          <button className="primary big" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save recipe'}</button>
          {err && <p className="error">{err}</p>}
        </div>
      )}
    </Sheet>
  )
}
