/**
 * GET /api/gis/fences/overlaps
 * Returns pairs of fence IDs that overlap (ST_Overlaps or ST_Intersects with area overlap).
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { TABLE } from "@/lib/masterGis";

const FENCES = TABLE.fences_master;

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const r = await client.query<{ id1: number; id2: number }>(
        `SELECT a.id AS id1, b.id AS id2
         FROM ${FENCES} a
         JOIN ${FENCES} b ON a.id < b.id AND a.geom IS NOT NULL AND b.geom IS NOT NULL
         WHERE ST_Intersects(a.geom, b.geom)
           AND NOT ST_Touches(a.geom, b.geom)
         LIMIT 500`
      );
      return NextResponse.json({ overlaps: r.rows });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to compute overlaps", detail: message },
      { status: 500 }
    );
  }
}
