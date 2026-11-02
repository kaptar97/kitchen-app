import { useEffect, useRef, useState } from 'react'
import { addToInventory, lookupBarcode, updateItem, updateRow, removeRow } from './actions'
import { localDate } from './dates'
import { locColor } from './theme'

export const UNITS = ['ct', 'pack', 'box', 'can', 'bottle', 'bag', 'jar', 'lb', 'oz', 'gal', 'roll', 'dozen']

export function Sheet({ title, onClose, children, full = false }) {
  // Swipe right from the left edge (like iPhone back), or pull the top of the sheet down, to go back.
  const touch = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    const sheetTop = e.currentTarget.getBoundingClientRect().top
    touch.current = { x: t.clientX, y: t.clientY, edge: t.clientX < 28, top: t.clientY - sheetTop < 70 && e.currentTarget.scrollTop <= 0 }
  }
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (s.edge && dx > 70 && Math.abs(dy) < 60) onClose()
    else if (s.top && dy > 90 && Math.abs(dx) < 60) onClose()
  }
  return (
    <div className="backdrop" onClick={onClose}>
      <div className={`sheet ${full ? 'full' : ''}`} onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="sheet-head">
          <button className="back-btn" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            Back
          </button>
          {title && <h2 className="sheet-title">{title}</h2>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, toast.action ? 5000 : 2500)
    return () => clearTimeout(t)
  }, [toast, onDone])
  if (!toast) return null
  return (
    <div className="toast">
      <span>{toast.text}</span>
      {toast.action && (
        <button onClick={() => { toast.action.run(); onDone() }}>{toast.action.label}</button>
      )}
    </div>
  )
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d - today) / 86400000)
}

export function ExpiryBadge({ date }) {
  const n = daysUntil(date)
  if (n === null) return null
  const cls = n < 0 ? 'badge bad' : n <= 3 ? 'badge warn' : 'badge'
  const text = n < 0 ? 'Expired' : n === 0 ? 'Today' : n === 1 ? '1 day' : n <= 14 ? `${n} days` : date.slice(5).replace('-', '/')
  return <span className={cls}>{text}</span>
}

export function LocationChips({ locations, value, onChange }) {
  return (
    <div className="chips">
      {locations.map((l) => (
        <button key={l.id} type="button" style={{ '--loc': locColor(l.name) }}
          className={`chip loc-chip ${value === l.id ? 'on' : ''}`} onClick={() => onChange(l.id)}>
          <span className="loc-dot" />{l.name}
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, onChange }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(0.5, Number(value) - 1))}>−</button>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => onChange(Number(value) + 1)}>+</button>
    </div>
  )
}

// Add an item: type a name (autocompletes from past items) or come from a barcode scan.
export function AddItemSheet({ ctx, locations, preset = {}, onClose, onAdded, onQuickAdd }) {
  const [name, setName] = useState(preset.name || '')
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState(preset.item?.default_unit || 'ct')
  const [loc, setLoc] = useState(preset.item?.default_location_id || preset.locationId || locations.find((l) => l.name === 'Pantry')?.id || locations[0]?.id)
  const [expires, setExpires] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (!preset.name) inputRef.current?.focus() }, [preset.name])

  const suggestions = name.trim().length >= 1
    ? ctx.items.filter((i) => i.name.toLowerCase().includes(name.trim().toLowerCase()) &&
        i.name.toLowerCase() !== name.trim().toLowerCase()).slice(0, 5)
    : []

  const pick = (item) => {
    setName(item.name)
    setUnit(item.default_unit || 'ct')
    if (item.default_location_id) setLoc(item.default_location_id)
  }

  const save = async (e) => {
    e?.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await addToInventory(ctx, { name, quantity: qty || 1, unit, locationId: loc, expiresOn: expires || null, barcode: preset.barcode })
      onAdded?.(`Added ${name.trim()}`)
      onClose()
    } catch (err) {
      alert('Could not save: ' + err.message)
      setBusy(false)
    }
  }

  return (
    <Sheet title={preset.barcode ? 'Scanned item' : 'Add item'} onClose={onClose}>
      <form onSubmit={save} className="form">
        {onQuickAdd && !preset.barcode && <button type="button" className="haul-link" onClick={onQuickAdd}>✨ Bought a bunch? Type it all at once</button>}
        <input ref={inputRef} className="big-input" placeholder="What is it? (e.g. Eggs)"
          value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        {preset.barcode && !preset.name && <p className="hint">Not found in the barcode database. Type a name once and it'll be remembered.</p>}
        {suggestions.length > 0 && (
          <div className="suggest">
            {suggestions.map((s) => <button type="button" key={s.id} onClick={() => pick(s)}>{s.name}</button>)}
          </div>
        )}
        <label>How many</label>
        <div className="row">
          <Stepper value={qty} onChange={setQty} />
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <label>Where</label>
        <LocationChips locations={locations} value={loc} onChange={setLoc} />
        <label>Expires (optional)</label>
        <div className="row">
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          {[3, 7, 30].map((d) => (
            <button type="button" key={d} className="chip" onClick={() => {
              const x = new Date(); x.setDate(x.getDate() + d); setExpires(localDate(x))
            }}>+{d}d</button>
          ))}
        </div>
        <button className="primary big" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Add to house'}</button>
      </form>
    </Sheet>
  )
}

// Edit one inventory row and its item settings (low-stock threshold, etc.).
export function EditSheet({ ctx, row, locations, onClose, onToast }) {
  const item = ctx.items.find((i) => i.id === row.item_id)
  const [qty, setQty] = useState(row.quantity)
  const [unit, setUnit] = useState(row.unit)
  const [loc, setLoc] = useState(row.location_id)
  const [expires, setExpires] = useState(row.expires_on || '')
  const [threshold, setThreshold] = useState(item?.low_threshold ?? '')
  const [name, setName] = useState(item?.name || '')

  const save = async () => {
    await updateRow(ctx, row, { quantity: Number(qty) || 0, unit, location_id: loc, expires_on: expires || null })
    const patch = { low_threshold: threshold === '' ? null : Number(threshold) }
    if (name.trim() && name.trim() !== item.name) patch.name = name.trim()
    await updateItem(ctx, item.id, patch)
    onToast?.('Saved')
    onClose()
  }

  return (
    <Sheet title="Edit item" onClose={onClose}>
      <div className="form">
        <label>Name</label>
        <input className="big-input" value={name} onChange={(e) => setName(e.target.value)} />
        <label>Quantity</label>
        <div className="row">
          <Stepper value={qty} onChange={setQty} />
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <label>Where</label>
        <LocationChips locations={locations} value={loc} onChange={setLoc} />
        <label>Expires</label>
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        <label>Add to shopping list when total is at or below</label>
        <div className="row">
          <input inputMode="decimal" placeholder="Off" value={threshold}
            onChange={(e) => setThreshold(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span className="muted">{item?.default_unit} (blank = off)</span>
        </div>
        <button className="primary big" onClick={save}>Save</button>
        <button className="danger" onClick={async () => { await removeRow(ctx, row); onClose() }}>Remove from house</button>
      </div>
    </Sheet>
  )
}

// Camera barcode scanner.
export function ScannerSheet({ ctx, onClose, onResult }) {
  const [status, setStatus] = useState('Starting camera…')
  const done = useRef(false)
  const latest = useRef({ ctx, onResult })
  latest.current = { ctx, onResult }

  useEffect(() => {
    let scanner = null
    let running = false
    let cancelled = false
    import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
    if (cancelled) return
    scanner = new Html5Qrcode('scanner-box', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
      ],
      verbose: false,
    })
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } },
      async (code) => {
        if (done.current) return
        done.current = true
        if (navigator.vibrate) navigator.vibrate(80)
        setStatus('Looking it up…')
        const found = await lookupBarcode(latest.current.ctx, code)
        latest.current.onResult({ barcode: code, ...found })
      },
      () => {})
      .then(() => {
        running = true
        if (cancelled) { scanner.stop().catch(() => {}); return }
        setStatus('Point at a barcode')
      })
      .catch(() => setStatus('Camera not available. Allow camera access, or use Add instead.'))
    })
    return () => { cancelled = true; if (running) scanner.stop().catch(() => {}) }
  }, [])

  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      <div id="scanner-box" className="scanner" />
      <p className="hint center">{status}</p>
    </Sheet>
  )
}
