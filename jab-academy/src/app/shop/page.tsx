"use client";

import { useEffect, useState, FormEvent } from "react";
import { useCartStore } from "@/lib/cartStore";
import { fallbackProducts, type Product } from "@/lib/data";

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCartStore();

  useEffect(() => {
    fetch("/api/shop/products")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.products) && d.products.length > 0) setProducts(d.products);
      })
      .catch(() => {});
  }, []);

  const categories = Array.from(new Set(products.map((p) => p.category)));

  return (
    <div className="min-h-screen bg-jab-black pt-32 pb-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-start justify-between gap-6 flex-wrap mb-14">
          <div>
            <p className="section-eyebrow mb-4">Pro Shop</p>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">
              Gear the Academy trusts.
            </h1>
            <p className="mt-4 text-white/60 max-w-xl">
              Non-toxic Jab oils, practice flambeaux, safe fire fuels, plaited hemp whips,
              and official academy apparel.
            </p>
          </div>
          <button onClick={() => setCartOpen(true)} className="btn-secondary relative">
            🛒 Cart
            {cart.count() > 0 && (
              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-jab-red text-xs flex items-center justify-center font-bold">
                {cart.count()}
              </span>
            )}
          </button>
        </div>

        {categories.map((category) => (
          <div key={category} className="mb-14">
            <h2 className="font-display text-xl font-bold mb-6">{category}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products
                .filter((p) => p.category === category)
                .map((product) => (
                  <div key={product.slug} className="card-surface rounded-2xl p-6 flex flex-col">
                    <div className="text-4xl mb-4">{product.emoji}</div>
                    <h3 className="font-display font-bold mb-2">{product.name}</h3>
                    <p className="text-white/60 text-sm leading-relaxed flex-1">
                      {product.description}
                    </p>
                    <div className="mt-6 flex items-center justify-between">
                      <span className="font-display text-lg font-bold">
                        ${product.priceUsd}
                      </span>
                      <button
                        onClick={() =>
                          cart.add({
                            slug: product.slug,
                            name: product.name,
                            priceUsd: product.priceUsd,
                            emoji: product.emoji,
                          })
                        }
                        className="btn-primary !py-2 !px-4 text-sm"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
    </div>
  );
}

function CartDrawer({ onClose }: { onClose: () => void }) {
  const cart = useCartStore();
  const [stage, setStage] = useState<"cart" | "checkout" | "done">("cart");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          items: cart.items.map((i) => ({
            slug: i.slug,
            name: i.name,
            priceUsd: i.priceUsd,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed. Please try again.");
      setConfirmation(data.message);
      cart.clear();
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-md bg-jab-black border-l border-white/10 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-xl font-bold">
            {stage === "done" ? "Order Confirmed" : "Your Cart"}
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl">
            ✕
          </button>
        </div>

        {stage === "cart" && (
          <>
            {cart.items.length === 0 ? (
              <p className="text-white/50 text-sm">Your cart is empty.</p>
            ) : (
              <div className="space-y-4">
                {cart.items.map((item) => (
                  <div key={item.slug} className="flex items-center gap-3 card-surface rounded-xl p-3">
                    <span className="text-2xl">{item.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="text-xs text-white/50">${item.priceUsd} each</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={item.quantity}
                      onChange={(e) => cart.setQuantity(item.slug, Number(e.target.value))}
                      className="input !w-16 !py-1.5 text-center"
                    />
                  </div>
                ))}
                <div className="border-t border-white/10 pt-4 flex items-center justify-between font-display font-bold">
                  <span>Total</span>
                  <span>${cart.total()}</span>
                </div>
                <button onClick={() => setStage("checkout")} className="btn-primary w-full">
                  Checkout
                </button>
              </div>
            )}
          </>
        )}

        {stage === "checkout" && (
          <form onSubmit={handleCheckout} className="space-y-5">
            <label className="block">
              <span className="block text-sm text-white/60 mb-2">Full name</span>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-sm text-white/60 mb-2">Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </label>
            <div className="rounded-2xl border border-jab-amber/30 bg-jab-amber/5 p-4 text-xs text-white/50">
              Demo checkout — no real payment is processed in this environment.
            </div>
            <div className="flex items-center justify-between font-display font-bold">
              <span>Total</span>
              <span>${cart.total()}</span>
            </div>
            {error && <p className="text-jab-red text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setStage("cart")} className="btn-secondary flex-1">
                Back
              </button>
              <button type="submit" disabled={submitting} className="btn-primary flex-1 disabled:opacity-40">
                {submitting ? "Processing…" : "Place Order"}
              </button>
            </div>
          </form>
        )}

        {stage === "done" && (
          <div className="text-center">
            <div className="text-5xl mb-4">🔥</div>
            <p className="text-white/70">{confirmation}</p>
            <button onClick={onClose} className="btn-primary mt-8">
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
