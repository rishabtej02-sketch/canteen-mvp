// ============================================================================
// ETA client helpers
// ============================================================================
// Import into checkout flow (after order insert) and into the orders page
// (for live countdown display).
// ============================================================================

import { getSupabase } from './supabase'

export interface EtaResult {
  eta_sec: number
  lower_sec: number
  upper_sec: number
  queue_depth: number
  mode: string
  reason: string
}

/**
 * Invoke the predict-eta Edge Function for a freshly-inserted order.
 * Non-throwing — returns null on failure so the checkout flow can continue
 * (the orders page will fall back to "ETA calculating…").
 */
export async function predictEta(orderId: string): Promise<EtaResult | null> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.functions.invoke('predict-eta', {
      body: { order_id: orderId },
    })
    if (error) {
      console.error('predictEta invoke error:', error)
      return null
    }
    return data as EtaResult
  } catch (err) {
    console.error('predictEta threw:', err)
    return null
  }
}

/**
 * Format an ETA result as a human string.
 * withRange=true → "~14 min (12–17 min)"
 * withRange=false → "~14 min"
 */
export function formatEta(eta: EtaResult, withRange = true): string {
  const min = Math.round(eta.eta_sec / 60)
  if (!withRange) return `~${min} min`
  const lo = Math.round(eta.lower_sec / 60)
  const hi = Math.round(eta.upper_sec / 60)
  return `~${min} min (${lo}–${hi} min)`
}

/**
 * Compute the live countdown text for an active order.
 * Baseline = placed_at + eta_seconds. Ticks down to 0 then shows "any moment now".
 * If ready_at is set, always shows "Ready!" regardless of ETA.
 */
export function computeCountdown(
  placedAt: string,
  etaSeconds: number,
  readyAt: string | null,
): { text: string; isOverdue: boolean } {
  if (readyAt) return { text: 'Ready!', isOverdue: false }
  const placedMs = new Date(placedAt).getTime()
  const targetMs = placedMs + etaSeconds * 1000
  const now = Date.now()
  const remainingSec = Math.round((targetMs - now) / 1000)
  if (remainingSec <= 0) return { text: 'Any moment now…', isOverdue: true }
  const min = Math.floor(remainingSec / 60)
  const sec = remainingSec % 60
  if (min === 0) return { text: `${sec}s`, isOverdue: false }
  return { text: `${min}m ${sec}s`, isOverdue: false }
}