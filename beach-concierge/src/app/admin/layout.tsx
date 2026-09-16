import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/manifest", label: "Daily manifest" },
  { href: "/admin/prep", label: "Prep checklist" },
  { href: "/admin/beaches", label: "Beaches & zones" },
  { href: "/admin/packages", label: "Packages" },
  { href: "/admin/addons", label: "Add-ons" },
  { href: "/admin/vendors", label: "Vendors" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row">
      <aside className="shrink-0 md:w-48">
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
