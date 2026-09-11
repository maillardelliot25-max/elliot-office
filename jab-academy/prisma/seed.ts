import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  {
    slug: "molassie-skin-oil",
    name: "Jab Molassie Skin-Safe Oil",
    description:
      "Dermatologically tested, non-toxic performance oil formulated for full-body wear. Water-washable, non-staining to costume fabric.",
    priceUsd: 28,
    category: "Skin & Pigment",
    emoji: "🛢️",
  },
  {
    slug: "blue-devil-pigment",
    name: "Organic Blue Devil Pigment",
    description:
      "Non-irritating, food-grade blue pigment for Paramin-style Blue Devil mas. Dermatologist-reviewed formula, easy soap-and-water removal.",
    priceUsd: 22,
    category: "Skin & Pigment",
    emoji: "🔵",
  },
  {
    slug: "practice-flambeau",
    name: "Handcrafted Practice Flambeau",
    description:
      "Glass-bodied training flambeau engineered for controlled drills. Sold unfueled — pair with our high-flashpoint safety pitch oil.",
    priceUsd: 65,
    category: "Fire Equipment",
    emoji: "🔥",
  },
  {
    slug: "safety-pitch-oil",
    name: "High-Flashpoint Safety Pitch Oil",
    description:
      "HSE-reviewed fuel with an elevated flashpoint for safer fire-breathing and flambeau practice. 1L bottle with childproof cap.",
    priceUsd: 34,
    category: "Fire Equipment",
    emoji: "🧯",
  },
  {
    slug: "rope-jab-whip",
    name: "Plaited Hemp Jab Jab Whip",
    description:
      "Traditionally plaited hemp rope whip built for rhythmic cracking. Hand-finished in Princes Town style with reinforced handle wrap.",
    priceUsd: 45,
    category: "Traditional Gear",
    emoji: "🪢",
  },
  {
    slug: "oral-care-kit",
    name: "Fire Performer Oral Care Kit",
    description:
      "Pre- and post-performance oral hygiene kit designed for fire breathers: alcohol-free rinse, lip barrier balm, and recovery guide card.",
    priceUsd: 19,
    category: "HSE Essentials",
    emoji: "🦷",
  },
  {
    slug: "flame-retardant-cloth",
    name: "Flame-Retardant Safety Cloth Set",
    description:
      "Certified flame-retardant wipe-down cloths for staging areas and post-performance safety protocol.",
    priceUsd: 24,
    category: "HSE Essentials",
    emoji: "🧵",
  },
  {
    slug: "academy-tee",
    name: "Official Academy Tee — Flambeau Crest",
    description:
      "Heavyweight cotton tee with the International Trinidadian Jab & Performance Academy flambeau crest. Unisex fit.",
    priceUsd: 32,
    category: "Apparel",
    emoji: "👕",
  },
];

const certifications = [
  {
    certId: "ITJPA-2026-00001",
    fullName: "Aaron Superville",
    discipline: "Blue Devil / Fire Performance — Master Instructor",
    fireSafetyLevel: "Level IV — Master Fire Safety Marshal",
    issueDate: new Date("2020-02-01"),
    expiryDate: new Date("2030-02-01"),
    status: "active",
  },
  {
    certId: "ITJPA-2026-00002",
    fullName: "Michaela Forde",
    discipline: "Jab Molassie",
    fireSafetyLevel: "Level I — Traditional Mas Safety",
    issueDate: new Date("2025-11-14"),
    expiryDate: new Date("2027-11-14"),
    status: "active",
  },
  {
    certId: "ITJPA-2026-00003",
    fullName: "Kwame Alexander",
    discipline: "Blue Devil (Paramin Tradition)",
    fireSafetyLevel: "Level II — Fire Breathing Certified",
    issueDate: new Date("2025-06-02"),
    expiryDate: new Date("2027-06-02"),
    status: "active",
  },
  {
    certId: "ITJPA-2026-00004",
    fullName: "Devanand Ramkissoon",
    discipline: "Rope Jab (Jab Jab)",
    fireSafetyLevel: "Level I — Traditional Mas Safety",
    issueDate: new Date("2024-05-20"),
    expiryDate: new Date("2026-05-20"),
    status: "expired",
  },
  {
    certId: "ITJPA-2026-00005",
    fullName: "Simone Jack-Charles",
    discipline: "Red Devil — Stage & Screen",
    fireSafetyLevel: "Level III — Stage Fire Choreography",
    issueDate: new Date("2025-09-10"),
    expiryDate: new Date("2027-09-10"),
    status: "active",
  },
];

async function main() {
  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: p,
      create: p,
    });
  }
  for (const c of certifications) {
    await prisma.certification.upsert({
      where: { certId: c.certId },
      update: c,
      create: c,
    });
  }
  console.log(`Seeded ${products.length} products and ${certifications.length} certifications.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
