import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[400px] w-full items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
        <p className="text-slate-600 text-sm">Loading map…</p>
      </div>
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <MapView />
    </div>
  );
}
