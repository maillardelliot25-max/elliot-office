"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { kingAaronBio } from "@/lib/data";

export default function KingAaronSection() {
  return (
    <section className="relative bg-jab-black py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.3fr] items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative aspect-[4/5] rounded-3xl overflow-hidden card-surface flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-jab-red/30 via-jab-mud-dark to-jab-black" />
            <div className="relative text-center px-6">
              <div className="text-7xl mb-4">👑🔥</div>
              <p className="text-sm uppercase tracking-widest text-jab-gold font-bold">
                Accredited King of Jab
              </p>
            </div>
          </motion.div>

          <div>
            <p className="section-eyebrow mb-4">Educator Spotlight</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
              {kingAaronBio.name}
            </h2>
            <p className="mt-2 text-jab-gold font-semibold">{kingAaronBio.title}</p>
            <p className="mt-6 text-white/70 text-lg leading-relaxed text-balance">
              {kingAaronBio.short}
            </p>

            <ul className="mt-8 grid sm:grid-cols-2 gap-3">
              {kingAaronBio.credentials.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2 text-sm text-white/80 card-surface rounded-xl p-4"
                >
                  <span className="text-jab-red">✦</span>
                  {c}
                </li>
              ))}
            </ul>

            <Link href="/king-aaron" className="btn-secondary mt-8 inline-flex">
              Read Full Biography
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
