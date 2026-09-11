"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { talentPipelineStats } from "@/lib/data";

export default function TalentPipelineSection() {
  return (
    <section className="relative bg-jab-mud-dark/40 py-24 sm:py-32 overflow-hidden">
      <div className="absolute -right-40 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-flame-glow opacity-20 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid gap-14 lg:grid-cols-2 items-center">
          <div>
            <p className="section-eyebrow mb-4">Paid Career Pipeline &amp; Talent Agency</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
              Get Paid To Perform.
            </h2>
            <p className="mt-6 text-white/70 text-lg text-balance">
              Certification isn&apos;t the finish line — it&apos;s your entry point.
              Every graduate joins the Academy&apos;s Talent Roster, opening doors to paid
              gigs in Soca music videos, Carnivals, corporate shows, and international
              festival tours.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link href="/enroll" className="btn-primary">
                Start Your Certification
              </Link>
              <Link href="/booking" className="btn-secondary">
                Hire From the Roster
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {talentPipelineStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="card-surface rounded-3xl p-8 text-center"
              >
                <div className="font-display text-4xl font-extrabold bg-gradient-to-r from-jab-gold to-jab-amber bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm text-white/60">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
