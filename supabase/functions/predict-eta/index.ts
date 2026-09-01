// ============================================================================
// Edge Function: predict-eta
// ============================================================================
// Called on order placement. Computes ETA, writes back to orders row,
// logs to model_runs for audit trail.
//
// Formula (explainable, no black box):
//   wait_sec = (queue_depth / throughput_per_min) * 60
//   prep_sec = MAX(prep_seconds) across items in this order  (slowest wins)
//   eta_sec  = (wait_sec + prep_sec) * mode_multiplier
//   lower    = eta_sec * 0.85
//   upper    = eta_sec * 1.20
//
// Mode multipliers: Normal=1.0, Rush=1.4, Slow=0.8
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL_NAME = 'eta_v1'
const LOWER_BAND = 0.85
const UPPER_BAND = 1.20
const DEFAULT_PREP_SEC = 300  // 5 min fallback if a menu item is missing prep_seconds

const MODE_MULT: Record<string, number> = {
  Normal: 1.0,
  Rush: 1.4,
  Slow: 0.8,
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EtaResponse {
  eta_sec: number
  lower_sec: number
  upper_sec: number
  queue_depth: number
  mode: string
  reason: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const orderId: string | undefined = body?.order_id
    if (!orderId) return json({ error: 'order_id required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // --- 1. Kitchen settings (singleton row) ---------------------------------
    const { data: ks, error: ksErr } = await supabase
      .from('kitchen_settings')
      .select('speed_mode, throughput_per_min')
      .eq('id', 1)
      .single()

    if (ksErr || !ks) {
      throw new Error(`kitchen_settings fetch failed: ${ksErr?.message ?? 'no row'}`)
    }

    const throughput = Number(ks.throughput_per_min)
    const mode = String(ks.speed_mode)
    const modeMult = MODE_MULT[mode] ?? 1.0

    // --- 2. Queue depth (orders ahead in kitchen) ----------------------------
    const { count: queueCount, error: qErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'preparing'])
      .neq('id', orderId)

    if (qErr) throw new Error(`queue count failed: ${qErr.message}`)
    const queue = queueCount ?? 0

    // --- 3. Slowest prep_seconds across items in this order ------------------
    // Two-step fetch (avoid Postgrest join magic per session-3 lesson)
    const { data: oItems, error: oiErr } = await supabase
      .from('order_items')
      .select('item_id')
      .eq('order_id', orderId)

    if (oiErr) throw new Error(`order_items fetch failed: ${oiErr.message}`)
    if (!oItems || oItems.length === 0) {
      throw new Error(`order ${orderId} has no items`)
    }

    const itemIds = oItems.map((r: { item_id: number }) => r.item_id)
    const { data: menu, error: mErr } = await supabase
      .from('menu_items')
      .select('id, prep_seconds')
      .in('id', itemIds)

    if (mErr) throw new Error(`menu fetch failed: ${mErr.message}`)
    const prepTimes = (menu ?? []).map(
      (m: { prep_seconds: number | null }) => Number(m.prep_seconds ?? DEFAULT_PREP_SEC),
    )
    const slowestPrep = prepTimes.length > 0 ? Math.max(...prepTimes) : DEFAULT_PREP_SEC

    // --- 4. Formula ----------------------------------------------------------
    const waitSec = (queue / throughput) * 60
    const rawEta = (waitSec + slowestPrep) * modeMult
    const etaSec = Math.round(rawEta)
    const lowerSec = Math.round(etaSec * LOWER_BAND)
    const upperSec = Math.round(etaSec * UPPER_BAND)

    // --- 5. Human-readable reason (transparency — CLO3) ----------------------
    const modeText =
      mode === 'Rush' ? 'kitchen busy' :
      mode === 'Slow' ? 'kitchen slow today' :
      'kitchen normal'
    const queueText =
      queue === 0 ? 'no orders ahead' :
      queue === 1 ? '1 order ahead' :
      `${queue} orders ahead`
    const reason = `${queueText} · ${modeText}`

    // --- 6. Write back to orders row -----------------------------------------
    const etaMin = round1(etaSec / 60)
    const lowerMin = round1(lowerSec / 60)
    const upperMin = round1(upperSec / 60)

    const { error: upErr } = await supabase
      .from('orders')
      .update({
        predicted_eta_min: etaMin,
        eta_lower_bound: lowerMin,
        eta_upper_bound: upperMin,
        queue_position_at_order: queue,
        eta_seconds: etaSec,
      })
      .eq('id', orderId)

    if (upErr) throw new Error(`orders update failed: ${upErr.message}`)

    // --- 7. Audit log (best-effort; don't fail the response) -----------------
    try {
      await supabase.from('model_runs').insert({
        model_name: MODEL_NAME,
        run_at: new Date().toISOString(),
        inputs: {
          order_id: orderId,
          queue_depth: queue,
          throughput_per_min: throughput,
          mode,
          slowest_prep_sec: slowestPrep,
          items_count: itemIds.length,
        },
        outputs: {
          eta_sec: etaSec,
          lower_sec: lowerSec,
          upper_sec: upperSec,
          eta_min: etaMin,
        },
        status: 'success',
      })
    } catch (auditErr) {
      console.error('model_runs insert failed (non-fatal):', auditErr)
    }

    const response: EtaResponse = {
      eta_sec: etaSec,
      lower_sec: lowerSec,
      upper_sec: upperSec,
      queue_depth: queue,
      mode,
      reason,
    }
    return json(response, 200)
  } catch (err) {
    console.error('predict-eta error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
