# Esri Boundaries Review

This document reviews how **Esri / ArcGIS Living Atlas** boundaries could be used for Pakistan boundary verification and clipping in this project.

## Current Stack

- **GADM** (via `import-pakistan-geoboundaries.mjs`): loads Pakistan provinces and districts from [GADM 4.1](https://geodata.ucdavis.edu/gadm/gadm4.1/json/) into `pakistan_provinces` and `pakistan_districts`.
- **Pakistan boundary** for verification and clipping is the union of `pakistan_provinces.geom`.
- Fence validation and clip script use this boundary for `ST_Within` / `ST_Intersects` checks.

## What Esri Offers

- **ArcGIS Living Atlas of the World**: [livingatlas.arcgis.com](https://livingatlas.arcgis.com) – curated global layers including country and administrative boundaries.
- Boundaries are typically exposed as **hosted feature services** (REST), not as a single “download GeoJSON” URL. Item IDs and layer URLs can be found by searching the Living Atlas for “Pakistan” or “administrative boundaries”.
- **Practical use** for this project:
  1. **One-time or periodic import**: Call the Esri REST API (e.g. `Query` on a feature layer), export to GeoJSON/Shapefile, then load into PostGIS (e.g. into a table like `pakistan_boundary_esri`) and use the same `ST_Within` / `ST_Intersects` logic as with GADM.
  2. **In-memory / runtime checks**: Use Esri’s JS API or REST from the app to test “point in Pakistan” or “geometry within boundary” without storing the boundary in our DB – adds a network dependency and is usually less ideal for batch validation.

## Recommendation

- **Keep GADM** as the primary source for `pakistan_provinces` and Pakistan boundary union. It is offline, well-known, and already integrated.
- **Use Esri as an optional alternative or supplement** if you need:
  - Official or Esri-specific boundary definitions.
  - Integration with other ArcGIS tools or workflows.
- **To adopt Esri**:
  1. Browse [Living Atlas](https://livingatlas.arcgis.com/en/browse/) and search for “Pakistan” / “administrative boundaries”.
  2. Note the **item ID** and **feature service URL** from the layer’s details.
  3. Add a small script (e.g. `scripts/import-pakistan-boundary-esri.mjs`) that:
     - Fetches the Pakistan boundary from the Esri REST endpoint (e.g. `.../query?where=1=1&outSR=4326&f=geojson`).
     - Optionally imports into a table (e.g. `pakistan_boundary_esri`) and/or compares with GADM.
  4. Use that table in the same way as the current Pakistan boundary (union of geometries) for verification and clipping, or keep it for comparison only.

## References

- [Living Atlas](https://livingatlas.arcgis.com/)
- [ArcGIS REST API – Query](https://developers.arcgis.com/rest/services-reference/query-feature-service-layer-.htm) (for exporting features as GeoJSON)
- [GADM](https://gadm.org) – current source used in `import-pakistan-geoboundaries.mjs`
