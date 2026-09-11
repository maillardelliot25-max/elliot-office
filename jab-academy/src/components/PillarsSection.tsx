"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { pillars } from "@/lib/data";

export default function PillarsSection() {
  const [openId, setOpenId] = useState<string | null>(pillars[0].id);

  return (
    <section className="relative bg-jab-black py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl mb-16">
          <p className="section-eyebrow mb-4">The Discipline</p>
          <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
            The 5 Pillars of Trinidadian Jab
          </h2>
          <p className="mt-6 text-white/70 text-lg text-balance">
            Five distinct disciplines, one ancestral lineage. Tap a pillar to explore its
            history, craft, and performance vocabulary.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {pillars.map((pillar, i) => {
            const isOpen = openId === pillar.id;
            return (
              <motion.button
                key={pillar.id}
                onClick={() => setOpenId(isOpen ? null : pillar.id)}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className={`text-left rounded-3xl border overflow-hidden transition-colors ${
                  isOpen ? "border-jab-amber/60" : "border-white/10 hover:border-white/25"
                } ${pillar.id === "rope-jab" ? "md:col-span-2" : ""}`}
              >
                <div className={`bg-gradient-to-br ${pillar.accent} p-8`}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-white/70">
                        {pillar.subtitle}
                      </p>
                      <h3 className="font-display text-2xl sm:text-3xl font-bold mt-1">
                        {pillar.name}
                      </h3>
                    </div>
                    <span
                      className={`shrink-0 text-2xl transition-transform ${
                        isOpen ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </div>
                  <p className="mt-4 text-white/85 leading-relaxed">{pillar.description}</p>

                  <motion.div
                    initial={false}
                    animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                    transition={{ duration: 0.35 }}
                    className="overflow-hidden"
                  >
                    <ul className="mt-6 space-y-2 border-t border-white/20 pt-5">
                      {pillar.details.map((d) => (
                        <li key={d} className="flex gap-2 text-sm text-white/90">
                          <span className="text-jab-gold">▸</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
