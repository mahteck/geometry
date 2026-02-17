/**
 * GET /api/gis/fences/export?format=geojson|csv|kml
 * Exports fences_master with same filters as GET /api/gis/fences.
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  TABLE,
  parseBbox,
  bboxClause,
  buildFencesFilterClauses,
} from "@/lib/masterGis";
import type { FenceMasterFeature } from "@/types/masterGis";
import type { GeoJSONFeatureCollection } from "@/types/fence";

const FENCES = TABLE.fences_master;
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format")?.toLowerCase();
    if (!format || !["geojson", "kml", "csv"].includes(format)) {
      return NextResponse.json(
        {
          error: "Invalid format",
          detail: "format must be geojson, kml, or csv",
        },
        { status: 400 }
      );
    }

    const bbox = parseBbox(searchParams);
    const bboxWhere = bboxClause(bbox, "f.geom");
    const { clauses: filterClauses, params: filterParams } =
      buildFencesFilterClauses(searchParams);
    const where = `WHERE f.geom IS NOT NULL ${bboxWhere}${filterClauses}`;

    const client = await pool.connect();
    try {
      if (format === "geojson") {
        const sql = `
          SELECT f.id, f.name, f.fence_type, f.route_type, f.region_name, f.status, f.area_size, f.is_big,
            ST_AsGeoJSON(f.geom)::json AS geometry
          FROM ${FENCES} f
          ${where}
          ORDER BY f.id
        `;
        const r = await client.query<{
          id: number;
          name: string | null;
          fence_type: string | null;
          route_type: string | null;
          region_name: string | null;
          status: string | null;
          area_size: number | null;
          is_big: boolean | null;
          geometry: unknown;
        }>(sql, filterParams);
        const features: FenceMasterFeature[] = r.rows
          .map((row): FenceMasterFeature | null => {
            const geom =
              typeof row.geometry === "string"
                ? JSON.parse(row.geometry)
                : row.geometry;
            if (!geom?.type || !geom?.coordinates) return null;
            return {
              type: "Feature",
              id: row.id,
              properties: {
                name: row.name ?? `Zone_${row.id}`,
                fence_type: row.fence_type ?? null,
                route_type: row.route_type ?? null,
                region_name: row.region_name ?? null,
                status: row.status ?? null,
                area_size: row.area_size != null ? Number(row.area_size) : null,
                is_big: row.is_big ?? null,
              },
              geometry: geom,
            };
          })
          .filter((f): f is FenceMasterFeature => f != null);
        const fc: GeoJSONFeatureCollection<FenceMasterFeature> = {
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
        const sql = `
          SELECT f.id, f.name, f.region_name, f.status, f.route_type,
            ST_AsKML(f.geom) AS kml_geom
          FROM ${FENCES} f
          ${where}
          ORDER BY f.id
        `;
        const r = await client.query<{
          id: number;
          name: string | null;
          region_name: string | null;
          status: string | null;
          route_type: string | null;
          kml_geom: string | null;
        }>(sql, filterParams);
        const parts = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          `<kml xmlns="${KML_NS}">`,
          "  <Document>",
          "    <name>Fences</name>",
        ];
        for (const row of r.rows) {
          const name = escapeXml(row.name ?? `Zone_${row.id}`);
          const desc = [
            `ID: ${row.id}`,
            row.region_name && `Region: ${escapeXml(row.region_name)}`,
            row.status && `Status: ${escapeXml(row.status)}`,
            row.route_type && `Route: ${escapeXml(row.route_type)}`,
          ]
            .filter(Boolean)
            .join("\n");
          const geom = row.kml_geom?.trim() ?? "";
          parts.push("    <Placemark>");
          parts.push(`      <name>${name}</name>`);
          parts.push(`      <description>${escapeXml(desc)}</description>`);
          if (geom) parts.push(geom.split("\n").map((l) => "      " + l).join("\n"));
          parts.push("    </Placemark>");
        }
        parts.push("  </Document>");
        parts.push("</kml>");
        const filename = timestampFilename("kml");
        return new NextResponse(parts.join("\n"), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      if (format === "csv") {
        const sql = `
          SELECT f.id, f.name, f.fence_type, f.route_type, f.region_name, f.status, f.area_size, f.is_big,
            ST_AsText(f.geom) AS wkt
          FROM ${FENCES} f
          ${where}
          ORDER BY f.id
        `;
        const r = await client.query(sql, filterParams);
        const escapeCsv = (val: string | number | boolean | null | undefined): string => {
          if (val == null) return "";
          const s = String(val);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const header =
          "id,name,fence_type,route_type,region_name,status,area_size,is_big,geometry_wkt";
        const lines = [header];
        for (const row of r.rows as {
          id: number;
          name: string | null;
          fence_type: string | null;
          route_type: string | null;
          region_name: string | null;
          status: string | null;
          area_size: number | null;
          is_big: boolean | null;
          wkt: string | null;
        }[]) {
          lines.push(
            [
              row.id,
              escapeCsv(row.name),
              escapeCsv(row.fence_type),
              escapeCsv(row.route_type),
              escapeCsv(row.region_name),
              escapeCsv(row.status),
              escapeCsv(row.area_size),
              escapeCsv(row.is_big),
              escapeCsv(row.wkt),
            ].join(",")
          );
        }
        const filename = timestampFilename("csv");
        return new NextResponse(lines.join("\r\n"), {
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
