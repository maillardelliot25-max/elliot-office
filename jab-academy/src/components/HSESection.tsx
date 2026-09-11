"use client";

import { motion } from "framer-motion";
import { hsePoints } from "@/lib/data";

export default function HSESection() {
  return (
    <section className="relative bg-gradient-to-b from-jab-black to-jab-mud-dark/40 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl mb-16">
          <p className="section-eyebrow mb-4">Pioneers in Health, Safety &amp; Environment</p>
          <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
            Extreme performance, engineered to be safe.
          </h2>
          <p className="mt-6 text-white/70 text-lg text-balance">
            We built the HSE standard the rest of the industry now follows — from
            dermatologically tested oils to certified fire marshal training.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {hsePoints.map((point, i) => (
            <motion.div
              key={point.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="card-surface rounded-2xl p-7 hover:border-jab-amber/40 transition-colors"
            >
              <div className="text-3xl mb-4">{point.icon}</div>
              <h3 className="font-display font-bold text-lg mb-2">{point.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{point.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
