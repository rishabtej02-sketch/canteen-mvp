// supabase/functions/write-actuals/index.ts
// Runs at 23:00 IST → writes today's actual_qty back onto daily_forecasts.
// Drives forecast accuracy metric on operator prep screen.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (_req) => {
  const started = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = today + "T00:00:00Z";
    const endOfDay   = today + "T23:59:59Z";

    // Sum today's completed order_items per item
    const { data: rows, error } = await supabase
      .from("order_items")
      .select("item_id, quantity, order:orders!inner(placed_at, status)")
      .gte("order.placed_at", startOfDay)
      .lte("order.placed_at", endOfDay)
      .eq("order.status", "completed");
    if (error) throw error;

    const actuals: Record<string, number> = {};
    for (const r of rows ?? []) {
      const key = String(r.item_id);
      actuals[key] = (actuals[key] || 0) + Number(r.quantity || 0);
    }

    // Update forecast rows for today
    let updated = 0;
    for (const [item_id, qty] of Object.entries(actuals)) {
      const { error: uErr } = await supabase
        .from("daily_forecasts")
        .update({ actual_qty: qty })
        .eq("item_id", item_id)
        .eq("forecast_date", today);
      if (!uErr) updated++;
    }

    await supabase.from("model_runs").insert({
      model_name: "write-actuals",
      status: "success",
      items_scored: updated,
      duration_ms: Date.now() - started,
      notes: `date=${today}`,
    });

    return new Response(
      JSON.stringify({ ok: true, updated, date: today }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("model_runs").insert({
      model_name: "write-actuals",
      status: "failed",
      duration_ms: Date.now() - started,
      notes: msg.slice(0, 500),
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
