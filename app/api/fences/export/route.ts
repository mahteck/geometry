import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  parseBbox,
  buildFilterClauses,
  FENCES_TABLE,
} from "@/app/api/fences/route";
import type { FenceFeature, GeoJSONFeatureCollection } from "@/types/fence";

const KML_NS = "http://www.opengis.net/kml/2.2";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function timestampFilename(ext: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `fences_${y}-${m}-${d}_${h}-${min}-${s}.${ext}`;
}

interface RowGeoJSON {
  id: number;
  name: string | null;
  address?: string | null;
  city?: string | null;
  geometry: unknown;
}

interface RowKML {
  id: number;
  name: string | null;
  address: string | null;
  city: string | null;
  kml_geom: string | null;
}

interface RowCSV {
  id: number;
  name: string | null;
  address: string | null;
  city: string | null;
  wkt: string | null;
}

function normalizeGeometry(raw: unknown): { type: string; coordinates: unknown } | null {
  if (!raw) return null;
  const geom = typeof raw === "string" ? (JSON.parse(raw) as { type?: string; coordinates?: unknown }) : (raw as { type?: string; coordinates?: unknown });
  if (!geom || typeof geom !== "object" || !geom.type || !geom.coordinates) return null;
  return { type: geom.type, coordinates: geom.coordinates };
}

function toFeature(r: RowGeoJSON): FenceFeature {
  const geometry = normalizeGeometry(r.geometry);
  if (!geometry) throw new Error("Invalid geometry");
  return {
    type: "Feature",
    id: r.id,
    properties: {
      name: r.name ?? `Zone_${r.id}`,
      ...(r.address != null && { address: r.address }),
      ...(r.city != null && { city: r.city }),
    },
    geometry: geometry as FenceFeature["geometry"],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format")?.toLowerCase();
    if (!format || !["geojson", "kml", "csv"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format", detail: "format must be geojson, kml, or csv" },
        { status: 400 }
      );
    }

    const bbox = parseBbox(searchParams);
    const bboxClause =
      bbox == null
        ? ""
        : `AND ST_Intersects(d.geom, ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326))`;
    const { clauses: filterClauses, params: filterParams } = buildFilterClauses(searchParams);
    const whereTail = `${bboxClause}${filterClauses}`;

    const client = await pool.connect();
    try {
      if (format === "geojson") {
        const sqlExtended = `
          SELECT f.id, f.name, f.address, f.city,
            ST_AsGeoJSON(d.geom)::json as geometry
          FROM ${FENCES_TABLE} f,
          LATERAL ST_Dump(f.geom) AS d
          WHERE f.geom IS NOT NULL
          ${whereTail}
          ORDER BY f.id, d.path;
        `;
        const sqlSimple = `
          SELECT f.id, f.name,
            ST_AsGeoJSON(d.geom)::json as geometry
          FROM ${FENCES_TABLE} f,
          LATERAL ST_Dump(f.geom) AS d
          WHERE f.geom IS NOT NULL
          ${whereTail}
          ORDER BY f.id, d.path;
        `;
        let rows: RowGeoJSON[];
        try {
          const r = await client.query<RowGeoJSON>(sqlExtended, filterParams);
          rows = r.rows;
        } catch {
          const r = await client.query<RowGeoJSON>(sqlSimple, filterParams);
          rows = r.rows;
        }
        const features = rows
          .map((row) => {
            try {
              return toFeature(row);
            } catch {
              return null;
            }
          })
          .filter((f): f is FenceFeature => f != null);
        const fc: GeoJSONFeatureCollection<FenceFeature> = {
          type: "FeatureCollection",
          features,
        };
        const filename = timestampFilename("geojson");
        return new NextResponse(JSON.stringify(fc, null, 0), {
          status: 200,
          headers: {
            "Content-Type": "application/geo+json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      if (format === "kml") {
        const sqlExtended = `
          SELECT f.id, f.name, f.address, f.city,
            ST_AsKML(d.geom) as kml_geom
          FROM ${FENCES_TABLE} f,
          LATERAL ST_Dump(f.geom) AS d
          WHERE f.geom IS NOT NULL
          ${whereTail}
          ORDER BY f.id, d.path;
        `;
        const sqlSimple = `
          SELECT f.id, f.name,
            NULL::text as address, NULL::text as city,
            ST_AsKML(d.geom) as kml_geom
          FROM ${FENCES_TABLE} f,
          LATERAL ST_Dump(f.geom) AS d
          WHERE f.geom IS NOT NULL
          ${whereTail}
          ORDER BY f.id, d.path;
        `;
        let rows: RowKML[];
        try {
          const r = await client.query<RowKML>(sqlExtended, filterParams);
          rows = r.rows;
        } catch {
          const r = await client.query<RowKML>(sqlSimple, filterParams);
          rows = r.rows;
        }
        const parts: string[] = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          `<kml xmlns="${KML_NS}">`,
          "  <Document>",
          "    <name>Fences</name>",
        ];
        for (const row of rows) {
          const name = escapeXml(row.name ?? `Zone_${row.id}`);
          const descParts = [`ID: ${row.id}`];
          if (row.address) descParts.push(`Address: ${escapeXml(String(row.address))}`);
          if (row.city) descParts.push(`City: ${escapeXml(String(row.city))}`);
          const description = escapeXml(descParts.join("\n"));
          const geom = row.kml_geom?.trim() ?? "";
          parts.push("    <Placemark>");
          parts.push(`      <name>${name}</name>`);
          parts.push(`      <description>${description}</description>`);
          if (geom) parts.push(geom.split("\n").map((l) => "      " + l).join("\n"));
          parts.push("    </Placemark>");
        }
        parts.push("  </Document>");
        parts.push("</kml>");
        const kml = parts.join("\n");
        const filename = timestampFilename("kml");
        return new NextResponse(kml, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      if (format === "csv") {
        const sqlExtended = `
          SELECT f.id, f.name, f.address, f.city,
            ST_AsText(d.geom) as wkt
          FROM ${FENCES_TABLE} f,
          LATERAL ST_Dump(f.geom) AS d
          WHERE f.geom IS NOT NULL
          ${whereTail}
          ORDER BY f.id, d.path;
        `;
        const sqlSimple = `
          SELECT f.id, f.name,
            NULL::text as address, NULL::text as city,
            ST_AsText(d.geom) as wkt
          FROM ${FENCES_TABLE} f,
          LATERAL ST_Dump(f.geom) AS d
          WHERE f.geom IS NOT NULL
          ${whereTail}
          ORDER BY f.id, d.path;
        `;
        let rows: RowCSV[];
        try {
          const r = await client.query<RowCSV>(sqlExtended, filterParams);
          rows = r.rows;
        } catch {
          const r = await client.query<RowCSV>(sqlSimple, filterParams);
          rows = r.rows;
        }
        function escapeCsv(val: string | null | undefined): string {
          if (val == null) return "";
          const s = String(val);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        }
        const header = "id,name,address,city,geometry_wkt";
        const lines = [header];
        for (const row of rows) {
          const id = row.id;
          const name = escapeCsv(row.name);
          const address = escapeCsv(row.address);
          const city = escapeCsv(row.city);
          const wkt = escapeCsv(row.wkt);
          lines.push(`${id},${name},${address},${city},${wkt}`);
        }
        const csv = lines.join("\r\n");
        const filename = timestampFilename("csv");
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Export failed", detail: message },
      { status: 500 }
    );
  }
}
