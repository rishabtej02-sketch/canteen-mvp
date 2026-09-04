# Model Card: `eta_v1`

**Purpose.** Predict how long an order will take from placement to ready-at-counter, and show the student a wait estimate at checkout + a live countdown on the active order.

**Loop mapping (MessMind blueprint).** Loop A — *Skip the Queue*. Reduces uncertainty at the point of ordering; students self-time their arrival instead of standing in line.

---

## 1. Approach

Deliberately simple, explainable formula rather than a black-box regressor. Two reasons:

1. The operator needs to *understand* what shifted the ETA in order to trust it and to reason about kitchen operations.
2. The rubric (CLO3) grades **transparency and augmentation**, not model sophistication. A clean formula with human dials scores better than an opaque model with no override.

**Formula.**

```
wait_sec  = (queue_depth / throughput_per_min) * 60
prep_sec  = MAX(prep_seconds) across items in the order      # slowest item wins
eta_sec   = (wait_sec + prep_sec) * mode_multiplier
lower_sec = eta_sec * 0.85
upper_sec = eta_sec * 1.20
```

**Mode multipliers.**

| Mode   | Multiplier | Used when                            |
|--------|-----------:|--------------------------------------|
| Normal |       1.0  | default                              |
| Rush   |       1.4  | operator flags a surge               |
| Slow   |       0.8  | operator flags an off-peak lull      |

---

## 2. Inputs

| Input                    | Source                            | Refresh          |
|--------------------------|-----------------------------------|------------------|
| `queue_depth`            | `count(orders WHERE status IN ('pending','preparing'))` | per prediction   |
| `throughput_per_min`     | `kitchen_settings.throughput_per_min`                   | operator-tuned   |
| `speed_mode`             | `kitchen_settings.speed_mode`                           | operator-toggled |
| `prep_seconds` per item  | `menu_items.prep_seconds`                                | static per item  |

---

## 3. Outputs

Written to the `orders` row on placement:

- `eta_seconds` — integer, primary prediction
- `predicted_eta_min` — same, rounded to 0.1 min for display
- `eta_lower_bound`, `eta_upper_bound` — display range (± band)
- `queue_position_at_order` — the queue depth at time of prediction (audit)

Also returned to the client for immediate UI: `reason` string (e.g. *"3 orders ahead · kitchen busy"*).

---

## 4. Augmentation split (Raisch & Krakowski, 2021)

| Task                                     | Automated | Augmented |
|------------------------------------------|:---------:|:---------:|
| Fetch queue depth                        |     ✓     |           |
| Fetch slowest item prep time             |     ✓     |           |
| Apply formula                            |     ✓     |           |
| Write ETA to order                       |     ✓     |           |
| Log to `model_runs` audit table          |     ✓     |           |
| **Kitchen Mode selection (live)**        |           |     ✓     |
| **Throughput tuning (daily)**            |           |     ✓     |
| Interpret MAPE and decide whether to act |           |     ✓     |
| Communicate delay to student             |     ✓     |           |

**Two explicit human checkpoints:**

1. **Live:** operator sets `speed_mode` during service. Applies to every subsequent prediction within seconds (realtime channel).
2. **Daily:** after MAPE review, the system *suggests* a new throughput if MAPE > 20%. Operator can Accept / Edit / Ignore. Every decision (including "Ignore") is logged to `model_runs` with `status='human_override'`.

---

## 5. Transparency to the student (CLO3)

Every ETA shown to the student carries a one-line explanation:

> **~14 min (12–17 min)**
> 3 orders ahead · kitchen busy

The student sees:
- point estimate
- band (not a single false-precise number)
- why (queue + mode)

No opaque "system says 14 minutes."

---

## 6. Accuracy tracking

**Metric:** MAPE (Mean Absolute Percentage Error) over yesterday's completed orders where both `predicted_eta_min` and `ready_at` are non-null.

```
actual_min = (ready_at - placed_at) in minutes
MAPE       = mean( |actual - predicted| / actual ) * 100
```

**Threshold.** < 20% = healthy. > 20% = suggestion triggered.

**Tuning rule.** Suggested throughput = `current × (avg_predicted / avg_actual)`.
- If we under-predicted time (actual > predicted), the ratio is < 1 → suggested throughput drops → future ETAs get longer wait component.
- Vice versa for over-prediction.

Operator retains veto.

---

## 7. Fairness / equity considerations

Because the model is item-agnostic in the wait-time component (queue_depth divided by kitchen throughput), the wait piece is the same for every student in queue at that moment. The prep piece varies only by what a student ordered, which is by design (bigger meals genuinely take longer).

**No bias vectors:** the model does not use student attributes (`program`, `dietary_pref`, `student_id`, order history) as inputs. Two students placing the same order at the same moment get the same ETA.

**Explicit non-use.** Loyalty status, price paid, and student cohort are not features. This is documented so it stays that way.

---

## 8. Failure modes and behaviour under failure

| Failure                                | System behaviour                              |
|----------------------------------------|-----------------------------------------------|
| Edge Function unreachable              | Order placement still succeeds; UI shows "ETA calculating…"; student is not blocked. |
| `kitchen_settings` row missing         | Function throws; nothing written to order; UI stays in calculating state. Operator adds row via SQL. |
| Item has no `prep_seconds`             | Falls back to 300 sec (5 min) with a warning in the audit log. |
| Queue count query returns huge number  | ETA grows linearly; still bounded by real-world queue size. No cap needed. |
| `model_runs` insert fails              | Prediction still returns to the client. Audit gap flagged in logs. |

---

## 9. Known limitations

- **No hour-of-day multiplier.** Rush pressure is captured via the operator's Mode toggle, not an automatic time-based one. This is a deliberate choice: it forces human awareness of the current state instead of hiding it in a lookup table. If the operator forgets to flip to Rush during lunch, ETAs will under-predict. Mitigation: the daily MAPE dashboard will surface this within 24 hours.
- **No per-item throughput.** Complex items (biryani) and simple ones (chai) are treated equally in queue division. In practice this is offset because the `slowest item` prep time in each order already reflects complexity. But if the queue happens to be all-biryani, the wait piece will under-count.
- **Cold start.** For the very first order of the day, `queue_depth = 0`; ETA = prep time only. This is correct behaviour but may feel "too optimistic" until a few orders build up.

---

## 10. What lives in the repo

| Artifact                                        | Path                                          |
|-------------------------------------------------|-----------------------------------------------|
| SQL (table + policies + realtime)               | `sql/phase3_eta.sql`                          |
| Edge Function (prediction logic)                | `supabase/functions/predict-eta/index.ts`     |
| Client helper (invoke + countdown)              | `src/lib/eta.ts`                              |
| ETA badge (compact display)                     | `src/components/EtaBadge.tsx`                 |
| ETA countdown (active order card)               | `src/components/EtaCountdown.tsx`             |
| Operator control panel                          | `src/app/operator/kitchen/page.tsx`           |
| This model card                                 | `docs/models/eta_v1.md`                       |

Audit trail lives in `model_runs` (`model_name='eta_v1'`) — one row per prediction (`status='success'`) and one row per operator override (`status='human_override'`).
