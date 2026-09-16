import { bandGeometry } from "@/lib/zoneGrid";

/**
 * A generated illustrative backdrop (sea, sand, tree line, vendor row, parking,
 * a river-mouth accent) drawn purely from the beach's map dimensions — used
 * when a beach has no real photo yet. Its shoreline curve uses the same
 * geometry as the zone grid, so zones always sit convincingly "on the sand".
 * Supplying `mapImageUrl` on the Beach record swaps this out for a real photo
 * with no code changes.
 */
export function BeachBackground({
  mapWidth,
  mapHeight,
}: {
  mapWidth: number;
  mapHeight: number;
}) {
  const { topEdge, bottomEdge } = bandGeometry({ mapWidth, mapHeight });

  const steps = 40;
  const shoreline = Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    return `${(u * mapWidth).toFixed(1)},${topEdge(u).toFixed(1)}`;
  }).join(" ");

  const treeline = Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    return `${(u * mapWidth).toFixed(1)},${bottomEdge(u).toFixed(1)}`;
  }).join(" ");

  const seaPath = `M0,0 L${mapWidth},0 L${shoreline
    .split(" ")
    .reverse()
    .join(" L")} Z`;
  const sandPath = `M${shoreline} L${treeline.split(" ").reverse().join(" L")} Z`;

  // Trees dotted along the tree line, thinning out over the vendor-row gap.
  const trees = Array.from({ length: 26 }, (_, i) => {
    const u = i / 25;
    if (u > 0.42 && u < 0.6) return null; // gap for vendor row
    const y = bottomEdge(u) + mapHeight * 0.02;
    return (
      <circle
        key={i}
        cx={u * mapWidth}
        cy={y}
        r={mapWidth * 0.009}
        className="fill-emerald-800/70"
      />
    );
  });

  const vendorStalls = Array.from({ length: 5 }, (_, i) => {
    const u = 0.45 + (i / 4) * 0.12;
    const y = bottomEdge(u) + mapHeight * 0.015;
    const w = mapWidth * 0.03;
    const h = mapHeight * 0.035;
    return (
      <rect
        key={i}
        x={u * mapWidth - w / 2}
        y={y}
        width={w}
        height={h}
        rx={2}
        className="fill-amber-800/60 stroke-amber-950/40"
        strokeWidth={1}
      />
    );
  });

  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="sea-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d7fa8" />
          <stop offset="100%" stopColor="#3fa9d1" />
        </linearGradient>
        <linearGradient id="sand-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eddcb0" />
          <stop offset="100%" stopColor="#dcc088" />
        </linearGradient>
      </defs>

      {/* Inland backdrop (road/greenery beyond the tree line) */}
      <rect x={0} y={0} width={mapWidth} height={mapHeight} className="fill-emerald-900/30" />
      <path d={seaPath} fill="url(#sea-gradient)" />

      {/* River mouth accent, Maracas-style inlet at the eastern (right) end */}
      <path
        d={`M${mapWidth * 0.86},0 C${mapWidth * 0.8},${mapHeight * 0.35} ${mapWidth * 0.94},${mapHeight * 0.55} ${mapWidth * 0.9},${mapHeight}
            L${mapWidth},${mapHeight} L${mapWidth},0 Z`}
        fill="url(#sea-gradient)"
        opacity={0.85}
      />

      <path d={sandPath} fill="url(#sand-gradient)" />

      {/* rear tree line + vendor row */}
      {trees}
      {vendorStalls}

      {/* parking area, far left */}
      <g transform={`translate(${mapWidth * 0.02}, ${mapHeight * 0.86})`}>
        <rect width={mapWidth * 0.08} height={mapHeight * 0.1} rx={4} className="fill-slate-500/50" />
        <text
          x={mapWidth * 0.04}
          y={mapHeight * 0.06}
          textAnchor="middle"
          className="fill-white"
          fontSize={mapHeight * 0.045}
          fontWeight={700}
        >
          P
        </text>
      </g>

      <path
        d={`M0,${topEdge(0)} L${shoreline}`}
        fill="none"
        stroke="#ffffffaa"
        strokeWidth={2}
      />
    </g>
  );
}
