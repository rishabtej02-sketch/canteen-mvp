-- ============================================================================
-- Phase 4b — Live ingredient decrement on order placement
-- ============================================================================
-- Mirrors the Phase 1 dish-stock trigger, but for ingredients: when an order
-- item is inserted, subtract that item's recipe quantities (x qty ordered)
-- from ingredients.stock_qty. Makes Inventory a REAL live tally, not just a
-- projection.
--
-- greatest(...,0) floors stock at 0 (never negative).
-- Fires per order_item row on INSERT only -> historical orders unaffected.
-- ============================================================================

create or replace function public.decrement_ingredients_on_order_item()
returns trigger
language plpgsql
as $$
begin
  update public.ingredients ing
     set stock_qty  = greatest(ing.stock_qty - (r.qty_per_serving * NEW.quantity), 0),
         updated_at = now()
    from public.recipes r
   where r.item_id       = NEW.item_id
     and r.ingredient_id = ing.id;
  return NEW;
end;
$$;

drop trigger if exists trg_decrement_ingredients on public.order_items;

create trigger trg_decrement_ingredients
  after insert on public.order_items
  for each row
  execute function public.decrement_ingredients_on_order_item();

-- ---------------------------------------------------------------------------
-- Sanity: confirm trigger is attached
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgname = 'trg_decrement_ingredients' and not tgisinternal;
  if n < 1 then raise exception 'trigger not created'; end if;
  raise notice 'trg_decrement_ingredients attached on order_items';
end $$;
