import type { Metadata } from "next";
import Link from "next/link";
import { curriculum, tuitionIncludes } from "@/lib/data";

export const metadata: Metadata = {
  title: "1-Month Academy Curriculum",
  description:
    "The full week-by-week curriculum of the International Trinidadian Jab & Performance Academy's 1-month intensive program.",
};

export default function AcademyPage() {
  return (
    <div className="bg-jab-black pt-32 pb-24">
      <div className="mx-auto max-w-5xl px-6">
        <p className="section-eyebrow mb-4">1-Month All-Inclusive Academy</p>
        <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-balance">
          One month. Five pillars. A global credential.
        </h1>
        <p className="mt-6 text-white/70 text-lg max-w-2xl text-balance">
          A single intensive month takes you from foundational rhythm and body mechanics
          to a live practical fire-safety examination under Master Instructor King Aaron.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/enroll" className="btn-primary">
            Enroll in This Cohort
          </Link>
          <Link href="/certification" className="btn-secondary">
            See the Certification Registry
          </Link>
        </div>

        {/* Weekly breakdown */}
        <div className="mt-20">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-8">
            Weekly Curriculum Breakdown
          </h2>
          <div className="space-y-5">
            {curriculum.map((week, i) => (
              <div key={week.week} className="card-surface rounded-3xl p-8">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                  <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-jab-amber to-jab-red font-display font-bold shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-jab-gold">
                      {week.week}
                    </p>
                    <h3 className="font-display text-xl font-bold">{week.title}</h3>
                  </div>
                </div>
                <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 pl-1">
                  {week.points.map((p) => (
                    <li key={p} className="flex gap-2 text-white/70 text-sm">
                      <span className="text-jab-red mt-0.5">▸</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Tuition perks */}
        <div className="mt-20 card-surface rounded-3xl p-8 sm:p-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2">
            All-Inclusive Tuition
          </h2>
          <p className="text-white/60 mb-8">
            Tuition covers every practical material you need — nothing extra to source.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {tuitionIncludes.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-white/85">
                <span className="text-jab-gold">✓</span>
                {item}
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-white/10 pt-8">
            <div>
              <p className="text-sm text-white/50">All-inclusive tuition</p>
              <p className="font-display text-3xl font-extrabold">$1,200 USD</p>
            </div>
            <Link href="/enroll" className="btn-primary">
              Reserve Your Seat
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
