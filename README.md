# ResQvision — AI-Powered IR Satellite Analysis Platform

**Zero-cost, client-side AI for disaster resilience and agricultural support.**

Built for the **Technology for Sustainable Society: Frugal Innovations for a Better Future** theme.

Presented by **Parshini R, Likhitha Priya, Sandeep Chowdary, Akaash G** — *SRM Institute of Science and Technology*

---

## What is ResQvision?

ResQvision turns freely available satellite thermal-IR imagery into instant, actionable insights — directly in the user's browser. Rural disaster response and farm monitoring tools today rely on expensive GPU servers and licensed software. ResQvision eliminates that entire cost layer by running AI inference **on the user's own device**, making satellite-grade analysis accessible to anyone with a smartphone.

## Features

- **Live IR Monitor** — real-time thermal monitoring with automatic colorization (JET, TURBO, INFERNO palettes) of raw satellite feeds
- **Automatic Disaster Detection** — frame-to-frame change detection that runs automatically; highlights the **most and least affected regions** on a damage map with a full legend
- **Email Disaster Alerts** — subscribers receive named-region alerts (e.g., "worst zone: South-East, 92% change") for high/critical events
- **Scene Analysis ML** — TensorFlow.js (DeepLab v3) classifies land use (vegetation, water, burned, urban) client-side
- **Temporal Comparison** — side-by-side current vs. historical archive views
- **Map Legends & Weather Cards** — color semantics and at-a-glance climate conditions per location
- **Mobile-first** — responsive design for rural smartphone users

## Why Frugal?

| Conventional approach | ResQvision |
|---|---|
| Paid GPU servers for ML inference | Runs entirely in the visitor's browser (free) |
| Licensed satellite-processing software (ENVI, ArcGIS) | Open web stack (React + Vite), zero licensing cost |
| Enterprise SaaS subscriptions | Free open-source platform |
| Desktop-only professional tools | Works on any smartphone browser |

## Tech Stack

- **Frontend:** React, TypeScript, Vite, TailwindCSS
- **ML:** TensorFlow.js — DeepLab v3 (pretrained semantic segmentation), client-side inference
- **Backend/Database:** Supabase (PostgreSQL, row-level security)
- **Colorization:** physics-based temperature-to-colour mapping + custom colormap engine
- **Hosting:** Vercel (zero-cost deployment)

## Pipeline

1. Public satellite feeds (thermal IR) are fetched client-side
2. Raw grayscale frames are colorized with the thermal colormap engine
3. TensorFlow.js classifies scene content directly in the browser
4. Change detection compares the live frame against the stored baseline frame
5. Affected-region analysis scores a spatial grid to locate the worst zone
6. High-severity events trigger alerts stored in Supabase; email notifications go to subscribers

## Getting Started

```bash
pnpm install      # or: npm install
pnpm dev          # or: npm run dev
```

Create a `.env` file with your own Supabase credentials (create a free project at [supabase.com](https://supabase.com)):

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Build for production:

```bash
pnpm build        # or: npm run build
```

## Deployment

Deploy free on [Vercel](https://vercel.com) by connecting this repository. Add the two environment variables above in the Vercel dashboard (Settings → Environment Variables).

## Data Sources

- Thermal IR imagery from public satellite feeds (MODIS/INSAT/Himawari-derived via public endpoints)
- IMD (India Meteorological Department) public weather data for live weather cards

## License

MIT
