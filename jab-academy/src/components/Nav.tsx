"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { href: "/academy", label: "Academy" },
  { href: "/booking", label: "Book Talent" },
  { href: "/certification", label: "Verify Certification" },
  { href: "/shop", label: "Pro Shop" },
  { href: "/king-aaron", label: "King Aaron" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-jab-black/80 backdrop-blur-xl border-b border-white/10"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-xl">🔥</span>
          <span className="font-display font-bold tracking-tight text-sm sm:text-base">
            ITJPA
            <span className="hidden sm:inline text-white/60 font-normal">
              {" "}
              — Jab &amp; Performance Academy
            </span>
          </span>
        </Link>

        <div className="hidden lg:flex items-center gap-8 text-sm font-medium text-white/80">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-jab-gold transition-colors">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden lg:block">
          <Link href="/enroll" className="btn-primary !py-2.5 !px-5 text-sm">
            Enroll Now
          </Link>
        </div>

        <button
          aria-label="Toggle menu"
          className="lg:hidden text-white p-2"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="w-6 h-0.5 bg-white mb-1.5 transition-transform" />
          <div className="w-6 h-0.5 bg-white mb-1.5" />
          <div className="w-6 h-0.5 bg-white" />
        </button>
      </nav>

      {open && (
        <div className="lg:hidden bg-jab-black border-t border-white/10 px-6 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-jab-gold text-sm font-medium"
            >
              {l.label}
            </Link>
          ))}
          <Link href="/enroll" onClick={() => setOpen(false)} className="btn-primary text-sm">
            Enroll Now
          </Link>
        </div>
      )}
    </header>
  );
}
