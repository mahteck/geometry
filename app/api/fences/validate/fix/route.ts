import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { FENCES_TABLE } from "@/app/api/fences/route";

/** POST /api/fences/validate/fix – apply ST_MakeValid to given fence IDs */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: number[] };
    const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isFinite(n) && n > 0) : [];
    if (ids.length === 0) {
      return NextResponse.json({ fixed: 0, error: "No valid ids provided" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      const result = await client.query<{ id: number }>(
        `UPDATE ${FENCES_TABLE}
         SET geom = ST_MakeValid(geom)
         WHERE id = ANY($1::int[])
         RETURNING id`,
        [ids]
      );
      const fixed = result.rowCount ?? 0;
      return NextResponse.json({ fixed });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Fix failed", detail: message },
      { status: 500 }
    );
  }
}
