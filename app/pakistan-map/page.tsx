"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import PakistanSidebar from "@/components/PakistanSidebar";
import PakistanLegend from "@/components/PakistanLegend";
import RoadInfoPanel from "@/components/RoadInfoPanel";
import RoadDetailsModal from "@/components/RoadDetailsModal";
import type { CityFeature } from "@/types/pakistan";
import type { RoadSelection } from "@/types/roads";

const PakistanMap = dynamic(() => import("@/components/PakistanMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[400px] w-full items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
        <p className="text-sm text-slate-600">Loading map…</p>
      </div>
    </div>
  ),
});

const PROVINCES = [
  { code: "01", name: "Gilgit-Baltistan" },
  { code: "02", name: "Balochistan" },
  { code: "03", name: "Khyber Pakhtunkhwa" },
  { code: "04", name: "Punjab" },
  { code: "05", name: "Sindh" },
  { code: "06", name: "Azad Jammu and Kashmir" },
  { code: "07", name: "Islamabad" },
];

export default function PakistanMapPage() {
  const [showProvinces, setShowProvinces] = useState(true);
  const [showDistricts, setShowDistricts] = useState(false);
  const [showCities, setShowCities] = useState(true);
  const [showMotorways, setShowMotorways] = useState(true);
  const [showHighways, setShowHighways] = useState(true);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [cityToZoom, setCityToZoom] = useState<CityFeature | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [selectedRoad, setSelectedRoad] = useState<RoadSelection | null>(null);
  const [showRoadDetailsModal, setShowRoadDetailsModal] = useState(false);

  const handleCitySelect = useCallback((city: CityFeature) => {
    setCityToZoom(city);
  }, []);

  const handleRoadSelect = useCallback((road: RoadSelection) => {
    setSelectedRoad(road);
  }, []);

  const handleViewRoadDetails = useCallback((road: RoadSelection) => {
    setShowRoadDetailsModal(true);
  }, []);

  const handleRoadFound = useCallback(
    async (result: { type: "motorway" | "highway"; id: number }) => {
      try {
        const url =
          result.type === "motorway"
            ? `/api/pakistan/motorways?id=${result.id}`
            : `/api/pakistan/highways?id=${result.id}`;
        const res = await fetch(url);
        const data = await res.json();
        const feat = data.features?.[0];
        if (feat)
          setSelectedRoad({
            type: result.type,
            feature: feat,
          });
      } catch {
        // ignore
      }
    },
    []
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <PakistanSidebar
        showProvinces={showProvinces}
        showDistricts={showDistricts}
        showCities={showCities}
        showMotorways={showMotorways}
        showHighways={showHighways}
        onShowProvincesChange={setShowProvinces}
        onShowDistrictsChange={setShowDistricts}
        onShowCitiesChange={setShowCities}
        onShowMotorwaysChange={setShowMotorways}
        onShowHighwaysChange={setShowHighways}
        selectedProvince={selectedProvince}
        onProvinceChange={setSelectedProvince}
        onCitySelect={handleCitySelect}
        onRoadSelect={handleRoadSelect}
        onRoadFound={handleRoadFound}
        provinces={PROVINCES}
      />
      <main className="relative min-w-0 flex-1">
        <PakistanMap
          showProvinces={showProvinces}
          showDistricts={showDistricts}
          showCities={showCities}
          showMotorways={showMotorways}
          showHighways={showHighways}
          provinceFilter={selectedProvince}
          selectedRoad={selectedRoad}
          onRoadSelect={handleRoadSelect}
          cityToZoom={cityToZoom}
          onZoomDone={() => setCityToZoom(null)}
          resetTrigger={resetTrigger}
        />
        <div className="absolute bottom-4 right-4 z-[1000]">
          <PakistanLegend />
        </div>
        {selectedRoad && (
          <div className="absolute right-4 top-4 z-[1000] w-72">
            <RoadInfoPanel
              road={selectedRoad}
              onClose={() => setSelectedRoad(null)}
              onViewDetails={handleViewRoadDetails}
            />
          </div>
        )}
        <RoadDetailsModal
          road={showRoadDetailsModal ? selectedRoad : null}
          onClose={() => setShowRoadDetailsModal(false)}
        />
        <div className="absolute left-4 top-4 z-[1000] flex gap-2">
          <button
            onClick={() => setResetTrigger((n) => n + 1)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow hover:bg-slate-50"
          >
            Reset View
          </button>
        </div>
      </main>
    </div>
  );
}
