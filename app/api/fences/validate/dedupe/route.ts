import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { FENCES_TABLE } from "@/lib/fenceApi";

/**
 * POST /api/fences/validate/dedupe
 *
 * Finds groups of fences that share the same normalized geometry and
 * marks all non-canonical members of each group as inactive (status = 'inactive').
 *
 * - Canonical fence per group = smallest id.
 * - No rows are deleted; only status is updated.
 */
export async function POST() {
  try {
    const client = await pool.connect();
    try {
      const sql = `
        WITH norm AS (
          SELECT
            f.id,
            ST_Normalize(
              ST_SnapToGrid(
                ST_MakeValid(f.geom),
                0.000001
              )
            ) AS norm_geom
          FROM ${FENCES_TABLE} f
          WHERE f.geom IS NOT NULL
        ),
        groups AS (
          SELECT
            md5(ST_AsBinary(norm_geom)) AS geom_key,
            MIN(id) AS canonical_id,
            COUNT(*) AS group_size
          FROM norm
          GROUP BY md5(ST_AsBinary(norm_geom))
          HAVING COUNT(*) > 1
        ),
        dupes AS (
          SELECT n.id
          FROM norm n
          JOIN groups g
            ON md5(ST_AsBinary(n.norm_geom)) = g.geom_key
          WHERE n.id <> g.canonical_id
        )
        UPDATE ${FENCES_TABLE} f
        SET status = 'inactive'
        FROM dupes
        WHERE f.id = dupes.id
        RETURNING f.id
      `;

      const result = await client.query<{ id: number }>(sql);
      const updatedCount = result.rowCount ?? 0;
      const updatedIds = result.rows.map((r) => r.id);

      return NextResponse.json({
        success: true,
        updatedCount,
        updatedIds,
        message: `${updatedCount} duplicate fences marked as inactive`,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to de-duplicate fences", detail: message },
      { status: 500 }
    );
  }
}

