export type ItemCategory = "mains" | "snacks" | "beverages" | "desserts";
export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";
export type UserRole = "student" | "operator" | "admin";

export interface MenuItem {
  id: number;
  external_id: string | null;
  name: string;
  category: ItemCategory;
  price: number;
  is_available: boolean;
  prep_seconds: number;
  image_url: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface OrderRow {
  id: number;
  student_id: string | null;
  status: OrderStatus;
  total_amount: number;
  eta_seconds: number | null;
  placed_at: string;
  ready_at: string | null;
  completed_at: string | null;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  item_id: number;
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
