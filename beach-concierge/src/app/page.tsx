import Link from "next/link";

const STEPS = [
  {
    title: "Pick your spot",
    body: "Choose your beach, date, and an exact zone on our interactive map — filtered by shade, distance to the water, and more.",
  },
  {
    title: "We set up before you arrive",
    body: "Our team is out by 5am with chairs, umbrellas and branding to claim your zone, first-come-first-served etiquette respected.",
  },
  {
    title: "Food and drinks, handled",
    body: "Bake & shark, corn soup and snacks delivered to your zone. Want a drink? We relay your order to the partner bar across the road.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="bg-gradient-to-b from-sky-600 to-sky-500 px-4 py-20 text-center text-white sm:px-6">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Show up with just a car. We handle the rest of the beach day.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-sky-50">
          A claimed zone, chairs, food, and drink orders relayed to the partner
          bar — all booked online before you leave the house.
        </p>
        <Link
          href="/beaches"
          className="mt-8 inline-block rounded-full bg-white px-8 py-3 font-semibold text-sky-700 shadow transition hover:bg-sky-50"
        >
          Book your beach day
        </Link>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-16 sm:grid-cols-3 sm:px-6">
        {STEPS.map((step, i) => (
          <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
              {i + 1}
            </div>
            <h2 className="font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
        <div className="rounded-xl bg-amber-50 p-6 text-sm text-amber-900">
          <strong>A note on drinks:</strong> we don&apos;t stock or sell alcohol.
          Any drink order is relayed to and fulfilled by our partner bar across
          the road, then delivered to your zone by our waitstaff.
        </div>
      </section>
    </div>
  );
}
