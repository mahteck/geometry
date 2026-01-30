import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { FENCES_TABLE } from "@/app/api/fences/route";

const M2_TO_SQKM = 1e6;

interface FenceRow {
  id: number;
  name: string | null;
  area_m2: number;
  region: string;
  status: string;
}

/** Region derived from name (same logic as filters). */
const REGION_CASE = `
  CASE
    WHEN f.name ILIKE '%lahore%' THEN 'Lahore'
    WHEN f.name ILIKE '%karachi%' THEN 'Karachi'
    WHEN f.name ILIKE '%islamabad%' THEN 'Islamabad'
    ELSE 'Other'
  END
`;

export interface FenceStatsResponse {
  totalFences: number;
  totalAreaSqKm: number;
  largestFence: { name: string; areaSqKm: number };
  smallestFence: { name: string; areaSqKm: number };
  averageAreaSqKm: number;
  byRegion: { region: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      // Per-fence area (sum of parts), region from name, status if column exists
      const sqlWithStatus = `
        SELECT
          f.id,
          f.name,
          SUM(ST_Area(d.geom::geography)) AS area_m2,
          ${REGION_CASE} AS region,
          COALESCE(NULLIF(TRIM(f.status), ''), 'unknown') AS status
        FROM ${FENCES_TABLE} f,
        LATERAL ST_Dump(f.geom) AS d
        WHERE f.geom IS NOT NULL
        GROUP BY f.id, f.name, f.status
      `;
      const sqlWithoutStatus = `
        SELECT
          f.id,
          f.name,
          SUM(ST_Area(d.geom::geography)) AS area_m2,
          ${REGION_CASE} AS region,
          'all' AS status
        FROM ${FENCES_TABLE} f,
        LATERAL ST_Dump(f.geom) AS d
        WHERE f.geom IS NOT NULL
        GROUP BY f.id, f.name
      `;

      let rows: FenceRow[];
      try {
        const r = await client.query<FenceRow>(sqlWithStatus);
        rows = r.rows;
      } catch {
        const r = await client.query<FenceRow>(sqlWithoutStatus);
        rows = r.rows;
      }

      if (rows.length === 0) {
        const empty: FenceStatsResponse = {
          totalFences: 0,
          totalAreaSqKm: 0,
          largestFence: { name: "—", areaSqKm: 0 },
          smallestFence: { name: "—", areaSqKm: 0 },
          averageAreaSqKm: 0,
          byRegion: [],
          byStatus: [],
        };
        return NextResponse.json(empty);
      }

      const totalFences = rows.length;
      const totalAreaSqKm = rows.reduce((s, r) => s + Number(r.area_m2), 0) / M2_TO_SQKM;
      const areas = rows.map((r) => Number(r.area_m2) / M2_TO_SQKM);
      const averageAreaSqKm = areas.reduce((a, b) => a + b, 0) / totalFences;
      const maxRow = rows.reduce((a, b) => (Number(b.area_m2) > Number(a.area_m2) ? b : a));
      const minRow = rows.reduce((a, b) => (Number(b.area_m2) < Number(a.area_m2) ? b : a));

      const byRegionMap = new Map<string, number>();
      for (const r of rows) {
        byRegionMap.set(r.region, (byRegionMap.get(r.region) ?? 0) + 1);
      }
      const byRegion = Array.from(byRegionMap.entries())
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count);

      const byStatusMap = new Map<string, number>();
      for (const r of rows) {
        const s = r.status === "unknown" ? "Unknown" : r.status === "all" ? "All" : r.status;
        byStatusMap.set(s, (byStatusMap.get(s) ?? 0) + 1);
      }
      const byStatus = Array.from(byStatusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      const response: FenceStatsResponse = {
        totalFences,
        totalAreaSqKm: Math.round(totalAreaSqKm * 100) / 100,
        largestFence: {
          name: maxRow.name ?? `Fence #${maxRow.id}`,
          areaSqKm: Math.round((Number(maxRow.area_m2) / M2_TO_SQKM) * 100) / 100,
        },
        smallestFence: {
          name: minRow.name ?? `Fence #${minRow.id}`,
          areaSqKm: Math.round((Number(minRow.area_m2) / M2_TO_SQKM) * 100) / 100,
        },
        averageAreaSqKm: Math.round(averageAreaSqKm * 100) / 100,
        byRegion,
        byStatus,
      };

      return NextResponse.json(response);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load stats", detail: message },
      { status: 500 }
    );
  }
}
