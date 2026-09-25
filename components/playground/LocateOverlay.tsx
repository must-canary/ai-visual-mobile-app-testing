"use client";

import type { LocateInfo } from "@/models/types";

export function LocateOverlay({
  locate,
  className,
}: {
  locate: LocateInfo;
  className?: string;
}) {
  if (!locate.sentW || !locate.sentH) return null;
  const radius = Math.max(10, Math.round(locate.sentW / 40));

  return (
    <svg
      viewBox={`0 0 ${locate.sentW} ${locate.sentH}`}
      preserveAspectRatio="xMidYMid meet"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
    >
      {locate.found && locate.x !== null && locate.y !== null ? (
        <>
          <circle
            cx={locate.x}
            cy={locate.y}
            r={radius}
            fill="none"
            stroke="#10b981"
            strokeWidth={radius / 4}
          />
          <circle cx={locate.x} cy={locate.y} r={radius / 5} fill="#10b981" />
        </>
      ) : null}

      {locate.candidates.map((candidate, index) => (
        <g key={`${candidate.x}-${candidate.y}-${index}`}>
          <circle
            cx={candidate.x}
            cy={candidate.y}
            r={radius}
            fill="rgba(239,68,68,0.2)"
            stroke="#ef4444"
            strokeWidth={radius / 5}
          />
          <text
            x={candidate.x}
            y={candidate.y + radius / 2.5}
            textAnchor="middle"
            fontSize={radius * 1.2}
            fill="#ef4444"
            fontWeight="bold"
          >
            {index + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
