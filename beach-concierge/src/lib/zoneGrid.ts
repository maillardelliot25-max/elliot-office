// Generates a beach-shaped grid of zones as pure data (polygon points + tags).
// This is what lets a new beach ship as a config/data change instead of code:
// pick rows/cols, get a curved "shoreline band" of 50-200 zones with sensible
// section + amenity tags already assigned, then hand-edit exceptions in admin.

export type ZoneSection =
  | "FAR_LEFT"
  | "MID_LEFT"
  | "CENTER"
  | "MID_RIGHT"
  | "FAR_RIGHT";

export type AmenityTag =
  | "SHADED"
  | "NEAR_VENDOR_ROW"
  | "NEAR_WATER"
  | "NEAR_PARKING"
  | "NEAR_BATHROOM";

export interface GeneratedZone {
  label: string;
  section: ZoneSection;
  amenities: AmenityTag[];
  polygon: [number, number][];
  centroidX: number;
  centroidY: number;
  capacity: number;
}

export interface ZoneGridOptions {
  mapWidth?: number;
  mapHeight?: number;
  rows?: number;
  cols?: number;
  /** How pronounced the shoreline curve is, in map units. */
  waveAmplitude?: number;
  /** Number of full curve cycles across the beach. */
  waveFrequency?: number;
}

export const DEFAULTS: Required<ZoneGridOptions> = {
  mapWidth: 1000,
  mapHeight: 600,
  rows: 6,
  cols: 14,
  waveAmplitude: 28,
  waveFrequency: 1.3,
};

function sectionForU(u: number): ZoneSection {
  if (u < 0.2) return "FAR_LEFT";
  if (u < 0.4) return "MID_LEFT";
  if (u < 0.6) return "CENTER";
  if (u < 0.8) return "MID_RIGHT";
  return "FAR_RIGHT";
}

/**
 * The sand band's geometry as a function of position along the shore (u, 0..1).
 * Shared by the zone-grid generator and the map's decorative background so the
 * drawn shoreline/tree line always line up with the zone polygons.
 */
export function bandGeometry(opts: ZoneGridOptions = {}) {
  const { mapWidth, mapHeight, waveAmplitude, waveFrequency } = {
    ...DEFAULTS,
    ...opts,
  };

  const leftMargin = mapWidth * 0.06;
  const rightMargin = mapWidth * 0.06;
  const usableWidth = mapWidth - leftMargin - rightMargin;
  const bandTop = mapHeight * 0.32; // where the water meets the sand, roughly
  const bandHeight = mapHeight * 0.5; // depth of the sand band (to the tree line)

  const x = (u: number) => leftMargin + u * usableWidth;
  const topEdge = (u: number) =>
    bandTop + waveAmplitude * Math.sin(u * Math.PI * 2 * waveFrequency);
  const bottomEdge = (u: number) => topEdge(u) + bandHeight;
  const edgeY = (u: number, frac: number) => topEdge(u) + frac * bandHeight;

  return { x, topEdge, bottomEdge, edgeY, leftMargin, rightMargin, bandTop, bandHeight };
}

export function generateZoneGrid(opts: ZoneGridOptions = {}): GeneratedZone[] {
  const { rows, cols } = { ...DEFAULTS, ...opts };
  const { x, edgeY } = bandGeometry(opts);

  const capacityCycle = [4, 6, 6, 8];
  const zones: GeneratedZone[] = [];
  let index = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols;
      const u1 = (c + 1) / cols;
      const uMid = (u0 + u1) / 2;
      const f0 = r / rows;
      const f1 = (r + 1) / rows;

      const polygon: [number, number][] = [
        [x(u0), edgeY(u0, f0)],
        [x(u1), edgeY(u1, f0)],
        [x(u1), edgeY(u1, f1)],
        [x(u0), edgeY(u0, f1)],
      ];
      const centroidX =
        polygon.reduce((sum, [px]) => sum + px, 0) / polygon.length;
      const centroidY =
        polygon.reduce((sum, [, py]) => sum + py, 0) / polygon.length;

      const amenities: AmenityTag[] = [];
      if (r === 0) amenities.push("NEAR_WATER");
      if (r >= rows - 2) amenities.push("SHADED");
      if (uMid > 0.45 && uMid < 0.58) amenities.push("NEAR_VENDOR_ROW");
      if (uMid < 0.12) amenities.push("NEAR_PARKING");
      if (uMid < 0.16 && r <= 1) amenities.push("NEAR_BATHROOM");

      zones.push({
        label: `Z-${String(index + 1).padStart(3, "0")}`,
        section: sectionForU(uMid),
        amenities,
        polygon,
        centroidX,
        centroidY,
        capacity: capacityCycle[index % capacityCycle.length],
      });

      index++;
    }
  }

  return zones;
}
