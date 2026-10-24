# ORBIT Architecture

## Components

- `server.js`: local HTTP server, API routing, static frontend hosting, JSON persistence.
- `src/core.js`: domain logic for measurements, quality checks, baselines, investigation, alerts, follow-ups, CSV, and fallback explanations.
- `frontend/`: React, TypeScript, Vite, Recharts, and Lucide source.
- `web/`: built production frontend served by the backend.
- `tests/`: deterministic Node tests.
- `data/`: sample CSV files and generated local database.

## Data Flow

Telemetry enters through manual form input, CSV import, or deterministic simulator scenarios. The backend validates technical ranges, units, timestamps, duplicate records, stale records, and abrupt changes. Valid data contributes to baseline calculations. The Health Drift Investigator compares recent valid telemetry against personal baselines, creates explainable findings, and opens or updates persistent alerts.

## Persistence

Persistence uses a local JSON file at `data/orbit-db.json`. The model is relational in shape: mission, crew, measurements, baselines, investigations, alerts, follow-ups, audits, and AI explanations are stored as separate collections with linked IDs.

## Algorithms

Baselines require at least eight valid observations per metric. They store count, mean, median, standard deviation, median absolute deviation, bounds, and source period. Invalid, stale, duplicate, and future observations are excluded.

The drift investigator evaluates a 36-hour window. It looks for overlapping deviations in heart rate, sleep duration, fatigue, stress, hydration, and blood oxygen. One deviation is low priority, three deviations are medium priority, and four or more are high priority. Questionable data is reported as a limitation rather than reliable evidence.

## AI Integration

`/api/ai/explain` currently returns a strict structured fallback response. It references active alerts and evidence already produced by deterministic logic. It cannot override alert state.

## Security

The server binds to `127.0.0.1`, validates JSON payloads, restricts CORS to local development, protects static file paths from traversal, and avoids exposing secrets in frontend code.
