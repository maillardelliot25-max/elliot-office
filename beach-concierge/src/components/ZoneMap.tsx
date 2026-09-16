"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { ParsedZone } from "@/lib/parse";
import type { AmenityTag, ZoneSection } from "@/lib/zoneGrid";
import {
  AMENITY_ICONS,
  AMENITY_LABELS,
  AMENITY_ORDER,
  SECTION_LABELS,
  SECTION_ORDER,
} from "@/lib/labels";
import { BeachBackground } from "@/components/BeachBackground";

type ZoneStatus = "available" | "taken" | "selected" | "filtered-out";

const STATUS_STYLES: Record<ZoneStatus, { fill: string; stroke: string; cursor: string }> = {
  available: { fill: "fill-emerald-400/55 hover:fill-emerald-400/80", stroke: "stroke-emerald-700", cursor: "cursor-pointer" },
  selected: { fill: "fill-amber-400/90", stroke: "stroke-amber-700", cursor: "cursor-pointer" },
  taken: { fill: "fill-slate-400/60", stroke: "stroke-slate-600", cursor: "cursor-not-allowed" },
  "filtered-out": { fill: "fill-slate-300/20", stroke: "stroke-slate-300/40", cursor: "cursor-default" },
};

export interface ZoneMapProps {
  mapWidth: number;
  mapHeight: number;
  mapImageUrl?: string | null;
  zones: ParsedZone[];
  bookedZoneIds: string[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
}

export function ZoneMap({
  mapWidth,
  mapHeight,
  mapImageUrl,
  zones,
  bookedZoneIds,
  selectedZoneId,
  onSelectZone,
}: ZoneMapProps) {
  const [sectionFilters, setSectionFilters] = useState<ZoneSection[]>([]);
  const [amenityFilters, setAmenityFilters] = useState<AmenityTag[]>([]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  const bookedSet = useMemo(() => new Set(bookedZoneIds), [bookedZoneIds]);

  function toggle<T>(list: T[], value: T, setList: (v: T[]) => void) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function matchesFilters(zone: ParsedZone) {
    const sectionOk = sectionFilters.length === 0 || sectionFilters.includes(zone.section);
    const amenityOk =
      amenityFilters.length === 0 || amenityFilters.every((a) => zone.amenities.includes(a));
    return sectionOk && amenityOk;
  }

  function statusFor(zone: ParsedZone): ZoneStatus {
    if (zone.id === selectedZoneId) return "selected";
    if (bookedSet.has(zone.id) || !zone.isBookable) return "taken";
    if (!matchesFilters(zone)) return "filtered-out";
    return "available";
  }

  const hoveredZone = zones.find((z) => z.id === hoveredZoneId);
  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const detailZone = hoveredZone ?? selectedZone;
  const availableCount = zones.filter(
    (z) => !bookedSet.has(z.id) && z.isBookable && matchesFilters(z)
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <div>
            <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Section
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SECTION_ORDER.map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => toggle(sectionFilters, section, setSectionFilters)}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    sectionFilters.includes(section)
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-slate-300 bg-slate-50 text-slate-700 hover:border-sky-400"
                  )}
                >
                  {SECTION_LABELS[section]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Amenities
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {AMENITY_ORDER.map((amenity) => (
                <button
                  key={amenity}
                  type="button"
                  onClick={() => toggle(amenityFilters, amenity, setAmenityFilters)}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    amenityFilters.includes(amenity)
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 bg-slate-50 text-slate-700 hover:border-emerald-400"
                  )}
                >
                  {AMENITY_ICONS[amenity]} {AMENITY_LABELS[amenity]}
                </button>
              ))}
            </div>
          </div>
          {(sectionFilters.length > 0 || amenityFilters.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setSectionFilters([]);
                setAmenityFilters([]);
              }}
              className="w-fit text-xs font-medium text-sky-700 underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="shrink-0 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{availableCount}</span> zones
          match your filters
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-sky-100">
          <svg
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            className="h-auto w-full select-none"
            role="group"
            aria-label="Beach zone map"
          >
            {mapImageUrl ? (
              <image
                href={mapImageUrl}
                x={0}
                y={0}
                width={mapWidth}
                height={mapHeight}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <BeachBackground mapWidth={mapWidth} mapHeight={mapHeight} />
            )}

            {zones.map((zone) => {
              const status = statusFor(zone);
              const style = STATUS_STYLES[status];
              const points = zone.polygon.map(([x, y]) => `${x},${y}`).join(" ");
              const interactive = status === "available" || status === "selected";
              return (
                <g
                  key={zone.id}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={`Zone ${zone.label}, ${status}`}
                  onMouseEnter={() => setHoveredZoneId(zone.id)}
                  onMouseLeave={() => setHoveredZoneId((id) => (id === zone.id ? null : id))}
                  onClick={() => interactive && onSelectZone(zone.id)}
                  onKeyDown={(e) => {
                    if (interactive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelectZone(zone.id);
                    }
                  }}
                  className={clsx(style.cursor, "outline-none")}
                >
                  <polygon
                    points={points}
                    className={clsx(style.fill, style.stroke, "transition-colors")}
                    strokeWidth={status === "selected" ? 2.5 : 1}
                  />
                  {status !== "filtered-out" && (
                    <text
                      x={zone.centroidX}
                      y={zone.centroidY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={mapHeight * 0.018}
                      className="pointer-events-none fill-slate-900/70 font-medium"
                    >
                      {zone.label.replace("Z-", "")}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Legend
            </p>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-emerald-400/70 ring-1 ring-emerald-700" />
                Available
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-amber-400 ring-1 ring-amber-700" />
                Selected
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-slate-400/70 ring-1 ring-slate-600" />
                Taken
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-slate-200 ring-1 ring-slate-300" />
                Hidden by filter
              </li>
            </ul>
          </div>

          <div className="min-h-[9rem] rounded-lg border border-slate-200 bg-white p-3 text-sm">
            {detailZone ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Zone {detailZone.label}
                </p>
                <p className="mt-1 text-slate-700">{SECTION_LABELS[detailZone.section]}</p>
                <p className="text-slate-700">Up to {detailZone.capacity} people</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {detailZone.amenities.length === 0 && (
                    <span className="text-xs text-slate-400">No tagged amenities</span>
                  )}
                  {detailZone.amenities.map((a) => (
                    <span
                      key={a}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {AMENITY_ICONS[a]} {AMENITY_LABELS[a]}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-slate-400">Hover or tap a zone to see details.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
