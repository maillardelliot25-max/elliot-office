import type { AmenityTag, ZoneSection } from "@/lib/zoneGrid";

export const SECTION_ORDER: ZoneSection[] = [
  "FAR_LEFT",
  "MID_LEFT",
  "CENTER",
  "MID_RIGHT",
  "FAR_RIGHT",
];

export const SECTION_LABELS: Record<ZoneSection, string> = {
  FAR_LEFT: "Far left",
  MID_LEFT: "Mid left",
  CENTER: "Center",
  MID_RIGHT: "Mid right",
  FAR_RIGHT: "Far right",
};

export const AMENITY_ORDER: AmenityTag[] = [
  "SHADED",
  "NEAR_WATER",
  "NEAR_VENDOR_ROW",
  "NEAR_PARKING",
  "NEAR_BATHROOM",
];

export const AMENITY_LABELS: Record<AmenityTag, string> = {
  SHADED: "Shaded",
  NEAR_WATER: "Near water",
  NEAR_VENDOR_ROW: "Near vendor row",
  NEAR_PARKING: "Near parking",
  NEAR_BATHROOM: "Near bathroom",
};

export const AMENITY_ICONS: Record<AmenityTag, string> = {
  SHADED: "🌴",
  NEAR_WATER: "🌊",
  NEAR_VENDOR_ROW: "🍽️",
  NEAR_PARKING: "🚗",
  NEAR_BATHROOM: "🚻",
};

export const ADDON_CATEGORY_LABELS: Record<
  "FOOD" | "DRINK_RELAY" | "EXTRAS",
  string
> = {
  FOOD: "Food",
  DRINK_RELAY: "Drinks (relayed to partner bar)",
  EXTRAS: "Extras",
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Unpaid",
  DEPOSIT_PAID: "Deposit paid",
  PAID: "Paid in full",
  REFUNDED: "Refunded",
};
