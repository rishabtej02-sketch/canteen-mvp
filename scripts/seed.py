"""
Resilient CSV → Supabase seeder for Canteen MVP.

Env (add to a .env file at repo root or export):
    NEXT_PUBLIC_SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...        # service role required for bulk seed

Inputs (put CSVs under data/raw/):
    data/raw/menu_items.csv    columns: external_id,name,category,price[,prep_seconds]
    data/raw/students.csv      columns: student_id[,name][,email]
    data/raw/orders.csv        columns: order_id,student_id,status[,placed_at][,total_amount]
    data/raw/order_items.csv   columns: order_id,item_id,quantity[,unit_price]

Notes:
- Category strings are normalized: "Beverage" -> "beverages", "Snack" -> "snacks", etc.
- Status strings are normalized: "picked" -> "completed", "prep" -> "preparing".
- Missing emails are fabricated as <student_id>@campus.local
- Missing amounts fall back to sum(qty * unit_price) from order_items.
- Uses external_id → internal bigint id maps built from live tables.
"""

from __future__ import annotations
import csv, os, sys, uuid
from pathlib import Path
from typing import Dict, Iterable, List

try:
    from supabase import create_client
except ImportError:
    print("pip install supabase python-dotenv", file=sys.stderr)
    raise

try:
    from dotenv import load_dotenv
    load_dotenv(".env")
    load_dotenv(".env.local")
except ImportError:
    pass

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not URL or not KEY:
    print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
    sys.exit(1)

sb = create_client(URL, KEY)
RAW = Path("data/raw")

CATEGORY_MAP = {
    "main": "mains", "mains": "mains",
    "snack": "snacks", "snacks": "snacks",
    "beverage": "beverages", "beverages": "beverages", "drink": "beverages",
    "dessert": "desserts", "desserts": "desserts", "sweet": "desserts",
}
STATUS_MAP = {
    "pending": "pending", "new": "pending",
    "preparing": "preparing", "prep": "preparing", "cooking": "preparing",
    "ready": "ready",
    "completed": "completed", "picked": "completed", "delivered": "completed", "done": "completed",
    "cancelled": "cancelled", "canceled": "cancelled",
}

def norm_cat(x: str) -> str:
    return CATEGORY_MAP.get((x or "").strip().lower(), "mains")

def norm_status(x: str) -> str:
    return STATUS_MAP.get((x or "").strip().lower(), "pending")

def chunk(rows: Iterable[dict], n: int = 500) -> Iterable[List[dict]]:
    buf: List[dict] = []
    for r in rows:
        buf.append(r)
        if len(buf) >= n:
            yield buf; buf = []
    if buf: yield buf

def read_csv(name: str) -> List[dict]:
    p = RAW / name
    if not p.exists():
        print(f"skip: {p} not found"); return []
    with p.open() as f:
        return list(csv.DictReader(f))

def seed_menu():
    rows = read_csv("menu_items.csv")
    if not rows: return
    out = []
    for r in rows:
        out.append({
            "external_id": r.get("external_id") or r.get("id"),
            "name": r["name"].strip(),
            "category": norm_cat(r.get("category", "")),
            "price": float(r.get("price") or 0),
            "prep_seconds": int(r.get("prep_seconds") or 300),
        })
    for batch in chunk(out):
        sb.table("menu_items").upsert(batch, on_conflict="external_id").execute()
    print(f"menu_items: {len(out)} upserted")

def seed_students() -> Dict[str, str]:
    """Returns map: external student_id (csv) -> profile uuid."""
    rows = read_csv("students.csv")
    if not rows: return {}
    payload = []
    ext_to_uuid: Dict[str, str] = {}
    for r in rows:
        sid = (r.get("student_id") or r.get("id") or "").strip()
        if not sid: continue
        pid = str(uuid.uuid4())
        ext_to_uuid[sid] = pid
        payload.append({
            "id": pid,
            "email": (r.get("email") or f"{sid}@campus.local").strip().lower(),
            "full_name": (r.get("name") or f"Student {sid}").strip(),
            "role": "student",
        })
    for batch in chunk(payload):
        sb.table("profiles").upsert(batch, on_conflict="email").execute()
    print(f"profiles: {len(payload)} upserted")
    return ext_to_uuid

def build_menu_map() -> Dict[str, int]:
    m: Dict[str, int] = {}
    off = 0
    while True:
        res = sb.table("menu_items").select("id,external_id").range(off, off + 999).execute()
        rows = res.data or []
        if not rows: break
        for r in rows:
            if r.get("external_id"):
                m[str(r["external_id"])] = int(r["id"])
        if len(rows) < 1000: break
        off += 1000
    return m

def seed_orders(student_map: Dict[str, str], menu_map: Dict[str, int]):
    orders = read_csv("orders.csv")
    lines  = read_csv("order_items.csv")
    if not orders: return

    # amount fallback from lines
    line_totals: Dict[str, float] = {}
    for l in lines:
        oid = l.get("order_id"); q = float(l.get("quantity") or 1); up = float(l.get("unit_price") or 0)
        if not oid: continue
        line_totals[oid] = line_totals.get(oid, 0.0) + q * up

    # insert orders one-batch, get back ids per csv order_id
    payload = []
    csv_ids = []
    for r in orders:
        oid = (r.get("order_id") or r.get("id") or "").strip()
        if not oid: continue
        payload.append({
            "student_id": student_map.get((r.get("student_id") or "").strip()),
            "status": norm_status(r.get("status", "")),
            "total_amount": float(r.get("total_amount") or line_totals.get(oid, 0.0)),
            "placed_at": r.get("placed_at") or None,
        })
        csv_ids.append(oid)

    inserted: List[dict] = []
    for csv_batch, api_batch in zip(chunk(csv_ids, 500), chunk(payload, 500)):
        res = sb.table("orders").insert(api_batch).execute()
        inserted.extend(res.data or [])
    # map csv order id -> new bigint id in insertion order
    order_map = {csv_ids[i]: inserted[i]["id"] for i in range(len(inserted))}
    print(f"orders: {len(inserted)} inserted")

    # order_items
    li_payload = []
    for l in lines:
        oid = order_map.get((l.get("order_id") or "").strip())
        iid = menu_map.get((l.get("item_id") or l.get("external_item_id") or "").strip())
        if not oid or not iid: continue
        li_payload.append({
            "order_id": oid,
            "item_id": iid,
            "quantity": int(float(l.get("quantity") or 1)),
            "unit_price": float(l.get("unit_price") or 0),
        })
    for batch in chunk(li_payload):
        sb.table("order_items").insert(batch).execute()
    print(f"order_items: {len(li_payload)} inserted")

if __name__ == "__main__":
    seed_menu()
    smap = seed_students()
    mmap = build_menu_map()
    seed_orders(smap, mmap)
    print("done.")
