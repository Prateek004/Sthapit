// All money: INTEGER PAISE (1 ₹ = 100 paise)

export type BusinessType = "cafe" | "restaurant" | "food_truck" | "kiosk" | "bakery" | "franchise";
export type UserRole = "owner" | "cashier";
export type ServiceMode = "dine_in" | "takeaway" | "delivery";
export type PaymentMethod = "cash" | "upi" | "split";

export interface StockSettings {
  tablesEnabled: boolean;
  kotEnabled: boolean;
  barEnabled: boolean;
  tableCount: number;
  openTableBilling?: boolean;
  activeTab?: string;
}

export interface UserSession {
  userId: string;
  username: string;
  role: UserRole;
  businessName: string;
  businessType: BusinessType;
  gstPercent: number;
  upiId?: string;
  stockSettings?: StockSettings;
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
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
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
}

export interface OpenTable {
  id: string;
  tableNumber: number;
  items: CartItem[];
  openedAt: string;
  updatedAt: string;
}
