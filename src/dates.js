// Dates in the family's own time zone (toISOString() would use UTC and flip to tomorrow in the evening).
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const localMonth = (d = new Date()) => localDate(d).slice(0, 7)
