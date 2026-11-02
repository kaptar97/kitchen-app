import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const TABLES = ['locations', 'items', 'inventory', 'shopping_list', 'household_members', 'recipes', 'purchases', 'purchase_items', 'cook_log', 'households']

// Loads everything for one household and keeps it live-synced.
export function useHousehold(householdId) {
  const [data, setData] = useState({
    locations: [], items: [], inventory: [], shopping_list: [], household_members: [], recipes: [], purchases: [], purchase_items: [], cook_log: [], households: [],
  })
  const [loading, setLoading] = useState(true)
  const timers = useRef({})

  const load = useCallback(async (table) => {
    let q = table === 'households'
      ? supabase.from(table).select('*').eq('id', householdId)
      : supabase.from(table).select('*').eq('household_id', householdId)
    if (table === 'purchases') q = q.order('purchased_on', { ascending: false })
    if (table === 'cook_log') q = q.order('made_at', { ascending: false })
    if (table === 'locations') q = q.order('sort')
    if (table === 'items') q = q.order('name')
    if (table === 'shopping_list') q = q.order('created_at')
    const { data: rows, error } = await q
    if (!error) setData((d) => ({ ...d, [table]: rows }))
  }, [householdId])

  const refresh = useCallback(async () => {
    await Promise.all(TABLES.map(load))
  }, [load])

  useEffect(() => {
    if (!householdId) return
    let alive = true
    setLoading(true)
    refresh().then(() => alive && setLoading(false))

    // Live updates: when anyone in the family changes something, reload that table.
    const channel = supabase.channel(`hh-${householdId}`)
    TABLES.forEach((table) => {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'households' ? `id=eq.${householdId}` : `household_id=eq.${householdId}` },
        () => {
          clearTimeout(timers.current[table])
          timers.current[table] = setTimeout(() => load(table), 150)
        })
    })
    channel.subscribe()

    // Catch up when the app comes back to the foreground.
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [householdId, load, refresh])

  return { ...data, loading, refresh, reload: load }
}
