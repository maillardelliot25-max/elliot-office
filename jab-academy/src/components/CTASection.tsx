import Link from "next/link";

export default function CTASection() {
  return (
    <section className="relative bg-jab-black py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-flame-glow opacity-20 blur-3xl" />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
          The flame is ready. Are you?
        </h2>
        <p className="mt-6 text-white/70 text-lg text-balance">
          Join the next cohort of the International Trinidadian Jab &amp; Performance
          Academy — internationally certified, HSE-cleared, and ready to work.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/enroll" className="btn-primary w-full sm:w-auto">
            Enroll in 1-Month Academy
          </Link>
          <Link href="/certification" className="btn-secondary w-full sm:w-auto">
            Verify a Certification
          </Link>
        </div>
      </div>
    </section>
  );
}
