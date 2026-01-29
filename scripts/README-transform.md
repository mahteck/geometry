# Excel / CSV → `fence` table transform

`npm run transform:fences` reads `fencedetail.xlsx` or `fence.csv`, groups rows by polygon ID, builds one WKT `POLYGON` per fence, then creates a **new** table `fence` and inserts rows. **`cherat_fences` is never touched.**

Set `TRANSFORM_TABLE=my_table` to use a different table name (default `fence`). The map API reads from `fence` (or `FENCES_TABLE` in `.env.local`).

**Output format:** one row per polygon, `geom` = `POLYGON ((lng lat, lng lat, ...))` — e.g.  
`POLYGON ((71.40219 33.999, 71.40419 33.97475, …))`

## Input format

**With headers (first row = column names):**
- **Polygon ID** column: `id`, `fence_id`, `polygon_id`, etc.
- **Longitude** column: `lon`, `lng`, `longitude`, `long`, `x`.
- **Latitude** column: `lat`, `latitude`, `y`.
- **Point order** (optional): `order`, `seq`, `sequence`, `point_order`, `point_no`, `sr`, `sno`. If missing, row order per polygon is used.
- **Extra attributes** (optional): `name`, `address`, `city` → mapped to table columns.

**No headers (`fence.csv` style):** set `TRANSFORM_NO_HEADER=1`. Assumed columns: `id`, `name`, `_` (skip), `lat`, `lon`, `order`. Example:
```bash
TRANSFORM_INPUT=fence.csv TRANSFORM_NO_HEADER=1 npm run transform:fences
```

Multiple points per polygon = multiple rows with same ID. Output: **one row per polygon** with `geom` = `POLYGON ((lng lat, lng lat, ...))`.

## Run

1. Set DB in `.env` or `.env.local` (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`).
2. **Excel:** `npm install` (for `xlsx`), then `npm run transform:fences`. Uses `fencedetail.xlsx` by default.
3. **CSV (no xlsx):** Export Excel to `fencedetail.csv`, then:
   ```bash
   TRANSFORM_INPUT=fencedetail.csv npm run transform:fences
   ```

SQL is written to `scripts/output/fences.sql` and executed on the DB. To **only generate SQL** (no DB run):

```bash
TRANSFORM_RUN_SQL=0 npm run transform:fences
```

Then run `scripts/output/fences.sql` manually in PostgreSQL.

**Map:** `/api/fences` fetches from the `fence` table. Set `FENCES_TABLE=your_table` in `.env.local` to use another table.
