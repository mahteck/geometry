# Fence data sanitization – route_type, region, Show other, Unclassified

## 1. Region (fence table) – actual province by lat/long

- **Fence table** mein **region** column (text). Value = **actual province name** (Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Gilgit-Baltistan, Azad Jammu and Kashmir, Islamabad, Other).
- **Populate:** `npm run classify:fences:region` – har fence ka **centroid** (lat/long) pakistan_provinces boundaries se match hota hai (`ST_Contains(province.geom, ST_Centroid(fence.geom))`). Jis province ke andar centroid, wahi region set hota hai. Bahar waley → **Other**.
- **Zaroorat:** `pakistan_provinces` table with `geom` (run `npm run setup:pakistan` + `npm run import:pakistan:boundaries`). Agar yeh na ho to script name-based fallback use karti hai (Lahore/Karachi/Islamabad/Other).
- **Filter:** API `region=<province name>` se filter karta hai (e.g. `region=Punjab`, `region=Sindh`, `region=Other`).
- **UI:** Region dropdown = Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Gilgit-Baltistan, Azad Jammu & Kashmir, Islamabad, Other.

---

## 2. Route types (sanitized)

| route_type   | Meaning                    | Kaise assign hota hai |
|-------------|----------------------------|------------------------|
| **motorway** | M-xx, Motorway             | Name: motorway, M-1, M-2, … |
| **highway**  | N-xx, National Highway, GT Road | Name: highway, N-5, GT Road, … |
| **intracity** | Shehr ke andar chhota area  | Name: city/town/mandi/sector + area ≤ 20 km² |
| **other**    | **Sirf** regional/boundary polygon | Name: "boundary" **ya** do provinces (Sindh+Punjab, Punjab+POK, etc.) |
| **NULL** (unclassified) | Baaki sab | Koi rule match nahi hua |

**Show other (regional):** Sirf woh fences jo script ke hisaab se **other** (boundary/multi-province). Check/uncheck se sirf yehi filters honge.

---

## 3. Unclassified ko thik karne ka plan (sab polygons proper)

1. **Region:**  
   `npm run classify:fences:region` – har fence ko lahore/karachi/islamabad/other mil jata hai. Region filter + map colors dono sahi.

2. **Route type:**  
   `npm run classify:fences:route-type` – motorway, highway, intracity, other (narrow) set ho jate hain. Jo match nahi karte wo **unclassified (NULL)** rehte hain.

3. **Unclassified (NULL) kam karne ke liye:**
   - **Names theek karo:** Agar fence actually M-2 / N-5 hai to name mein "Motorway" / "Highway" ya "M-2" / "N-5" add karo, phir script dubara chalao.
   - **Naye patterns (optional):** Script mein Expressway, NHA, Route jaisi terms add karke aur classify karo.
   - **Manual:** DB mein kisi bhi fence ka `route_type` / `region` direct set karo.

4. **Map par:**  
   Unclassified fences **region** (actual province name) se color honge, to sab polygons properly dikhenge.

**Order:**  
Pehle `classify:fences:region`, phir `classify:fences:route-type`. Isse data sanitize rehega aur aage use karne layak.

---

## 4. Script order (classify-fence-route-type.mjs)

1. Motorway (name patterns)  
2. Highway (name patterns)  
3. Intracity (name + area ≤ 20 km²)  
4. Clear intracity jahan area > 20 km²  
5. Clear existing "other"  
6. Other – sirf boundary / multi-province names  

---

## 5. UI summary

- **Region:** Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Gilgit-Baltistan, Azad Jammu & Kashmir, Islamabad, Other – actual province names (by lat/long); filter DB `region` column use karta hai.
- **Show other (regional):** Sirf route_type = other (narrow) fences; check/uncheck ka impact sahi.
- **Show big fences:** Sirf ≥ 50 km²; check/uncheck sahi kaam karta hai.
