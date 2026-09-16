import { PrismaClient, AddOnCategory, PricingModel } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { generateZoneGrid } from "../src/lib/zoneGrid";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

function nextSaturday(from = new Date()): string {
  const d = new Date(from);
  const day = d.getDay();
  const add = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Seeding Maracas Bay...");

  await prisma.bookingAddOn.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.addOn.deleteMany();
  await prisma.package.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.beach.deleteMany();

  const mapWidth = 1000;
  const mapHeight = 600;

  const beach = await prisma.beach.create({
    data: {
      slug: "maracas-bay",
      name: "Maracas Bay",
      region: "North Coast, Trinidad",
      description:
        "Trinidad's most iconic beach — home of bake & shark, framed by the Maracas lookout and the river mouth at its eastern end.",
      parkingInfo:
        "Main lot beside the vendor stalls, entrance ramp on the far left of the bay.",
      vendorInfo:
        "Vendor row (Richard's, Natalie's and friends) runs along the back-center of the beach; the partner bar is across the main road from the center of the bay.",
      mapWidth,
      mapHeight,
      isActive: true,
    },
  });

  const generated = generateZoneGrid({ mapWidth, mapHeight, rows: 6, cols: 14 });
  await prisma.zone.createMany({
    data: generated.map((z) => ({
      beachId: beach.id,
      label: z.label,
      section: z.section,
      amenities: JSON.stringify(z.amenities),
      polygon: JSON.stringify(z.polygon),
      centroidX: z.centroidX,
      centroidY: z.centroidY,
      capacity: z.capacity,
      isBookable: true,
    })),
  });
  console.log(`Created ${generated.length} zones.`);

  const [basic, premium, vip] = await Promise.all([
    prisma.package.create({
      data: {
        beachId: beach.id,
        name: "Basic Beach Day",
        description: "Chairs, umbrella and a claimed spot — bring the rest of the day.",
        pricingModel: PricingModel.PER_PERSON,
        price: 85,
        includes: JSON.stringify([
          "Beach chair per person",
          "Shared umbrella / shade setup",
          "Zone claimed and set up before you arrive",
          "Cooler with ice and water",
        ]),
        sortOrder: 1,
      },
    }),
    prisma.package.create({
      data: {
        beachId: beach.id,
        name: "Premium Package",
        description: "Everything in Basic, plus a proper bake & shark lunch spread.",
        pricingModel: PricingModel.PER_PERSON,
        price: 160,
        includes: JSON.stringify([
          "Everything in Basic Beach Day",
          "Bake & shark lunch per person",
          "Corn soup or fruit on arrival",
          "Waitstaff running food/drink orders to your zone",
        ]),
        sortOrder: 2,
      },
    }),
    prisma.package.create({
      data: {
        beachId: beach.id,
        name: "VIP Cabana Group",
        description: "Flat-rate group setup for up to 10 — our best zones, full service.",
        pricingModel: PricingModel.FLAT,
        price: 1400,
        includes: JSON.stringify([
          "Premium zone (shaded, near vendor row)",
          "Cabana-style furniture for up to 10 guests",
          "Full bake & shark spread for the group",
          "Dedicated waitress for the day",
          "Priority drink-relay service to the partner bar",
        ]),
        sortOrder: 3,
      },
    }),
  ]);
  void basic;
  void premium;
  void vip;

  const foodAddOns = [
    ["Extra bake & shark", "Doubled-up on the island's classic", 25, "person"],
    ["Corn soup", "Hot corn soup, served in your zone", 15, "person"],
    ["Doubles (2)", "Classic Trinidad street food", 12, "order"],
    ["Fresh fruit platter", "Watermelon, pineapple, mango", 60, "platter"],
    ["Fried fish & bake", "Whole fried fish with bake and slaw", 35, "person"],
  ] as const;

  const drinkRelayAddOns = [
    [
      "Beer bucket (6)",
      "Relayed to Sweet Water Bar across the road and delivered to your zone",
      70,
      "bucket",
    ],
    [
      "Rum + coconut water order",
      "Local rum with fresh coconut water, relayed to the partner bar",
      45,
      "order",
    ],
    [
      "Mixed cocktail pitcher",
      "Rum punch or similar, made by the partner bar and delivered",
      90,
      "pitcher",
    ],
    [
      "Soft drinks & juice (6)",
      "Non-alcoholic order relayed to the partner bar",
      36,
      "order",
    ],
  ] as const;

  const extrasAddOns = [
    ["Bluetooth speaker", "Speaker set up at your zone for the day", 40, "day"],
    ["Extra chairs (2)", "Additional beach chairs beyond your package", 20, "pair"],
    [
      "Birthday / celebration setup",
      "Balloons and a banner at your zone",
      120,
      "setup",
    ],
    [
      "1-hour beach photographer",
      "Local photographer for candid + posed shots",
      250,
      "hour",
    ],
  ] as const;

  await prisma.addOn.createMany({
    data: [
      ...foodAddOns.map(([name, description, price, unit], i) => ({
        beachId: beach.id,
        category: AddOnCategory.FOOD,
        name,
        description,
        price,
        unit,
        sortOrder: i,
      })),
      ...drinkRelayAddOns.map(([name, description, price, unit], i) => ({
        beachId: beach.id,
        category: AddOnCategory.DRINK_RELAY,
        name,
        description,
        price,
        unit,
        sortOrder: i,
      })),
      ...extrasAddOns.map(([name, description, price, unit], i) => ({
        beachId: beach.id,
        category: AddOnCategory.EXTRAS,
        name,
        description,
        price,
        unit,
        sortOrder: i,
      })),
    ],
  });

  await prisma.vendor.create({
    data: {
      beachId: beach.id,
      name: "Sweet Water Bar",
      role: "Partner bar",
      supplies:
        "Beer, rum, mixers and cocktails — ordered by our waitstaff on your behalf and delivered to your zone. We do not stock or sell alcohol directly.",
      contact: "868-555-0142",
    },
  });

  // A few sample bookings on the coming Saturday so the map/admin views have
  // something to show out of the box.
  const zones = await prisma.zone.findMany({ where: { beachId: beach.id }, orderBy: { label: "asc" } });
  const sampleDate = nextSaturday();
  const sampleZoneIndexes = [2, 3, 15, 16, 30, 44, 58];
  const packages = [basic, premium, vip];

  for (const [i, zi] of sampleZoneIndexes.entries()) {
    const zone = zones[zi];
    if (!zone) continue;
    const pkg = packages[i % packages.length];
    const partySize = 2 + (i % 5);
    await prisma.booking.create({
      data: {
        beachId: beach.id,
        zoneId: zone.id,
        packageId: pkg.id,
        date: sampleDate,
        clientName: ["Alicia Ramnarine", "Kevon Baptiste", "The Rampersad Family", "Shanice Lewis", "Mikhail Ali", "Devi Sooknanan", "Josh Charles"][i],
        clientPhone: `868-555-01${10 + i}`,
        partySize,
        status: i === 6 ? "PENDING" : "CONFIRMED",
        paymentStatus: i === 6 ? "UNPAID" : i % 2 === 0 ? "PAID" : "DEPOSIT_PAID",
        paymentMethod: "bank_transfer",
        totalPrice: pkg.price * (pkg.pricingModel === "PER_PERSON" ? partySize : 1),
        depositAmount: Math.round(pkg.price * (pkg.pricingModel === "PER_PERSON" ? partySize : 1) * 0.3),
        amountPaid: i % 2 === 0 ? pkg.price * (pkg.pricingModel === "PER_PERSON" ? partySize : 1) : 0,
        setupComplete: i < 2,
      },
    });
  }
  console.log(`Seeded ${sampleZoneIndexes.length} sample bookings for ${sampleDate}.`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
