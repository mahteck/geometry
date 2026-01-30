import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { FENCES_TABLE } from "@/lib/fenceApi";

/**
 * POST /api/fences/validate/mark-inactive
 * Marks all invalid geometries as 'inactive'
 */
export async function POST() {
  try {
    const client = await pool.connect();
    try {
      // Update status to 'inactive' for all invalid geometries
      const result = await client.query<{ id: number }>(
        `UPDATE ${FENCES_TABLE}
         SET status = 'inactive'
         WHERE geom IS NOT NULL
           AND (
             NOT ST_IsValid(geom)
             OR NOT ST_IsSimple(geom)
           )
         RETURNING id`,
        []
      );

      const updatedCount = result.rowCount ?? 0;
      const updatedIds = result.rows.map((r) => r.id);

      return NextResponse.json({
        success: true,
        updatedCount,
        updatedIds,
        message: `${updatedCount} invalid fences marked as inactive`,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to mark invalid fences as inactive", detail: message },
      { status: 500 }
    );
  }
}
