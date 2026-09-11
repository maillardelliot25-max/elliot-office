import type { Metadata } from "next";
import Link from "next/link";
import { kingAaronBio } from "@/lib/data";

export const metadata: Metadata = {
  title: "King Aaron — The Accredited King of Jab",
  description:
    "Meet King Aaron, Trinidad's accredited King of Jab and Master Instructor of The International Trinidadian Jab & Performance Academy.",
};

export default function KingAaronPage() {
  return (
    <div className="bg-jab-black pt-32 pb-24">
      <div className="mx-auto max-w-4xl px-6">
        <p className="section-eyebrow mb-4">Founder &amp; Master Instructor</p>
        <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-balance">
          {kingAaronBio.name}
        </h1>
        <p className="mt-3 text-jab-gold font-semibold text-lg">{kingAaronBio.title}</p>

        <div className="mt-10 aspect-[21/9] rounded-3xl card-surface flex items-center justify-center bg-gradient-to-br from-jab-red/30 via-jab-mud-dark to-jab-black">
          <span className="text-7xl">👑🔥</span>
        </div>

        <div className="mt-12 space-y-6 text-lg text-white/75 leading-relaxed">
          {kingAaronBio.long.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>

        <div className="mt-14">
          <h2 className="font-display text-2xl font-bold mb-6">Credentials</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {kingAaronBio.credentials.map((c) => (
              <li key={c} className="flex items-start gap-2 card-surface rounded-xl p-4 text-sm">
                <span className="text-jab-red">✦</span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16 flex flex-col sm:flex-row gap-4">
          <Link href="/booking" className="btn-primary">
            Book King Aaron
          </Link>
          <Link href="/academy" className="btn-secondary">
            Train Under King Aaron
          </Link>
        </div>
      </div>
    </div>
  );
}
