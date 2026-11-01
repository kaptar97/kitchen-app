import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { Sheet } from './components'
import { addToList } from './actions'
import {
  parseIngredient, parsePastedRecipe, checkRecipe, ingredientLine, TAG_PRESETS, guessTags,
} from './recipes'

const timeText = (r) => {
  const t = (r.prep_minutes || 0) + (r.cook_minutes || 0)
  if (!t) return null
  return t >= 60 ? `${Math.floor(t / 60)} hr${t % 60 ? ` ${t % 60} min` : ''}` : `${t} min`
}

function Thumb({ recipe, size = 56 }) {
  const [broken, setBroken] = useState(false)
  return recipe.image_url && !broken
    ? <img className="thumb" style={{ width: size, height: size }} src={recipe.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    : <span className="thumb thumb-empty" style={{ width: size, height: size }}>🍽️</span>
}

export function RecipesScreen({ ctx, onOpen, onAdd }) {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const usedTags = useMemo(() => [...new Set(ctx.recipes.flatMap((r) => r.tags || []))].sort(), [ctx.recipes])
  const list = ctx.recipes
    .filter((r) => !tag || (r.tags || []).includes(tag))
    .filter((r) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      (r.ingredients || []).some((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())))
    .map((r) => {
      const checked = checkRecipe(r, ctx.items, ctx.inventory).filter((i) => i.status !== 'staple')
      return { r, have: checked.filter((i) => i.status === 'have').length, total: checked.length }
    })
    .sort((a, b) => a.r.title.localeCompare(b.r.title))

  return (
    <div className="screen">
      <div className="add-bar">
        <div className="search-wrap" style={{ flex: 1, margin: 0 }}>
          <span className="search-icon"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></span>
          <input className="search" placeholder="Search recipes or ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="primary" onClick={onAdd}>＋ New</button>
      </div>
      {usedTags.length > 0 && (
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={!tag ? 'on' : ''} onClick={() => setTag(null)}>All</button>
          {usedTags.map((t) => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
        </div>
      )}
      {ctx.recipes.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📖</div>
          <p>No recipes yet. Paste a link from any recipe site, paste the text, or type one in.</p>
          <button className="primary" onClick={onAdd}>Add your first recipe</button>
        </div>
      ) : list.length === 0 ? (
        <div className="empty"><p>No recipes match.</p></div>
      ) : (
        <section className="group">
          <div className="group-card">
            {list.map(({ r, have, total }) => (
              <button className="row-item recipe-row" key={r.id} onClick={() => onOpen(r)}>
                <Thumb recipe={r} />
                <span className="row-body grow">
                  <span className="row-title">{r.title}</span>
                  <span className="row-sub">
                    {timeText(r) && <span>{timeText(r)}</span>}
                    {total > 0 && (
                      <span className={have === total ? 'exp ok' : ''}>
                        {have === total ? '✓ Have everything' : `Have ${have} of ${total}`}
                      </span>
                    )}
                  </span>
                  {(r.tags || []).length > 0 && <span className="tag-row">{r.tags.slice(0, 3).map((t) => <span key={t} className="tag soft">{t}</span>)}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function RecipeDetailSheet({ ctx, recipe, onClose, onEdit, onToast }) {
  const base = Number(recipe.servings) || null
  const [servings, setServings] = useState(base || 1)
  const scale = base ? servings / base : 1
  const checked = checkRecipe(recipe, ctx.items, ctx.inventory)
  const missing = checked.filter((i) => i.status === 'missing')
  const [busy, setBusy] = useState(false)

  const addMissing = async () => {
    setBusy(true)
    for (const m of missing) await addToList(ctx, { name: m.item?.name || cleanName(m.name), itemId: m.item?.id })
    setBusy(false)
    onToast({ text: `Added ${missing.length} item${missing.length === 1 ? '' : 's'} to the list` })
  }
  const del = async () => {
    if (!window.confirm(`Delete “${recipe.title}”?`)) return
    await supabase.from('recipes').delete().eq('id', recipe.id)
    await ctx.reload('recipes')
    onClose()
  }

  return (
    <Sheet title="" onClose={onClose}>
      <div className="recipe-detail">
        {recipe.image_url && <img className="hero" src={recipe.image_url} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
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
        <div className="row" style={{ marginTop: 18 }}>
          <button className="secondary" style={{ flex: 1 }} onClick={() => onEdit(recipe)}>Edit</button>
          <button className="danger" onClick={del}>Delete</button>
        </div>
      </div>
    </Sheet>
  )
}

const cleanName = (n) => n.replace(/\b(large|small|medium|fresh|chopped|diced|minced|sliced)\b/gi, '').replace(/\s+/g, ' ').trim()

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
    } catch (ex) { setErr(ex.message) }
    setBusy(false)
  }
  const importPaste = () => {
    const r = parsePastedRecipe(paste)
    if (!r.ingredients.length && !r.steps.length) { setErr('Couldn’t find ingredients. Make sure there’s an “Ingredients” line above them.'); return }
    fromImport(r)
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
    <Sheet title={editing ? 'Edit recipe' : 'New recipe'} onClose={onClose}>
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
          <p className="hint">Paste the whole recipe: name, ingredients and steps. Works with text copied from websites, notes or messages.</p>
          <textarea className="big-text" rows={12} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Cheesy Beef Skillet\nServes 4\n\nIngredients\n1 lb ground beef\n1 cup shredded cheddar\n\nInstructions\n1. Brown the beef…'} />
          <button className="primary big" disabled={!paste.trim()} onClick={importPaste}>Read recipe</button>
          <button className="link" onClick={() => { setStep('choose'); setErr('') }}>Back</button>
          {err && <p className="error">{err}</p>}
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
