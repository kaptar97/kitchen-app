// Each storage location gets its own color so you can tell where things live at a glance.
const LOC_COLORS = [
  [/fridge|refrig/i, '#3D8FD1'],
  [/freez/i, '#6A6FE0'],
  [/pantry|cupboard|cabinet/i, '#D99520'],
  [/garage|basement|storage/i, '#7C8798'],
  [/bath/i, '#D4679A'],
  [/clean|laundry/i, '#1FA58C'],
]
export function locColor(name = '') {
  for (const [re, c] of LOC_COLORS) if (re.test(name)) return c
  return '#2F7A63'
}
