// Picks an emoji for an item by name so lists are easy to scan.
const MAP = [
  [/milk|creamer|half.?and.?half/, '🥛'], [/egg/, '🥚'], [/cheese|mozz|cheddar|parm/, '🧀'],
  [/butter/, '🧈'], [/yogurt/, '🥣'], [/bread|bagel|bun|roll(?!s? of)|tortilla|wrap/, '🍞'],
  [/chicken|turkey/, '🍗'], [/cumin|paprika|chili powder|curry|garam|oregano|thyme|basil|cinnamon|nutmeg|seasoning|spice|ginger/, '🧂'], [/beef|steak|burger|ground (beef|chuck|turkey|meat)|sirloin|roast/, '🥩'], [/bacon|ham|pork|sausage|hot ?dog/, '🥓'],
  [/fish|salmon|tuna|shrimp|tilapia/, '🐟'], [/apple/, '🍎'], [/banana/, '🍌'], [/orange|clementine/, '🍊'],
  [/lemon|lime/, '🍋'], [/grape/, '🍇'], [/strawberr|berr/, '🍓'], [/avocado/, '🥑'], [/tomato/, '🍅'],
  [/potato/, '🥔'], [/green onion|scallion/, '🌱'], [/onion|garlic/, '🧅'], [/carrot/, '🥕'], [/broccoli|lettuce|spinach|salad|greens|kale/, '🥬'],
  [/pepper(?!oni)/, '🫑'], [/corn/, '🌽'], [/mushroom/, '🍄'], [/cucumber|pickle/, '🥒'],
  [/rice/, '🍚'], [/pasta|spaghetti|noodle|mac/, '🍝'], [/cereal|oat/, '🥣'], [/flour|sugar|baking/, '🧂'],
  [/salt|spice|seasoning|pepperoni/, '🧂'], [/oil|vinegar/, '🫒'], [/sauce|ketchup|mustard|mayo|salsa|dressing/, '🥫'],
  [/soup|bean|can/, '🥫'], [/coffee/, '☕'], [/tea/, '🍵'], [/juice/, '🧃'], [/soda|coke|pepsi|sprite/, '🥤'],
  [/water/, '💧'], [/beer|wine|vodka|whiskey|liquor/, '🍺'], [/chip|crisp|pretzel|popcorn/, '🍿'],
  [/cookie|cracker/, '🍪'], [/chocolate|candy/, '🍫'], [/ice ?cream/, '🍨'], [/pizza/, '🍕'], [/frozen|waffle/, '🧊'],
  [/honey|syrup|jam|jelly|peanut butter/, '🍯'],
  [/paper towel|toilet|tissue|napkin/, '🧻'], [/soap|wash|shampoo|conditioner|body/, '🧴'],
  [/detergent|bleach|cleaner|lysol|clorox|wipes|spray/, '🧽'], [/trash|garbage|bag/, '🗑️'],
  [/foil|wrap|ziploc|plastic/, '📦'], [/toothpaste|toothbrush|floss/, '🪥'], [/battery|batteries/, '🔋'],
  [/diaper/, '🍼'], [/dog|cat|pet/, '🐾'], [/light ?bulb/, '💡'], [/medicine|vitamin|advil|tylenol/, '💊'],
]

export function itemIcon(name = '', fallback = '📦') {
  const n = name.toLowerCase()
  for (const [re, icon] of MAP) if (re.test(n)) return icon
  return fallback
}
