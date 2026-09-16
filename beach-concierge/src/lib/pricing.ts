import type { ParsedPackage } from "@/lib/parse";

export interface PriceLine {
  label: string;
  amount: number;
}

export interface AddOnSelection {
  addOnId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export const DEPOSIT_RATE = 0.3;

export function packagePrice(pkg: ParsedPackage, partySize: number): number {
  return pkg.pricingModel === "PER_PERSON"
    ? pkg.price * Math.max(partySize, 1)
    : pkg.price;
}

export function computeTotals(
  pkg: ParsedPackage | null,
  partySize: number,
  addOns: AddOnSelection[]
) {
  const lines: PriceLine[] = [];

  if (pkg) {
    lines.push({
      label:
        pkg.pricingModel === "PER_PERSON"
          ? `${pkg.name} (x${Math.max(partySize, 1)})`
          : pkg.name,
      amount: packagePrice(pkg, partySize),
    });
  }

  for (const addOn of addOns) {
    if (addOn.quantity <= 0) continue;
    lines.push({
      label: `${addOn.name} (x${addOn.quantity})`,
      amount: addOn.unitPrice * addOn.quantity,
    });
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const deposit = Math.round(total * DEPOSIT_RATE * 100) / 100;

  return { lines, total: Math.round(total * 100) / 100, deposit };
}

export function formatTTD(amount: number): string {
  return new Intl.NumberFormat("en-TT", {
    style: "currency",
    currency: "TTD",
    minimumFractionDigits: 2,
  }).format(amount);
}
