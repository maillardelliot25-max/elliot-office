"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { heritageTimeline, heritageMythVsFact } from "@/lib/data";

export default function HeritageSection() {
  const [active, setActive] = useState(2);

  return (
    <section className="relative bg-jab-black py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="section-eyebrow mb-4">Historical Truth &amp; Ancestral Heritage</p>
          <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
            Jab is not a demon. Jab is a declaration of freedom.
          </h2>
          <p className="mt-6 text-white/70 text-lg text-balance">
            Trinidadian Jab (Diable) was born in the streets of post-1838 emancipation
            Canboulay — a satirical mockery of the colonial plantation overseer and a
            defiant celebration of ancestral liberation. It is living folk theatre, a
            high-level martial and theatrical discipline, and extreme performance art.
          </p>
        </div>

        {/* Interactive timeline */}
        <div className="mt-16 grid gap-10 lg:grid-cols-[280px_1fr]">
          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2">
            {heritageTimeline.map((item, i) => (
              <button
                key={item.year}
                onClick={() => setActive(i)}
                className={`shrink-0 text-left rounded-2xl px-5 py-4 transition-all border ${
                  active === i
                    ? "bg-gradient-to-r from-jab-red/20 to-jab-amber/10 border-jab-amber/50"
                    : "border-white/10 hover:border-white/25 bg-white/[0.02]"
                }`}
              >
                <div
                  className={`text-xs font-bold uppercase tracking-widest ${
                    active === i ? "text-jab-gold" : "text-white/40"
                  }`}
                >
                  {item.year}
                </div>
                <div className="mt-1 text-sm font-semibold whitespace-nowrap lg:whitespace-normal">
                  {item.title}
                </div>
              </button>
            ))}
          </div>

          <div className="relative min-h-[220px] card-surface rounded-3xl p-8 sm:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-jab-gold text-sm font-bold uppercase tracking-widest mb-3">
                  {heritageTimeline[active].year}
                </div>
                <h3 className="font-display text-2xl font-bold mb-4">
                  {heritageTimeline[active].title}
                </h3>
                <p className="text-white/70 leading-relaxed text-lg">
                  {heritageTimeline[active].body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Myth vs fact */}
        <div className="mt-24">
          <h3 className="font-display text-2xl sm:text-3xl font-bold mb-8 text-balance">
            Ending the Stigma: Myth vs. Fact
          </h3>
          <div className="grid gap-6 sm:grid-cols-3">
            {heritageMythVsFact.map((item) => (
              <div key={item.myth} className="card-surface rounded-2xl p-6">
                <div className="flex items-start gap-2 text-white/40 text-sm mb-4">
                  <span className="text-jab-red">✕</span>
                  <span className="italic">{item.myth}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-jab-gold">✓</span>
                  <span className="text-white/80">{item.fact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
