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
        snapped AS (
          SELECT f.id,
            ST_SnapToGrid(ST_MakeValid(f.geom), 0.00001) AS f_snap,
            ST_SnapToGrid(ST_MakeValid(b.geom), 0.00001) AS b_snap
          FROM ${FENCES} f, pak_boundary b
          WHERE f.geom IS NOT NULL
        )
        SELECT s.id
        FROM snapped s
        WHERE NOT ST_Intersects(s.f_snap, s.b_snap)
           OR (ST_Intersects(s.f_snap, s.b_snap) AND NOT ST_Covers(s.b_snap, s.f_snap))
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
