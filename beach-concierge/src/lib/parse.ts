import type { AmenityTag, ZoneSection } from "@/lib/zoneGrid";
import type { Zone, Package, AddOn } from "@/generated/prisma/client";

export interface ParsedZone {
  id: string;
  beachId: string;
  label: string;
  section: ZoneSection;
  amenities: AmenityTag[];
  polygon: [number, number][];
  centroidX: number;
  centroidY: number;
  capacity: number;
  isBookable: boolean;
}

export function parseZone(zone: Zone): ParsedZone {
  return {
    id: zone.id,
    beachId: zone.beachId,
    label: zone.label,
    section: zone.section as ZoneSection,
    amenities: JSON.parse(zone.amenities) as AmenityTag[],
    polygon: JSON.parse(zone.polygon) as [number, number][],
    centroidX: zone.centroidX,
    centroidY: zone.centroidY,
    capacity: zone.capacity,
    isBookable: zone.isBookable,
  };
}

export interface ParsedPackage {
  id: string;
  beachId: string;
  name: string;
  description: string | null;
  pricingModel: "FLAT" | "PER_PERSON";
  price: number;
  includes: string[];
  isActive: boolean;
  sortOrder: number;
}

export function parsePackage(pkg: Package): ParsedPackage {
  return {
    id: pkg.id,
    beachId: pkg.beachId,
    name: pkg.name,
    description: pkg.description,
    pricingModel: pkg.pricingModel as "FLAT" | "PER_PERSON",
    price: pkg.price,
    includes: JSON.parse(pkg.includes) as string[],
    isActive: pkg.isActive,
    sortOrder: pkg.sortOrder,
  };
}

export interface ParsedAddOn {
  id: string;
  beachId: string;
  category: "FOOD" | "DRINK_RELAY" | "EXTRAS";
  name: string;
  description: string | null;
  price: number;
  unit: string;
  isActive: boolean;
  sortOrder: number;
}

export function parseAddOn(addOn: AddOn): ParsedAddOn {
  return {
    id: addOn.id,
    beachId: addOn.beachId,
    category: addOn.category as "FOOD" | "DRINK_RELAY" | "EXTRAS",
    name: addOn.name,
    description: addOn.description,
    price: addOn.price,
    unit: addOn.unit,
    isActive: addOn.isActive,
    sortOrder: addOn.sortOrder,
  };
}
