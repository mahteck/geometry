# Pakistan OSM data → tables (roads_master, cities_master, areas_master)

**Fences** GIS map par aapki **`fence`** table se aate hain (migration 012).  
**Roads, cities, areas** PBF file se direct tables mein jate hain – **osm2pgsql install nahi chahiye**.

## Recommended: Node.js PBF import (pakistan-260215.osm.pbf)

1. **PBF file** project root par rakhen: `pakistan-260215.osm.pbf` (ya `pakistan-latest.osm.pbf`).
2. **Download:** [Geofabrik – Pakistan](https://download.geofabrik.de/asia/pakistan.html) se file le sakte hain.
3. **Import chalaen:**

```bash
npm run pbf:import
```

Ye script:
- **Pass 1:** PBF se nodes ko DB ki temp table mein daalti hai (memory limit nahi aati).
- **Pass 2:** Ways (highway = motorway, trunk, primary, secondary) aur place nodes (city, town, suburb, neighbourhood, locality) nikaalti hai.
- **roads_master**, **cities_master**, **areas_master** mein INSERT karti hai.

Pehli run mein ~10 min lag sakte hain (23M+ nodes, 35K+ roads). `.env` se DB connection use hota hai.

---

## Optional: osm2pgsql (planet_osm_* tables)

Agar aap **osm2pgsql** use karna chahen (e.g. regions_master ke liye admin boundaries):

1. Install: `choco install osm2pgsql` ya [GitHub releases](https://github.com/openstreetmap/osm2pgsql/releases).
2. `npm run osm:import` — PBF → planet_osm_*.
3. `npm run db:migrate` — 008–011 in tables se roads_master, regions_master, cities_master, areas_master copy karte hain.

**Fences:** OSM mein geofences nahi hote. Fences ke liye migration **012** (fence → fences_master) use karein.
