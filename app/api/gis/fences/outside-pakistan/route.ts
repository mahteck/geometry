/**
 * GET /api/gis/fences/outside-pakistan
 * Returns fence IDs from fences_master that are entirely outside Pakistan or extend outside.
 * Used by GIS Map to highlight those fences in red.
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { TABLE } from "@/lib/masterGis";

const FENCES = TABLE.fences_master;

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const sql = `
        WITH pak_boundary AS (
          SELECT ST_Union(geom) AS geom FROM pakistan_provinces WHERE geom IS NOT NULL
        ),
        fence_snapped AS (
          SELECT f.id,
            ST_SnapToGrid(ST_MakeValid(f.geom), 0.00001) AS f_snap
          FROM ${FENCES} f
          WHERE f.geom IS NOT NULL
        ),
        coverage AS (
          SELECT fs.id,
            ST_Intersects(fs.f_snap, b.geom) AS intersects,
            ST_Covers(b.geom, fs.f_snap) AS fully_covered,
            CASE WHEN ST_Area(fs.f_snap::geography) > 0
              THEN ST_Area(ST_Intersection(fs.f_snap, b.geom)::geography) / ST_Area(fs.f_snap::geography)
              ELSE 0 END AS area_ratio
          FROM fence_snapped fs, pak_boundary b
        )
        SELECT c.id
        FROM coverage c
        WHERE NOT c.intersects
           OR (c.intersects AND NOT c.fully_covered AND (c.area_ratio IS NULL OR c.area_ratio < 0.99))
      `;
      const r = await client.query<{ id: number }>(sql);
      const fenceIds = r.rows.map((row) => row.id);
      return NextResponse.json({ fenceIds });
    } finally {
      client.release();
    }
  } catch (e) {
    // pakistan_provinces may not exist; return no out-of-bounds IDs so map still works
    return NextResponse.json({ fenceIds: [] });
  }
}
