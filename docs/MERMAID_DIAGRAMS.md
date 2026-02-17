# Mermaid Diagrams – Pakistan Map & Fences

Copy each code block into [Mermaid Live Editor](https://mermaid.live) to generate professional diagrams (PNG, SVG, or export).

---

## 1. System Architecture & Data Flow

```mermaid
flowchart TB
    subgraph Sources["Data Sources"]
        PK[PK/PK1 PK.txt - GeoNames]
        Excel[fencedetail.xlsx or CSV]
        RoadSQL[roads_sample_data.sql]
    end

    subgraph Scripts["Import/Transform Scripts"]
        Import[npm run import:pakistan]
        Transform[npm run transform:fences]
        SetupRoads[npm run setup:roads]
    end

    subgraph DB[(PostgreSQL + PostGIS)]
        Provinces[pakistan_provinces]
        Districts[pakistan_districts]
        Cities[pakistan_cities]
        Motorways[pakistan_motorways]
        Highways[pakistan_highways]
        Fence[fence]
    end

    subgraph API["Next.js API Routes"]
        FenceAPI[/api/fences]
        PakAPI[/api/pakistan/*]
    end

    subgraph Frontend["Frontend - Leaflet"]
        MapPage["/map - Fences Map"]
        PakMap["/pakistan-map - Pakistan Map"]
    end

    PK --> Import
    Import --> Provinces
    Import --> Districts
    Import --> Cities
    Excel --> Transform
    Transform --> Fence
    RoadSQL --> SetupRoads
    SetupRoads --> Motorways
    SetupRoads --> Highways

    Provinces --> PakAPI
    Districts --> PakAPI
    Cities --> PakAPI
    Motorways --> PakAPI
    Highways --> PakAPI
    Fence --> FenceAPI

    PakAPI --> PakMap
    FenceAPI --> MapPage
```

---

## 2. Database Entity Relationship

```mermaid
erDiagram
    pakistan_provinces ||--o{ pakistan_districts : "has"
    pakistan_provinces ||--o{ pakistan_cities : "contains"
    pakistan_districts ||--o{ pakistan_cities : "contains"

    pakistan_provinces {
        varchar code PK
        varchar name
        geometry geom
    }

    pakistan_districts {
        int geonameid PK
        varchar name
        varchar province_code FK
        geometry geom
    }

    pakistan_cities {
        int geonameid PK
        varchar name
        varchar province_code FK
        varchar district_name
        decimal lat
        decimal lng
        geometry geom
    }

    pakistan_motorways {
        int id PK
        varchar motorway_code
        geometry geom
    }

    pakistan_highways {
        int id PK
        varchar highway_code
        geometry geom
    }

    fence {
        int id PK
        varchar name
        geometry geom
    }
```

---

## 3. Pakistan Data Import Pipeline

```mermaid
flowchart TB
    A[PK.txt from GeoNames] --> B[Parse TSV]
    B --> C{Feature type?}
    C -->|P = Populated place| D[Extract cities]
    C -->|ADM2| E[Extract districts]
    D --> F[Build district lookup]
    E --> F
    F --> G[Insert cities with geom]
    G --> H[Insert districts]
    H --> I[Build province polygons - ConvexHull]
    I --> J[Build district polygons - ConvexHull]
    J --> K[Update pakistan_provinces.geom]
    J --> L[Update pakistan_districts.geom]
```

---

## 4. Pakistan Map – User Operations

```mermaid
flowchart LR
    subgraph Load["Page Load"]
        A[Open /pakistan-map] --> B[Fetch provinces, districts, cities, roads]
        B --> C[Render Leaflet layers]
    end

    subgraph Explore["Explore"]
        C --> D[Layer toggles]
        C --> I[Search cities]
        I --> J[Zoom to city]
        C --> K[Click road]
        K --> L[Road Info Panel]
        L --> M[View Details Modal]
    end

    subgraph Route["Route Planner"]
        N[Select From city] --> O[Select To city]
        O --> P[Find Road]
        P --> Q[Show routes]
        Q --> R[Highlight on map]
    end
```

---

## 5. Fences Map – User Operations

```mermaid
flowchart LR
    subgraph View["View"]
        A[Open /map] --> B[Load fences]
        B --> C[Display polygons]
        C --> D[Hover tooltip]
        C --> E[Click Edit/Delete]
    end

    subgraph Create["Create"]
        F[Draw polygon] --> G[Save to API]
        G --> H[Insert fence table]
        H --> I[Refresh map]
    end

    subgraph Manage["Manage"]
        J[Search/Filter] --> K[Filtered list]
        N[Export] --> O[GeoJSON / CSV]
    end

    subgraph Validate["Validate"]
        P[Run validation] --> Q[Invalid geometries?]
        Q --> R[Fix or Mark inactive]
    end
```

---

## 6. Full System Overview (Simplified)

```mermaid
flowchart TB
    subgraph Input["Inputs"]
        PK[GeoNames PK.txt]
        Excel[Excel/CSV Fences]
        SQL[Roads SQL]
    end

    subgraph Process["Process"]
        Import[import:pakistan]
        Transform[transform:fences]
        Setup[setup:roads]
    end

    subgraph Storage["Database"]
        DB[(PostgreSQL PostGIS)]
    end

    subgraph Output["Output"]
        Map1["/map - Fences"]
        Map2["/pakistan-map - Pakistan"]
    end

    PK --> Import
    Excel --> Transform
    SQL --> Setup
    Import --> DB
    Transform --> DB
    Setup --> DB
    DB --> Map1
    DB --> Map2
```

---

**Usage:** Paste any block (without the triple backticks) into https://mermaid.live and export as PNG or SVG for presentations or docs.
