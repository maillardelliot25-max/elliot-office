"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-jab-black pt-24">
      <div className="absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-flame-glow opacity-30 blur-3xl" />
        <div className="mud-texture absolute inset-0 opacity-70" />
        <div className="grain-overlay" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-jab-black/40 to-jab-black" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="section-eyebrow mb-6"
        >
          Founded by Master Instructor King Aaron &amp; Elliot Maillard
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="font-display text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tightest leading-[1.02] text-balance"
        >
          Reclaiming the Flame:
          <br />
          <span className="bg-gradient-to-r from-jab-gold via-jab-amber to-jab-red bg-clip-text text-transparent">
            The Ancestral Art &amp; Performance Science of Trinidadian Jab
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mx-auto mt-8 max-w-2xl text-lg sm:text-xl text-white/70 text-balance"
        >
          Learn directly under Master Instructor King Aaron. Master fire breathing,
          traditional oil crafting, rhythm, and extreme stagecraft — with full HSE fire
          safety clearance.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/enroll" className="btn-primary w-full sm:w-auto animate-pulse-glow">
            Enroll in 1-Month Academy
          </Link>
          <Link href="/booking" className="btn-secondary w-full sm:w-auto">
            Book Certified Talent
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-xs uppercase tracking-widest text-white/40"
        >
          <span>Paramin Blue Devils</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>Sangre Grande Oil Mas</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>Canboulay Heritage</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>Princes Town Rope Jab</span>
        </motion.div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/40 text-xs uppercase tracking-widest">
        Scroll to ignite the story ↓
      </div>
    </section>
  );
}
