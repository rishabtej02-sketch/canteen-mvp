# Model Card — depletion_v1

## Purpose
Predict, during service, when each kitchen ingredient will run out today, and
surface it to operators on the KDS before it happens — so they can pre-empt
dead orders (a student ordering a dish the kitchen can no longer make).

Covers **Loop A (Skip-the-Queue / kitchen-side)** extension from the MessMind
blueprint: proactive stockout avoidance.

## Approach — explainable formula, not ML
Chosen deliberately (consistent with `eta_v1`): transparency over sophistication
for CLO3. Every number an operator sees can be traced by hand.

```
remaining_to_cook[item]  = max(day_target - sold_today, in_flight_queue)
future_burn[ingredient]  = Σ over items ( remaining_to_cook[item] × qty_per_serving )
burn_per_min             = future_burn / remaining_service_min
minutes_to_empty         = stock_qty / burn_per_min
projected_empty_at       = now + minutes_to_empty
```

Definitions:
- `day_target[item]` = `accepted_qty ?? predicted_qty` from `daily_forecasts` (today). Reuses Phase 2's human-approved forecast.
- `sold_today` = quantity in orders with status `ready | completed` today.
- `in_flight_queue` = quantity in orders with status `pending | preparing` (locked queue definition).
- `remaining_service_min` = minutes from now to 22:00 IST, floored at 30.

An ingredient is **at risk** if it empties before close (`minutes_to_empty <
remaining_service_min`) **or** is already at/below its `reorder_threshold`.
Severity = `critical` if `<60 min` to empty or below threshold, else `warning`.

## Inputs / Outputs
- **In:** `ingredients` (stock, threshold), `recipes` (BOM), `daily_forecasts` (today's target), `orders` + `order_items` (sold + queue), `menu_items` (availability).
- **Out:** `depletion_alerts` (one row per at-risk ingredient: projected empty time, minutes left, burn rate, affected item list, severity). KDS reads via realtime.

## Automation vs augmentation
| Step | Type |
|---|---|
| 15-min projection of stockout time per ingredient | **Automation** — edge fn `predict-depletion` (cron) |
| KDS red banner surfaced to operator | Automation — realtime |
| Mark affected items sold-out | **Augmentation** — operator decides, sets `is_available=false` |
| Defer alert 2h | **Augmentation** — operator judgment |
| Every operator action logged | Automation — `model_runs` (`depletion_v1`, `human_override`) |

The model never marks an item sold-out on its own — it predicts and recommends;
a human commits the customer-facing action.

## Transparency (CLO3)
Alerts are stated in plain language with the reason built in:
`🔴 Onion gone ~1:40 PM · ~35 min left · 8 items affected: Vada Pav, Pav Bhaji, …`
No opaque "AI hid these items." Affected list is always shown before any action.

## Fairness
Depletion uses only **operational** inputs — stock levels, recipes, forecast
targets, order counts. It does **not** use any student attribute (identity,
history, spend, demographics). Stockout risk is a property of the kitchen, not
of who is ordering. Sold-out decisions apply to a dish for everyone equally.

## Known limitations / failure modes
- **Fabricated stock + recipes** — quantities are seeded estimates for the MVP, not measured yields. Real deployment needs a stock-count workflow.
- **Even-burn assumption** — spreads remaining demand evenly across service time; a lunch spike empties faster than projected. Mitigated by the 15-min refresh and operator override.
- **Unmodeled ingredients** — Fresh Lime Soda, Upma (semolina), packaged Water/Coke have partial/no BOM; they will under-report burn. Acceptable for demo.
- **No supplier restock signal** — a mid-day top-up isn't reflected until stock_qty is manually updated.
- **Sold-out is one-way in UI** — reversing requires re-enabling the item in stock/menu admin.

## Audit
- Every run: `model_runs` row, `status='success'`, `items_scored`=#ingredients, payload in `notes`.
- Every operator action: `status='human_override'`, action + affected items in `notes`.
- Verify: `SELECT status, count(*) FROM model_runs WHERE model_name='depletion_v1' GROUP BY 1;`
