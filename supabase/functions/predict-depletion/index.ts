// ============================================================================
// Edge Function: predict-depletion
// ============================================================================
// Runs every 15 min (cron). For each ingredient, projects when it runs out
// today given remaining demand, and upserts at-risk ingredients into
// depletion_alerts (KDS subscribes via realtime).
//
// Explainable model (no black box), mirrors eta_v1's transparency:
//   placed_today[item]      = sold_today + in_flight_queue
//   remaining_to_cook[item] = max(day_target - placed_today, 0)
//   future_burn[ingredient] = Σ remaining_to_cook[item] * qty_per_serving
//
// NOTE (Phase 4b): stock_qty is decremented on order PLACEMENT by the
// trg_decrement_ingredients trigger, so sold + queue are ALREADY reflected in
// current stock. Future burn therefore counts only demand not yet placed —
// counting the queue again would double-subtract it.
//   burn_per_min            = future_burn / remaining_service_min
//   minutes_to_empty        = stock_qty / burn_per_min
//   projected_empty_at      = now + minutes_to_empty
// At-risk if it empties before close OR is already <= reorder_threshold.
//
// day_target[item] = accepted_qty ?? predicted_qty  (from daily_forecasts today)
// sold_today       = qty in orders with status ready|completed today
// in_flight_queue  = qty in orders with status pending|preparing (locked queue def)
//
// Augmentation lives in the KDS banner (operator marks items sold-out / defers);
// this function only predicts. Every run logs to model_runs (depletion_v1).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL_NAME = 'depletion_v1'
const CLOSE_HOUR_IST = 22          // service closes 22:00 IST
const IST_OFFSET_MIN = 330         // UTC+5:30
const MIN_SERVICE_MIN = 30         // floor so late-day math stays sane
const CRITICAL_MIN = 60            // <60 min to empty => critical

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface IngredientRow { id: number; name: string; stock_qty: number; reorder_threshold: number }
interface RecipeRow { item_id: number; ingredient_id: number; qty_per_serving: number }
interface ForecastRow { item_id: number; predicted_qty: number; accepted_qty: number | null }
interface OrderRow { id: string; status: string }
interface OrderItemRow { order_id: string; item_id: number; quantity: number }
interface MenuRow { id: number; name: string; is_available: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const t0 = Date.now()
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // --- remaining service minutes (IST-aware) -------------------------------
    const now = new Date()
    const istNow = new Date(now.getTime() + IST_OFFSET_MIN * 60_000)
    const closeIst = new Date(istNow)
    closeIst.setUTCHours(CLOSE_HOUR_IST, 0, 0, 0)
    let remainingServiceMin = (closeIst.getTime() - istNow.getTime()) / 60_000
    if (remainingServiceMin < MIN_SERVICE_MIN) remainingServiceMin = MIN_SERVICE_MIN

    // --- today's UTC window for order/forecast filtering ---------------------
    const istMidnight = new Date(istNow); istMidnight.setUTCHours(0, 0, 0, 0)
    const dayStartUtc = new Date(istMidnight.getTime() - IST_OFFSET_MIN * 60_000)
    const todayStr = istNow.toISOString().slice(0, 10)   // YYYY-MM-DD in IST

    // --- 1. ingredients ------------------------------------------------------
    const { data: ingredients, error: ingErr } = await supabase
      .from('ingredients')
      .select('id, name, stock_qty, reorder_threshold')
    if (ingErr) throw new Error(`ingredients fetch failed: ${ingErr.message}`)

    // --- 2. recipes ----------------------------------------------------------
    const { data: recipes, error: recErr } = await supabase
      .from('recipes')
      .select('item_id, ingredient_id, qty_per_serving')
    if (recErr) throw new Error(`recipes fetch failed: ${recErr.message}`)

    // --- 3. menu (availability + names) --------------------------------------
    const { data: menu, error: menuErr } = await supabase
      .from('menu_items')
      .select('id, name, is_available')
    if (menuErr) throw new Error(`menu fetch failed: ${menuErr.message}`)
    const menuById = new Map<number, MenuRow>()
    for (const m of (menu ?? []) as MenuRow[]) menuById.set(Number(m.id), m)

    // --- 4. today's forecast target per item ---------------------------------
    const { data: forecasts, error: fErr } = await supabase
      .from('daily_forecasts')
      .select('item_id, predicted_qty, accepted_qty')
      .eq('forecast_date', todayStr)
    if (fErr) throw new Error(`forecast fetch failed: ${fErr.message}`)
    const targetByItem = new Map<number, number>()
    for (const f of (forecasts ?? []) as ForecastRow[]) {
      const t = f.accepted_qty != null ? Number(f.accepted_qty) : Number(f.predicted_qty)
      targetByItem.set(Number(f.item_id), t)
    }

    // --- 5. today's orders -> split sold vs in-flight (two-step, no join) -----
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id, status')
      .gte('placed_at', dayStartUtc.toISOString())
    if (oErr) throw new Error(`orders fetch failed: ${oErr.message}`)

    const soldOrderIds: string[] = []
    const queueOrderIds: string[] = []
    for (const o of (orders ?? []) as OrderRow[]) {
      if (o.status === 'ready' || o.status === 'completed') soldOrderIds.push(o.id)
      else if (o.status === 'pending' || o.status === 'preparing') queueOrderIds.push(o.id)
    }

    const soldQtyByItem = await sumItemQty(supabase, soldOrderIds)
    const queueQtyByItem = await sumItemQty(supabase, queueOrderIds)

    // --- 6. remaining_to_cook per item ---------------------------------------
    const itemIds = new Set<number>((recipes ?? []).map((r: RecipeRow) => Number(r.item_id)))
    const remainingByItem = new Map<number, number>()
    for (const itemId of itemIds) {
      const m = menuById.get(itemId)
      if (m && m.is_available === false) { remainingByItem.set(itemId, 0); continue } // sold-out => no future burn
      const target = targetByItem.get(itemId) ?? 0
      const sold = soldQtyByItem.get(itemId) ?? 0
      const queue = queueQtyByItem.get(itemId) ?? 0
      // stock already reflects placed orders (sold+queue) via the decrement
      // trigger; future burn = only demand not yet placed.
      const placed = sold + queue
      const remaining = Math.max(target - placed, 0)
      remainingByItem.set(itemId, remaining)
    }

    // --- 7. future burn per ingredient ---------------------------------------
    interface Burn { total: number; items: { id: number; name: string }[] }
    const burnByIng = new Map<number, Burn>()
    for (const r of (recipes ?? []) as RecipeRow[]) {
      const remaining = remainingByItem.get(Number(r.item_id)) ?? 0
      if (remaining <= 0) continue
      const add = remaining * Number(r.qty_per_serving)
      const ingId = Number(r.ingredient_id)
      const b = burnByIng.get(ingId) ?? { total: 0, items: [] }
      b.total += add
      const m = menuById.get(Number(r.item_id))
      if (m && m.is_available !== false) b.items.push({ id: Number(r.item_id), name: m.name })
      burnByIng.set(ingId, b)
    }

    // --- 8. evaluate each ingredient -----------------------------------------
    const atRisk: {
      ingredient_id: number
      ingredient_name: string
      projected_empty_at: string | null
      minutes_to_empty: number | null
      burn_per_min: number | null
      severity: string
      affected_items: { id: number; name: string }[]
    }[] = []

    for (const ing of (ingredients ?? []) as IngredientRow[]) {
      const b = burnByIng.get(Number(ing.id))
      const stock = Number(ing.stock_qty)
      const belowThreshold = stock <= Number(ing.reorder_threshold)

      let minutesToEmpty: number | null = null
      let burnPerMin: number | null = null
      let emptyAt: string | null = null
      let willEmptyToday = false

      if (b && b.total > 0) {
        burnPerMin = b.total / remainingServiceMin
        minutesToEmpty = burnPerMin > 0 ? stock / burnPerMin : null
        if (minutesToEmpty != null) {
          willEmptyToday = minutesToEmpty < remainingServiceMin
          emptyAt = new Date(now.getTime() + minutesToEmpty * 60_000).toISOString()
        }
      }

      if (!willEmptyToday && !belowThreshold) continue // not at risk

      const severity =
        (minutesToEmpty != null && minutesToEmpty < CRITICAL_MIN) || belowThreshold
          ? 'critical' : 'warning'

      atRisk.push({
        ingredient_id: Number(ing.id),
        ingredient_name: ing.name,
        projected_empty_at: emptyAt,
        minutes_to_empty: minutesToEmpty != null ? Math.round(minutesToEmpty) : null,
        burn_per_min: burnPerMin != null ? Math.round(burnPerMin * 100) / 100 : null,
        severity,
        affected_items: b?.items ?? [],
      })
    }

    // --- 9. upsert at-risk, clear resolved -----------------------------------
    const atRiskIds = atRisk.map((a) => a.ingredient_id)

    // remove alerts that are no longer at risk (preserve deferred ones handled client-side)
    if (atRiskIds.length > 0) {
      await supabase.from('depletion_alerts').delete().not(
        'ingredient_id', 'in', `(${atRiskIds.join(',')})`,
      )
    } else {
      await supabase.from('depletion_alerts').delete().neq('ingredient_id', -1)
    }

    for (const a of atRisk) {
      await supabase.from('depletion_alerts').upsert({
        ingredient_id: a.ingredient_id,
        ingredient_name: a.ingredient_name,
        projected_empty_at: a.projected_empty_at,
        minutes_to_empty: a.minutes_to_empty,
        burn_per_min: a.burn_per_min,
        severity: a.severity,
        affected_items: a.affected_items,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ingredient_id' })
    }

    // --- 10. audit -----------------------------------------------------------
    try {
      await supabase.from('model_runs').insert({
        model_name: MODEL_NAME,
        run_at: new Date().toISOString(),
        status: 'success',
        items_scored: (ingredients ?? []).length,
        duration_ms: Date.now() - t0,
        notes: JSON.stringify({
          remaining_service_min: Math.round(remainingServiceMin),
          at_risk_count: atRisk.length,
          at_risk: atRisk.map((a) => ({
            ing: a.ingredient_name, mins: a.minutes_to_empty,
            sev: a.severity, affected: a.affected_items.length,
          })),
        }),
      })
    } catch (auditErr) {
      console.error('model_runs insert failed (non-fatal):', auditErr)
    }

    return json({ at_risk: atRisk, remaining_service_min: Math.round(remainingServiceMin) }, 200)
  } catch (err) {
    console.error('predict-depletion error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

// Sum quantity per item across a set of order ids (two-step, no Postgrest join).
async function sumItemQty(
  supabase: ReturnType<typeof createClient>,
  orderIds: string[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (orderIds.length === 0) return out
  const { data, error } = await supabase
    .from('order_items')
    .select('order_id, item_id, quantity')
    .in('order_id', orderIds)
  if (error) throw new Error(`order_items fetch failed: ${error.message}`)
  for (const oi of (data ?? []) as OrderItemRow[]) {
    const k = Number(oi.item_id)
    out.set(k, (out.get(k) ?? 0) + Number(oi.quantity))
  }
  return out
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
