// Recipe helpers: parse ingredient lines, parse pasted recipes, match ingredients to what's in the house.

const UNICODE_FRAC = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2 }
const UNITS = {
  cup: /^(cups?|c\.?)$/, tbsp: /^(tablespoons?|tbsps?\.?|tbl\.?|tbs\.?|T)$/, tsp: /^(teaspoons?|tsps?\.?|t)$/,
  oz: /^(ounces?|oz\.?)$/, lb: /^(pounds?|lbs?\.?)$/, g: /^(grams?|g)$/, kg: /^(kilograms?|kgs?)$/,
  ml: /^(milliliters?|ml)$/, l: /^(liters?|l)$/, pinch: /^pinch(es)?$/, dash: /^dash(es)?$/,
  clove: /^cloves?$/, can: /^cans?$/, jar: /^jars?$/, pkg: /^(packages?|pkgs?\.?|packets?|bags?|boxes|box)$/,
  slice: /^slices?$/, stick: /^sticks?$/, bunch: /^bunch(es)?$/, head: /^heads?$/, qt: /^(quarts?|qts?\.?)$/,
  pt: /^(pints?|pts?\.?)$/, gal: /^(gallons?|gal\.?)$/, sprig: /^sprigs?$/, handful: /^handfuls?$/,
}

function num(tok) {
  if (!tok) return null
  let t = tok
  for (const [f, v] of Object.entries(UNICODE_FRAC)) {
    if (t.includes(f)) { const whole = parseFloat(t.replace(f, '')) || 0; return whole + v }
  }
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/'); return +a / +b }
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  return null
}

// "2 1/2 cups shredded cheddar cheese, divided" → { raw, qty: 2.5, unit: 'cup', name: 'shredded cheddar cheese' }
export function parseIngredient(line) {
  const raw = String(line).replace(/\s+/g, ' ').trim()
  let s = raw.replace(/^[-•*▢☐□]\s*/, '').replace(/(\d)([½⅓⅔¼¾⅛])/g, '$1 $2')
  const toks = s.split(' ')
  let qty = null
  let i = 0
  // quantity: "2", "1/2", "2 1/2", "½", "1-2" (take the first)
  const first = toks[0]?.replace(/[-–].*$/, '')
  if (num(first) !== null) {
    qty = num(first); i = 1
    if (num(toks[1]) !== null && /\//.test(toks[1] || '') || /^[½⅓⅔¼¾⅛]$/.test(toks[1] || '')) { qty += num(toks[1]); i = 2 }
  }
  // parenthetical size like "(14 oz)" after the number
  if (toks[i]?.startsWith('(')) { while (i < toks.length && !toks[i].includes(')')) i++; i++ }
  let unit = null
  if (toks[i]) {
    const w = toks[i].replace(/[.,]$/, '')
    for (const [u, re] of Object.entries(UNITS)) if (re.test(w) && !(w === 't' && qty === null)) { unit = u; i++; break }
  }
  if (toks[i] === 'of') i++
  let name = toks.slice(i).join(' ')
  name = name.replace(/\(.*?\)/g, '').split(',')[0].replace(/\s+(to taste|or more|optional|divided|for serving|plus more.*)$/i, '').trim()
  if (!name) name = raw
  return { raw, qty, unit, name }
}

const SECTION = {
  ingredients: /^(ingredients?|you(’|')?ll need|what you(’|')?ll need|what you need|shopping list)\b[^a-z]*$/i,
  steps: /^(instructions?|directions?|method|steps?|preparation|how to make( it)?|procedure)\b[^a-z]*$/i,
  skip: /^(notes?|recipe notes|nutrition( facts| information)?|tips?|equipment|video|did you make this.*|rate this recipe.*|reviews?|comments?|related.*|more recipes.*)\b.*$/i,
}
// Junk lines that recipe cards add when copied.
const JUNK = /^(\d+x\s*)+$|^(us customary|metric|cups?|imperial)(\s*(\||·)?\s*(us customary|metric|cups?|imperial))*$|^(print|pin|save|jump to recipe|rate|share|email|scale|course|cuisine|keyword|author|calories|servings?|prep time|cook time|total time|additional time|resting time|yield)\b.{0,40}$|^\d+\s*(mins?|minutes|hours?|hrs?)$|^(advertisement|ad)$/i

export function parsePastedRecipe(text) {
  const lines = String(text).split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[▢☐□✓✔]\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
  let title = ''
  let servings = null
  let prep = null
  let cook = null
  const ingredients = []
  const steps = []
  let mode = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const sv = line.match(/^(serves|servings|yield|makes)\s*:?\s*(\d+)/i)
    if (sv) { servings = +sv[2]; continue }
    const tm = line.match(/^(prep|cook)\s*time\s*:?\s*(\d+)\s*(hours?|hrs?|mins?|minutes)?/i)
    if (tm) { const m = +tm[2] * (/^h/i.test(tm[3] || '') ? 60 : 1); if (/prep/i.test(tm[1])) prep = m; else cook = m; continue }
    if (SECTION.ingredients.test(line)) { mode = 'ing'; continue }
    if (SECTION.steps.test(line)) { mode = 'steps'; continue }
    if (mode && SECTION.skip.test(line)) { mode = 'skip'; continue }
    if (JUNK.test(line)) continue
    if (!mode) {
      const junkTitle = /skip to|»|›|\bvotes?\b|\bfrom \d|\breviews?\b|^\d+(\.\d+)?$|\bmenu\b|\bsearch\b|subscribe|log ?in|sign ?up|newsletter|^home\b|cookie|privacy/i
      if (!title && line.length > 3 && line.length < 90 && !/^[\d½⅓⅔¼¾⅛]/.test(line) && !junkTitle.test(line)) title = line
      continue
    }
    if (mode === 'ing') {
      if (/^for the\b|:$/i.test(line) && !/^[\d½⅓⅔¼¾⅛]/.test(line)) continue // sub-headers like "For the sauce:"
      if (line.length > 140) continue
      ingredients.push(line.replace(/^[-•*]\s*/, ''))
    } else if (mode === 'steps') {
      if (/^step\s*\d+$/i.test(line) || /^\d+$/.test(line)) continue
      steps.push(line.replace(/^(step\s*)?\d+[.):]\s*/i, '').replace(/^[-•*]\s*/, ''))
    }
  }
  return { title, servings, prep_minutes: prep, cook_minutes: cook, ingredients, steps }
}

// ---------- Matching ingredients to the inventory ----------
const STOP = new Set(['fresh', 'large', 'small', 'medium', 'chopped', 'diced', 'minced', 'sliced', 'shredded', 'grated', 'ground',
  'boneless', 'skinless', 'whole', 'low', 'fat', 'reduced', 'sodium', 'unsalted', 'salted', 'extra', 'virgin', 'cold', 'warm',
  'hot', 'softened', 'melted', 'room', 'temperature', 'finely', 'roughly', 'thinly', 'packed', 'light', 'dark', 'organic',
  'of', 'and', 'or', 'the', 'a', 'to', 'for', 'into', 'cut', 'pieces', 'piece', 'cubed', 'peeled', 'raw', 'cooked', 'frozen',
  'canned', 'dried', 'plain', 'all', 'purpose', 'crushed', 'about', 'lean', 'thick', 'thin', 'jumbo', 'baby'])

const singular = (w) => w.replace(/(ies)$/, 'y').replace(/(oes|ches|shes|sses|xes)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1')
export const keyWords = (s) => String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 1 && !STOP.has(w)).map(singular)

// Always-on-hand basics so they don't count as "missing".
export const STAPLES = ['salt', 'pepper', 'black pepper', 'water', 'ice', 'oil', 'olive oil', 'vegetable oil', 'cooking spray', 'kosher salt', 'sea salt']
const isStaple = (name) => {
  const k = keyWords(name).join(' ')
  return STAPLES.some((s) => keyWords(s).join(' ') === k) || /^(salt|pepper|water)\b/.test(k) || /\bsalt and pepper\b/i.test(name)
}

const DIFFERENT_THING = new Set(['broth', 'stock', 'chip', 'sauce', 'powder', 'extract', 'bouillon', 'soup', 'juice', 'zest',
  'flake', 'seasoning', 'paste', 'syrup', 'bar', 'cube', 'dressing', 'spread', 'mix', 'chocolate', 'cracker', 'cookie', 'noodle', 'bread', 'crumb', 'vinegar', 'milk'])

// Find the inventory item an ingredient refers to (or null).
export function matchItem(ingName, items) {
  const ik = keyWords(ingName)
  if (!ik.length) return null
  let best = null
  let bestScore = 0
  for (const it of items) {
    const nk = keyWords(it.name)
    if (!nk.length) continue
    const shared = nk.filter((w) => ik.includes(w)).length
    if (!shared) continue
    // "chicken broth" isn't chicken; "milk chocolate chips" isn't milk.
    const head = ik[ik.length - 1]
    if (DIFFERENT_THING.has(head) && !nk.includes(head)) continue
    if (shared < nk.length && nk.length <= 2) continue
    // The item's key words should mostly appear in the ingredient ("cheddar" ⊂ "shredded cheddar cheese").
    const score = shared / nk.length + shared / ik.length * 0.5
    if (shared / nk.length >= 0.5 && score > bestScore) { best = it; bestScore = score }
  }
  return best
}

// For each ingredient: { ...ing, status: 'have' | 'missing' | 'staple', item }
export function checkRecipe(recipe, items, inventory) {
  const qtyByItem = {}
  inventory.forEach((r) => { qtyByItem[r.item_id] = (qtyByItem[r.item_id] || 0) + Number(r.quantity) })
  const inStock = items.filter((i) => qtyByItem[i.id] > 0)
  return (recipe.ingredients || []).map((ing) => {
    if (isStaple(ing.name)) return { ...ing, status: 'staple' }
    const item = matchItem(ing.name, inStock)
    if (item) return { ...ing, status: 'have', item }
    return { ...ing, status: 'missing', item: matchItem(ing.name, items) }
  })
}

export function fmtQty(q) {
  if (q == null) return ''
  const whole = Math.floor(q + 1e-9)
  const frac = q - whole
  const fr = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']]
    .find(([v]) => Math.abs(frac - v) < 0.04)
  if (frac < 0.04) return String(whole)
  if (fr) return whole ? `${whole} ${fr[1]}` : fr[1]
  return q.toFixed(1).replace(/\.0$/, '')
}

const UNIT_LABEL = { cup: ['cup', 'cups'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'], oz: ['oz', 'oz'], lb: ['lb', 'lb'], clove: ['clove', 'cloves'], can: ['can', 'cans'], jar: ['jar', 'jars'], pkg: ['package', 'packages'], slice: ['slice', 'slices'], stick: ['stick', 'sticks'], bunch: ['bunch', 'bunches'], head: ['head', 'heads'], pinch: ['pinch', 'pinches'], dash: ['dash', 'dashes'], qt: ['qt', 'qt'], pt: ['pt', 'pt'], gal: ['gal', 'gal'], sprig: ['sprig', 'sprigs'], handful: ['handful', 'handfuls'], g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'] }

// Display an ingredient line at a given scale (e.g. 2 = double).
export function ingredientLine(ing, scale = 1) {
  if (ing.qty == null) return ing.raw
  const q = ing.qty * scale
  const unit = ing.unit ? (UNIT_LABEL[ing.unit] || [ing.unit, ing.unit])[q > 1 ? 1 : 0] : ''
  return [fmtQty(q), unit, ing.name].filter(Boolean).join(' ')
}

export const TAG_PRESETS = ['Keto', 'Low-carb', 'Kid-friendly', 'Quick', 'Crockpot', 'Dinner', 'Breakfast', 'Lunch', 'Snack', 'Dessert', 'Meal prep']

// Guess tags from imported keywords/title.
export function guessTags(recipe) {
  const t = `${recipe.title} ${recipe.keywords || ''}`.toLowerCase()
  const tags = []
  if (/\bketo\b/.test(t)) tags.push('Keto')
  if (/low[- ]?carb/.test(t)) tags.push('Low-carb')
  if (/slow cooker|crock ?pot/.test(t)) tags.push('Crockpot')
  if (/breakfast|pancake|waffle|omelet/.test(t)) tags.push('Breakfast')
  if (/dessert|cake|cookie|brownie|pie\b/.test(t)) tags.push('Dessert')
  const total = (recipe.prep_minutes || 0) + (recipe.cook_minutes || 0)
  if (total && total <= 30) tags.push('Quick')
  return tags
}
