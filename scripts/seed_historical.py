"""
Seed 90 days of historical orders + 40 fabricated students.
Realistic DoW patterns: Mon slow, Wed/Fri peak, weekends 40% drop.
Category-specific timing: chai steady, meals lunch-heavy.

Usage:
  pip install supabase python-dotenv
  # .env in same dir:
  #   SUPABASE_URL=https://xxx.supabase.co
  #   SUPABASE_SERVICE_ROLE_KEY=eyJ...
  python seed_historical.py
"""

import os
import random
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---- Config ----------------------------------------------------------------
DAYS_BACK = 90
NEW_STUDENTS = 40
random.seed(42)

# Weekday multipliers (Mon=0 ... Sun=6)
DOW_MULT = {0: 0.75, 1: 0.95, 2: 1.15, 3: 1.00, 4: 1.20, 5: 0.55, 6: 0.45}

# Hour-of-day base weights (24h) — canteen busy at breakfast, lunch, tea
HOUR_WEIGHTS = [
    0, 0, 0, 0, 0, 0, 0.2, 0.8, 1.5, 1.0,   # 0-9
    0.6, 0.8, 2.5, 3.0, 1.8, 0.9, 1.2, 1.4,  # 10-17 (lunch 12-14, tea 16-17)
    0.7, 0.3, 0.1, 0, 0, 0                    # 18-23
]

CATEGORY_HOUR_BIAS = {
    "meal":     [0,0,0,0,0,0,0,0,0,0.3,0.5,1.0,3.0,2.5,0.8,0.3,0.4,0.6,0.3,0,0,0,0,0],
    "meals":    [0,0,0,0,0,0,0,0,0,0.3,0.5,1.0,3.0,2.5,0.8,0.3,0.4,0.6,0.3,0,0,0,0,0],
    "snack":    [0,0,0,0,0,0,0.3,0.8,1.0,0.8,0.9,1.0,1.5,1.3,1.2,1.0,1.4,1.5,0.6,0.3,0,0,0,0],
    "snacks":   [0,0,0,0,0,0,0.3,0.8,1.0,0.8,0.9,1.0,1.5,1.3,1.2,1.0,1.4,1.5,0.6,0.3,0,0,0,0],
    "beverage": [0,0,0,0,0,0,0.5,1.2,1.3,1.0,1.0,1.0,1.5,1.2,1.0,1.0,1.6,1.7,0.8,0.4,0,0,0,0],
    "beverages":[0,0,0,0,0,0,0.5,1.2,1.3,1.0,1.0,1.0,1.5,1.2,1.0,1.0,1.6,1.7,0.8,0.4,0,0,0,0],
    "dessert":  [0,0,0,0,0,0,0,0.2,0.3,0.4,0.5,0.6,1.2,1.5,1.0,0.8,1.0,0.9,0.4,0.2,0,0,0,0],
    "desserts": [0,0,0,0,0,0,0,0.2,0.3,0.4,0.5,0.6,1.2,1.5,1.0,0.8,1.0,0.9,0.4,0.2,0,0,0,0],
}

BASE_DAILY_ORDERS = 250  # scales with DoW mult → ~1900 rows over 90d


# ---- Fabricated students ---------------------------------------------------
FIRST = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Rudra",
         "Ananya","Diya","Aadhya","Saanvi","Aaradhya","Anika","Navya","Kiara","Myra","Sara",
         "Rohan","Kabir","Aryan","Dhruv","Kartik","Neel","Om","Ved","Yash","Zayn",
         "Isha","Riya","Kavya","Meera","Nisha","Priya","Rhea","Tara","Zoya","Aisha"]
LAST = ["Sharma","Verma","Iyer","Nair","Menon","Patel","Shah","Rao","Reddy","Kulkarni",
        "Joshi","Desai","Mehta","Kapoor","Singh","Gupta","Bose","Chatterjee","Das","Banerjee"]


def make_students(n):
    used = set()
    students = []
    while len(students) < n:
        f = random.choice(FIRST); l = random.choice(LAST)
        name = f"{f} {l}"
        email = f"{f.lower()}.{l.lower()}{random.randint(10,99)}@nmims.edu.in"
        if email in used: continue
        used.add(email)
        students.append({"id": str(uuid4()), "email": email, "full_name": name})
    return students


# ---- Load menu -------------------------------------------------------------
menu = sb.table("menu_items").select("id, name, price, category, prep_seconds").execute().data
if not menu:
    raise SystemExit("menu_items is empty — seed the menu first.")

by_cat = {}
for m in menu:
    by_cat.setdefault(m["category"].lower(), []).append(m)


# ---- Insert students -------------------------------------------------------
students = make_students(NEW_STUDENTS)
print(f"Inserting {len(students)} students...")
for s in students:
    try:
        sb.table("profiles").insert(s).execute()
    except Exception as e:
        print(f"  skip {s['email']}: {e}")

all_students = sb.table("profiles").select("id, email, full_name").execute().data
print(f"Total students in DB: {len(all_students)}")


# ---- Generate 90 days of orders --------------------------------------------
now_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

orders_batch = []
items_batch = []

for day_offset in range(DAYS_BACK, 0, -1):
    day = now_utc - timedelta(days=day_offset)
    dow = day.weekday()
    day_mult = DOW_MULT[dow]
    n_orders = int(BASE_DAILY_ORDERS * day_mult * random.uniform(0.85, 1.15))

    for _ in range(n_orders):
        # Pick hour weighted by HOUR_WEIGHTS
        hour = random.choices(range(24), weights=HOUR_WEIGHTS, k=1)[0]
        minute = random.randint(0, 59)
        placed = day.replace(hour=hour, minute=minute, second=random.randint(0, 59))

        student = random.choice(all_students)

        # 1-4 items per order
        n_items = random.choices([1, 2, 3, 4], weights=[0.4, 0.35, 0.2, 0.05], k=1)[0]
        order_id = str(uuid4())

        order_lines = []
        total = 0
        for _ in range(n_items):
            # Pick category weighted by hour bias
            cat_weights = []
            cats = list(by_cat.keys())
            for c in cats:
                bias = CATEGORY_HOUR_BIAS.get(c, [1]*24)[hour]
                cat_weights.append(max(bias, 0.05))
            cat = random.choices(cats, weights=cat_weights, k=1)[0]
            item = random.choice(by_cat[cat])
            qty = random.choices([1, 2, 3], weights=[0.75, 0.2, 0.05], k=1)[0]
            price = float(item["price"])
            total += price * qty
            order_lines.append({
                "order_id": order_id,
                "item_id": item["id"],
                "quantity": qty,
                "unit_price": price,
            })

        prep = max((item.get("prep_seconds") or 300), 60)
        ready = placed + timedelta(seconds=prep + random.randint(-60, 120))
        completed = ready + timedelta(seconds=random.randint(30, 300))

        orders_batch.append({
            "id": order_id,
            "student_id": student["id"],
            "status": "completed",
            "total_amount": round(total, 2),
            "placed_at": placed.isoformat(),
            "ready_at": ready.isoformat(),
            "completed_at": completed.isoformat(),
        })
        items_batch.extend(order_lines)

    # Flush every 7 days to avoid huge single insert
    if len(orders_batch) > 300:
        print(f"  flushing {len(orders_batch)} orders (day -{day_offset})...")
        sb.table("orders").insert(orders_batch).execute()
        # Insert items in chunks of 500 to stay under API limits
        for i in range(0, len(items_batch), 500):
            sb.table("order_items").insert(items_batch[i:i+500]).execute()
        orders_batch = []
        items_batch = []

# Final flush
if orders_batch:
    print(f"  final flush: {len(orders_batch)} orders...")
    sb.table("orders").insert(orders_batch).execute()
    for i in range(0, len(items_batch), 500):
        sb.table("order_items").insert(items_batch[i:i+500]).execute()

print("Done.")
print("\nVerification query for Supabase SQL editor:")
print("  SELECT date(placed_at) d, count(*) FROM orders WHERE placed_at > now() - interval '90 days' GROUP BY d ORDER BY d;")
