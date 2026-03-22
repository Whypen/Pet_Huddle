/**
 * Marketplace — C.6
 * Filter bar (glass-bar fixed top) + NannyCard list.
 * Canvas shows through. No bg-white.
 */

import React, { useState } from "react";
import { NannyCard } from "@/components/marketplace/NannyCard";
import { BOTTOM_NAV_HEIGHT } from "@/components/layout/BottomNav";

// ─── Filter chip data ──────────────────────────────────────────────────────────

const FILTER_CHIPS = [
  "All",
  "Dog Care",
  "Cat Care",
  "Overnight",
  "Walking",
  "Grooming",
  "Available Now",
];

// ─── Sample nanny data ────────────────────────────────────────────────────────

const NANNY_SAMPLES = [
  {
    id: "1",
    name: "Sophie Lam",
    isVerified: true,
    distance: "0.4 km",
    services: ["Dog Care", "Walking", "Grooming"],
    ratePerHour: "$22",
    availableNow: true,
  },
  {
    id: "2",
    name: "Marco Chen",
    isVerified: false,
    distance: "1.1 km",
    services: ["Cat Care", "Overnight"],
    ratePerHour: "$18",
    availableNow: false,
  },
  {
    id: "3",
    name: "Aisha Patel",
    isVerified: true,
    distance: "0.8 km",
    services: ["Dog Care", "Cat Care", "Overnight"],
    ratePerHour: "$25",
    availableNow: true,
  },
  {
    id: "4",
    name: "Lucas Kim",
    isVerified: false,
    distance: "2.0 km",
    services: ["Walking", "Dog Care"],
    ratePerHour: "$16",
    availableNow: false,
  },
  {
    id: "5",
    name: "Emma Walsh",
    isVerified: true,
    distance: "0.6 km",
    services: ["Grooming", "Cat Care"],
    ratePerHour: "$20",
    availableNow: true,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

const Marketplace: React.FC = () => {
  const [activeFilter, setActiveFilter]   = useState("All");

  const FILTER_BAR_H = 50;
  const bottomOffset  = BOTTOM_NAV_HEIGHT + 20;

  return (
    <div className="h-full min-h-0 relative overflow-x-hidden">
      {/* ── Filter bar — glass-bar fixed top ─────────────────────────────────── */}
      <div
        className="glass-bar fixed top-0 inset-x-0 z-[20] px-4"
        style={{ height: `${FILTER_BAR_H}px` }}
      >
        <div className="flex items-center gap-[8px] h-full overflow-x-auto scrollbar-none">
          {FILTER_CHIPS.map((chip) => {
            const isActive = chip === activeFilter;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => setActiveFilter(chip)}
                className="flex-shrink-0 h-8 px-4 rounded-full text-[13px] font-[500] transition-all duration-150 active:scale-[0.96]"
                style={{
                  background: isActive
                    ? "linear-gradient(145deg, #2A53E0 0%, #1C3ECC 100%)"
                    : "rgba(255,255,255,0.55)",
                  color: isActive ? "#fff" : "rgba(74,73,101,0.70)",
                  border: isActive
                    ? "none"
                    : "1px solid rgba(255,255,255,0.55)",
                  boxShadow: isActive
                    ? "6px 6px 14px rgba(33,69,207,0.22), -4px -4px 10px rgba(96,141,255,0.28)"
                    : "none",
                }}
                aria-pressed={isActive}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Card list ─────────────────────────────────────────────────────────── */}
      <div
        className="px-4 space-y-4"
        style={{
          paddingTop: `calc(${FILTER_BAR_H}px + 12px)`,
          paddingBottom: `${bottomOffset + 16}px`,
        }}
      >
        {NANNY_SAMPLES.map((nanny) => (
          <NannyCard
            key={nanny.id}
            name={nanny.name}
            isVerified={nanny.isVerified}
            distance={nanny.distance}
            services={nanny.services}
            ratePerHour={nanny.ratePerHour}
            availableNow={nanny.availableNow}
            onMessage={() => {/* navigate to DM */}}
            onBook={() => {/* open booking flow */}}
          />
        ))}
      </div>

    </div>
  );
};

export default Marketplace;
