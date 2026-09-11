import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  slug: string;
  name: string;
  priceUsd: number;
  emoji: string;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">) => void;
  remove: (slug: string) => void;
  setQuantity: (slug: string, quantity: number) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.slug === item.slug);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.slug === item.slug ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1 }] };
        }),
      remove: (slug) => set((state) => ({ items: state.items.filter((i) => i.slug !== slug) })),
      setQuantity: (slug, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.slug !== slug)
              : state.items.map((i) => (i.slug === slug ? { ...i, quantity } : i)),
        })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    { name: "jab-academy-cart" }
  )
);
