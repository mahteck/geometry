"use client";

import { getProvinceColor, PROVINCE_COLORS } from "@/lib/pakistanStyles";

const PROVINCE_LABELS: Record<string, string> = {
  "01": "Gilgit-Baltistan",
  "02": "Balochistan",
  "03": "Khyber Pakhtunkhwa",
  "04": "Punjab",
  "05": "Sindh",
  "06": "Azad Kashmir",
  "07": "Islamabad",
  "08": "Islamabad",
};

export default function PakistanLegend() {
  const uniqueCodes = ["01", "02", "03", "04", "05", "06", "07"];

  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur">
      <p className="mb-2 text-xs font-semibold text-slate-600">Provinces</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {uniqueCodes.map((code) => (
          <div key={code} className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: getProvinceColor(code) }}
            />
            <span className="text-xs text-slate-700">
              {PROVINCE_LABELS[code] || code}
            </span>
          </div>
        ))}
      </div>
      <p className="mb-1 text-xs font-semibold text-slate-600">Roads</p>
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 shrink-0 rounded-sm bg-[#10b981]" />
          <span className="text-xs text-slate-700">Motorways</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 shrink-0 rounded-sm bg-[#3b82f6]" />
          <span className="text-xs text-slate-700">Highways</span>
        </div>
      </div>
    </div>
  );
}
