// All money: INTEGER PAISE (1 ₹ = 100 paise). Never use floats for money.

export type BusinessType = "cafe" | "restaurant" | "food_truck" | "kiosk" | "bakery" | "franchise";
export type UserRole = "owner" | "cashier";
export type ServiceMode = "dine_in" | "takeaway" | "delivery";
export type PaymentMethod = "cash" | "upi" | "split";
export type TableStatus = "AVAILABLE" | "OCCUPIED";
export type OrderStatus = "completed" | "voided" | "refunded";

// ── SaaS plan types ───────────────────────────────────────────
export type Plan = "free" | "starter" | "pro";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export interface Business {
  id: string;
  name: string;
  ownerName?: string;
  businessType: BusinessType;
  phone?: string;
  city?: string;
  gstPercent: number;
  currencySymbol: string;
  upiId?: string;
  stockSettings?: StockSettings;
  ownerUserId?: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  businessId: string;
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  razorpayCustomerId?: string | null;
  razorpaySubscriptionId?: string | null;
  razorpayPlanId?: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface PlanLimits {
  maxMenuItems: number;
  maxStaff: number;
  maxTables: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:    { maxMenuItems: 30,     maxStaff: 1,      maxTables: 4 },
  starter: { maxMenuItems: 150,    maxStaff: 5,      maxTables: 20 },
  pro:     { maxMenuItems: 100000, maxStaff: 100000, maxTables: 100000 },
};

export interface StockSettings {
  tablesEnabled: boolean;
  kotEnabled: boolean;
  barEnabled: boolean;
  tableCount: number;
  openTableBilling?: boolean;
  activeTab?: string;
  /** true = prices already include GST (MRP-inclusive); false = GST is added on top */
  gstInclusive?: boolean;
  /** P1 GUARDRAIL: max discount as % of subtotal. 0/undefined = off.
   *  Cashiers are hard-blocked above this; owners get a warning but may proceed. */
  maxDiscountPercent?: number;
}

export interface UserSession {
  /** Identity of the logged-in person (owner OR cashier). Used for audit attribution. */
  userId: string;
  /** The tenant — ALL data partitioning uses this, not userId. */
  businessId: string;
  username: string;
  role: UserRole;
  businessName: string;
  businessType: BusinessType;
  gstPercent: number;
  upiId?: string;
  stockSettings?: StockSettings;
  /** ISO string — used for inactivity lock timer */
  loggedInAt?: string;
  subscription?: {
    plan: Plan;
    status: SubscriptionStatus;
    trialEndsAt?: string | null;
    isEntitled: boolean;
  };
}

export interface BusinessProfile {
  name: string;
  ownerName: string;
  businessType: BusinessType;
  phone?: string;
  city?: string;
  gstPercent: number;
  currencySymbol: string;
  createdAt: string;
  upiId?: string;
}

export interface AddOn {
  id: string;
  name: string;
  pricePaise: number;
}

export interface MenuItem {
  id: string;
  name: string;
  categoryId: string;
  pricePaise: number;
  costPricePaise?: number;
  isVeg: boolean;
  isAvailable: boolean;
  addOns: AddOn[];
  sizes?: { label: string; pricePaise: number }[];
  portionEnabled?: boolean;
  portions?: { label: string; pricePaise: number }[];
  fastAdd?: boolean;
  updatedAt?: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  updatedAt?: string;
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock?: number;
  costPaise?: number;
  updatedAt: string;
}

/** P0 AI: tracks Resolve/Snooze state for a detected leak. Leaks themselves
 *  are always recomputed fresh from live data — this table only stores the
 *  human decision made about a given leak id, so it survives reloads. */
export type LeakActionStatus = "resolved" | "snoozed";

export interface LeakAction {
  /** Same id as Leak.id from LeakEngine (stable per leak type per day) */
  id: string;
  status: LeakActionStatus;
  updatedAt: string;
}


/** G4 Wastage Tracker: one logged waste event. 3-tap entry, never mandatory.
 *  valuePaise is computed from known cost data when available, else owner-entered. */
export type WastageReason = "spoiled" | "overcooked" | "returned" | "prep_waste" | "other";

export interface WastageEntry {
  id: string;
  /** Display name of what was wasted */
  itemName: string;
  /** Set when the wasted item is a menu item */
  menuItemId?: string;
  /** Set when the wasted item is a raw material */
  rawMaterialId?: string;
  qty: number;
  /** Unit label for raw materials (kg, L, pcs); menu items are counted in plates */
  unit?: string;
  /** Rupee value lost, integer paise */
  valuePaise: number;
  reason: WastageReason;
  createdAt: string;
}

export interface FinishedGood {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  costPricePaise?: number;
  sellingPricePaise?: number;
  expiryDate?: string;
  purchasedAt: string;
  updatedAt: string;
  isInBilling?: boolean;
  billingMenuItemId?: string;
}

export interface CartItem {
  cartId: string;
  menuItemId: string;
  name: string;
  /** CONTRACT: base menu price ONLY — never includes add-ons */
  unitPricePaise: number;
  qty: number;
  tableNumber?: number;
  selectedSize?: string;
  selectedPortion?: string;
  selectedAddOns: AddOn[];
  notes?: string;
}

export interface SplitPayment {
  cashPaise: number;
  upiPaise: number;
}

export interface Order {
  id: string;
  billNumber: string;
  items: CartItem[];
  serviceMode: ServiceMode;
  tableNumber?: number;
  subtotalPaise: number;
  discountPaise: number;
  discountType: "flat" | "percent";
  discountValue: number;
  gstPercent: number;
  gstPaise: number;
  totalPaise: number;
  paymentMethod: PaymentMethod;
  splitPayment?: SplitPayment;
  cashReceivedPaise?: number;
  changePaise?: number;
  createdAt: string;
  syncStatus: "pending" | "synced" | "failed";
  status?: OrderStatus;
  voidedAt?: string;
  voidReason?: string;
}

/** Legacy open table — kept for backward compat with existing Dexie store */
export interface OpenTable {
  id: string;
  tableNumber: number;
  items: CartItem[];
  openedAt: string;
  updatedAt: string;
}

export interface TableOrderItem {
  cartId: string;
  menuItemId: string;
  name: string;
  /** CONTRACT: base menu price ONLY */
  unitPricePaise: number;
  qty: number;
  selectedSize?: string;
  selectedPortion?: string;
  selectedAddOns: AddOn[];
  notes?: string;
}

export interface TableOrder {
  /** Stable ID = "table_<tableId>" so upsert is idempotent */
  id: string;
  tableId: string;
  tableName: string;
  tableNumber: number;
  status: TableStatus;
  items: TableOrderItem[];
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  totalPaise: number;
  heldAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Increment on every write — higher version wins during sync conflict resolution */
  version: number;
  syncStatus: "pending" | "synced" | "failed";
  /** GST rate locked at table-open time. Rate changes never retroactively alter open tables. */
  gstPercentAtOpen?: number;
}

export interface RestaurantTable {
  id: string;
  name: string;
  tableNumber: number;
  status: TableStatus;
  activeOrderId: string | null;
  updatedAt: string;
}

export interface PersistedCart {
  id: string; // always "active_cart"
  _uid: string;
  items: CartItem[];
  updatedAt: string;
}
