export type ItemCategory = "mains" | "snacks" | "beverages" | "desserts";
export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";
export type UserRole = "student" | "operator" | "admin";

// IDs may be bigint OR uuid depending on how the DB was originally seeded —
// keep them as `number | string` so both survive.
export type RowId = number | string;

export interface MenuItem {
  id: RowId;
  external_id: string | null;
  name: string;
  category: ItemCategory;
  price: number;
  is_available: boolean;
  prep_seconds: number;
  image_url: string | null;
  created_at: string;
  // Phase 1 (stock):
  stock_today?: number;
  stock_cap?: number;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface OrderRow {
  id: RowId;
  student_id: string | null;
  status: OrderStatus;
  total_amount: number;
  eta_seconds: number | null;
  placed_at: string;
  ready_at: string | null;
  completed_at: string | null;
}

export interface OrderItemRow {
  id: RowId;
  order_id: RowId;
  item_id: RowId;
  quantity: number;
  unit_price: number;
}

export interface CartLine {
  item: MenuItem;
  qty: number;
}

export interface OrderWithItems extends OrderRow {
  order_items: (OrderItemRow & {
    menu_items?: Partial<Pick<MenuItem, "name" | "prep_seconds" | "category">> | null;
  })[];
  profiles?: Pick<Profile, "full_name" | "email"> | null;
}

// Phase 2 (forecast):
export interface DailyForecast {
  id: number;
  item_id: RowId;
  forecast_date: string;
  predicted_qty: number;
  actual_qty: number | null;
  accepted_qty: number | null;
  accepted_by: string | null;
  accepted_at: string | null;
  model_version: string;
  created_at: string;
}
