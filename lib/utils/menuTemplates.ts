import type { MenuItem, MenuCategory, BusinessType } from "@/lib/types";

const p = (r: number) => r * 100; // rupees → paise
const uid = (s: string) => s;

export interface MenuTemplate {
  categories: MenuCategory[];
  items: MenuItem[];
}

// ─── CAFE ─────────────────────────────────────────────────────────────────────
const cafe: MenuTemplate = {
  categories: [
    { id: "c-hot", name: "Hot Drinks", sortOrder: 0 },
    { id: "c-cold", name: "Cold Drinks", sortOrder: 1 },
    { id: "c-food", name: "Snacks", sortOrder: 2 },
  ],
  items: [
    {
      id: "ci1", name: "Espresso", categoryId: "c-hot", pricePaise: p(80), isVeg: true, isAvailable: true,
      sizes: [{ label: "Single", pricePaise: p(80) }, { label: "Double", pricePaise: p(130) }],
      addOns: [{ id: "ca1", name: "Extra Shot", pricePaise: p(40) }, { id: "ca2", name: "Oat Milk", pricePaise: p(30) }],
    },
    {
      id: "ci2", name: "Cappuccino", categoryId: "c-hot", pricePaise: p(130), isVeg: true, isAvailable: true,
      sizes: [{ label: "S", pricePaise: p(100) }, { label: "M", pricePaise: p(130) }, { label: "L", pricePaise: p(160) }],
      addOns: [{ id: "ca3", name: "Extra Shot", pricePaise: p(40) }, { id: "ca4", name: "Vanilla Syrup", pricePaise: p(20) }],
    },
    {
      id: "ci3", name: "Latte", categoryId: "c-hot", pricePaise: p(150), isVeg: true, isAvailable: true,
      sizes: [{ label: "S", pricePaise: p(120) }, { label: "M", pricePaise: p(150) }, { label: "L", pricePaise: p(180) }],
      addOns: [{ id: "ca5", name: "Caramel Syrup", pricePaise: p(20) }],
    },
    {
      id: "ci4", name: "Masala Chai", categoryId: "c-hot", pricePaise: p(50), isVeg: true, isAvailable: true,
      addOns: [{ id: "ca6", name: "Extra Ginger", pricePaise: 0 }],
    },
    {
      id: "ci5", name: "Cold Coffee", categoryId: "c-cold", pricePaise: p(150), isVeg: true, isAvailable: true,
      addOns: [{ id: "ca7", name: "Ice Cream Scoop", pricePaise: p(40) }, { id: "ca8", name: "Chocolate Sauce", pricePaise: p(20) }],
    },
    { id: "ci6", name: "Lemonade", categoryId: "c-cold", pricePaise: p(80), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ci7", name: "Croissant", categoryId: "c-food", pricePaise: p(90), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ci8", name: "Club Sandwich", categoryId: "c-food", pricePaise: p(160), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ci9", name: "Chicken Sandwich", categoryId: "c-food", pricePaise: p(190), isVeg: false, isAvailable: true, addOns: [] },
  ],
};

// ─── RESTAURANT ───────────────────────────────────────────────────────────────
const restaurant: MenuTemplate = {
  categories: [
    { id: "r-starters", name: "Starters", sortOrder: 0 },
    { id: "r-main", name: "Main Course", sortOrder: 1 },
    { id: "r-bread", name: "Breads", sortOrder: 2 },
    { id: "r-rice", name: "Rice & Biryani", sortOrder: 3 },
    { id: "r-dessert", name: "Desserts", sortOrder: 4 },
    { id: "r-drinks", name: "Drinks", sortOrder: 5 },
  ],
  items: [
    {
      id: "ri1", name: "Paneer Tikka", categoryId: "r-starters", pricePaise: p(240), isVeg: true, isAvailable: true,
      portions: [{ label: "Half", pricePaise: p(160) }, { label: "Full", pricePaise: p(280) }], addOns: [],
    },
    {
      id: "ri2", name: "Chicken 65", categoryId: "r-starters", pricePaise: p(260), isVeg: false, isAvailable: true,
      portions: [{ label: "Half", pricePaise: p(180) }, { label: "Full", pricePaise: p(300) }], addOns: [],
    },
    {
      id: "ri3", name: "Dal Makhani", categoryId: "r-main", pricePaise: p(220), isVeg: true, isAvailable: true,
      portions: [{ label: "Half", pricePaise: p(140) }, { label: "Full", pricePaise: p(240) }], addOns: [],
    },
    {
      id: "ri4", name: "Butter Chicken", categoryId: "r-main", pricePaise: p(320), isVeg: false, isAvailable: true,
      portions: [{ label: "Half", pricePaise: p(220) }, { label: "Full", pricePaise: p(360) }], addOns: [],
    },
    {
      id: "ri5", name: "Palak Paneer", categoryId: "r-main", pricePaise: p(240), isVeg: true, isAvailable: true,
      portions: [{ label: "Half", pricePaise: p(160) }, { label: "Full", pricePaise: p(260) }], addOns: [],
    },
    { id: "ri6", name: "Tandoori Roti", categoryId: "r-bread", pricePaise: p(30), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ri7", name: "Butter Naan", categoryId: "r-bread", pricePaise: p(50), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ri8", name: "Garlic Naan", categoryId: "r-bread", pricePaise: p(60), isVeg: true, isAvailable: true, addOns: [] },
    {
      id: "ri9", name: "Chicken Biryani", categoryId: "r-rice", pricePaise: p(280), isVeg: false, isAvailable: true,
      portions: [{ label: "Half", pricePaise: p(190) }, { label: "Full", pricePaise: p(300) }], addOns: [],
    },
    {
      id: "ri10", name: "Veg Biryani", categoryId: "r-rice", pricePaise: p(220), isVeg: true, isAvailable: true,
      portions: [{ label: "Half", pricePaise: p(150) }, { label: "Full", pricePaise: p(240) }], addOns: [],
    },
    { id: "ri11", name: "Gulab Jamun", categoryId: "r-dessert", pricePaise: p(80), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ri12", name: "Rasgulla", categoryId: "r-dessert", pricePaise: p(70), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ri13", name: "Sweet Lassi", categoryId: "r-drinks", pricePaise: p(80), isVeg: true, isAvailable: true, addOns: [] },
    { id: "ri14", name: "Masala Chaas", categoryId: "r-drinks", pricePaise: p(50), isVeg: true, isAvailable: true, addOns: [] },
  ],
};

// ─── FOOD TRUCK ───────────────────────────────────────────────────────────────
const food_truck: MenuTemplate = {
  categories: [
    { id: "ft-burgers", name: "Burgers", sortOrder: 0 },
    { id: "ft-wraps", name: "Wraps", sortOrder: 1 },
    { id: "ft-sides", name: "Sides", sortOrder: 2 },
    { id: "ft-drinks", name: "Drinks", sortOrder: 3 },
  ],
  items: [
    { id: "fti1", name: "Veg Burger", categoryId: "ft-burgers", pricePaise: p(120), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti2", name: "Chicken Burger", categoryId: "ft-burgers", pricePaise: p(150), isVeg: false, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti3", name: "Double Patty", categoryId: "ft-burgers", pricePaise: p(200), isVeg: false, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti4", name: "Paneer Roll", categoryId: "ft-wraps", pricePaise: p(100), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti5", name: "Chicken Roll", categoryId: "ft-wraps", pricePaise: p(130), isVeg: false, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti6", name: "French Fries", categoryId: "ft-sides", pricePaise: p(80), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti7", name: "Onion Rings", categoryId: "ft-sides", pricePaise: p(70), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti8", name: "Coke", categoryId: "ft-drinks", pricePaise: p(40), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "fti9", name: "Fresh Lime Soda", categoryId: "ft-drinks", pricePaise: p(50), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
  ],
};

// ─── KIOSK ────────────────────────────────────────────────────────────────────
const kiosk: MenuTemplate = {
  categories: [
    { id: "k-combos", name: "Combos", sortOrder: 0 },
    { id: "k-snacks", name: "Snacks", sortOrder: 1 },
    { id: "k-drinks", name: "Drinks", sortOrder: 2 },
  ],
  items: [
    { id: "ki1", name: "Combo 1 - Burger+Fries+Drink", categoryId: "k-combos", pricePaise: p(220), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "ki2", name: "Combo 2 - Chicken+Fries+Drink", categoryId: "k-combos", pricePaise: p(260), isVeg: false, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "ki3", name: "Samosa (2 pcs)", categoryId: "k-snacks", pricePaise: p(30), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "ki4", name: "Vada Pav", categoryId: "k-snacks", pricePaise: p(25), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "ki5", name: "Bread Pakora", categoryId: "k-snacks", pricePaise: p(40), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "ki6", name: "Coke 250ml", categoryId: "k-drinks", pricePaise: p(30), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
    { id: "ki7", name: "Water Bottle", categoryId: "k-drinks", pricePaise: p(20), isVeg: true, isAvailable: true, fastAdd: true, addOns: [] },
  ],
};

// ─── BAKERY ───────────────────────────────────────────────────────────────────
const bakery: MenuTemplate = {
  categories: [
    { id: "b-bread", name: "Breads", sortOrder: 0 },
    { id: "b-cakes", name: "Cakes", sortOrder: 1 },
    { id: "b-pastry", name: "Pastries", sortOrder: 2 },
    { id: "b-cookies", name: "Cookies", sortOrder: 3 },
  ],
  items: [
    { id: "bi1", name: "White Bread (Loaf)", categoryId: "b-bread", pricePaise: p(45), isVeg: true, isAvailable: true, addOns: [] },
    { id: "bi2", name: "Multigrain Bread", categoryId: "b-bread", pricePaise: p(65), isVeg: true, isAvailable: true, addOns: [] },
    { id: "bi3", name: "Butter Croissant", categoryId: "b-pastry", pricePaise: p(60), isVeg: true, isAvailable: true, addOns: [] },
    { id: "bi4", name: "Chocolate Pastry", categoryId: "b-pastry", pricePaise: p(80), isVeg: true, isAvailable: true, addOns: [] },
    { id: "bi5", name: "Black Forest Cake (500g)", categoryId: "b-cakes", pricePaise: p(450), isVeg: true, isAvailable: true, addOns: [] },
    { id: "bi6", name: "Plum Cake", categoryId: "b-cakes", pricePaise: p(350), isVeg: true, isAvailable: true, addOns: [] },
    { id: "bi7", name: "Choco Chip Cookies (6pc)", categoryId: "b-cookies", pricePaise: p(120), isVeg: true, isAvailable: true, addOns: [] },
    { id: "bi8", name: "Shortbread Cookies (6pc)", categoryId: "b-cookies", pricePaise: p(100), isVeg: true, isAvailable: true, addOns: [] },
  ],
};

// ─── FRANCHISE ────────────────────────────────────────────────────────────────
const franchise: MenuTemplate = {
  categories: [
    { id: "fr-burgers", name: "Burgers", sortOrder: 0 },
    { id: "fr-pizza", name: "Pizza", sortOrder: 1 },
    { id: "fr-sides", name: "Sides", sortOrder: 2 },
    { id: "fr-drinks", name: "Beverages", sortOrder: 3 },
  ],
  items: [
    { id: "fri1", name: "Classic Burger", categoryId: "fr-burgers", pricePaise: p(149), isVeg: true, isAvailable: true, addOns: [] },
    { id: "fri2", name: "Spicy Chicken Burger", categoryId: "fr-burgers", pricePaise: p(179), isVeg: false, isAvailable: true, addOns: [] },
    { id: "fri3", name: "Margherita Pizza (7\")", categoryId: "fr-pizza", pricePaise: p(199), isVeg: true, isAvailable: true, addOns: [] },
    { id: "fri4", name: "Pepperoni Pizza (7\")", categoryId: "fr-pizza", pricePaise: p(249), isVeg: false, isAvailable: true, addOns: [] },
    { id: "fri5", name: "Seasoned Fries", categoryId: "fr-sides", pricePaise: p(99), isVeg: true, isAvailable: true, addOns: [] },
    { id: "fri6", name: "Soft Drink (M)", categoryId: "fr-drinks", pricePaise: p(69), isVeg: true, isAvailable: true, addOns: [] },
  ],
};

export const MENU_TEMPLATES: Record<BusinessType, MenuTemplate> = {
  cafe,
  restaurant,
  food_truck,
  kiosk,
  bakery,
  franchise,
};
