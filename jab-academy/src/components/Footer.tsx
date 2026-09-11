import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-jab-black">
      <div className="mx-auto max-w-7xl px-6 py-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔥</span>
            <span className="font-display font-bold">ITJPA</span>
          </div>
          <p className="text-sm text-white/50 leading-relaxed">
            The International Trinidadian Jab &amp; Performance Academy — reclaiming the
            flame of ancestral mas as world-class performance art.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-jab-gold mb-4">
            Academy
          </h4>
          <ul className="space-y-3 text-sm text-white/60">
            <li>
              <Link href="/academy" className="hover:text-white">
                Curriculum &amp; Tuition
              </Link>
            </li>
            <li>
              <Link href="/enroll" className="hover:text-white">
                Enroll
              </Link>
            </li>
            <li>
              <Link href="/certification" className="hover:text-white">
                Verify a Certification
              </Link>
            </li>
            <li>
              <Link href="/king-aaron" className="hover:text-white">
                Meet King Aaron
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-jab-gold mb-4">
            Work With Us
          </h4>
          <ul className="space-y-3 text-sm text-white/60">
            <li>
              <Link href="/booking" className="hover:text-white">
                Book Certified Talent
              </Link>
            </li>
            <li>
              <Link href="/shop" className="hover:text-white">
                Pro Shop
              </Link>
            </li>
            <li>
              <a href="mailto:bookings@jabacademy.tt" className="hover:text-white">
                bookings@jabacademy.tt
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-jab-gold mb-4">
            Heritage Statement
          </h4>
          <p className="text-sm text-white/50 leading-relaxed">
            Jab (Diable) originated in post-1838 emancipation Canboulay as satirical
            resistance theatre against colonial overseers — living folk art, not a
            demonic practice.
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 py-6 px-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} The International Trinidadian Jab &amp; Performance
        Academy. Founded by Master Instructor King Aaron &amp; Elliot Maillard. Port of Spain,
        Trinidad &amp; Tobago.
      </div>
    </footer>
  );
}
