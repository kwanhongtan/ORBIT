# ORBIT Project Report

## Problem Statement

Simple dashboards show values but often fail to explain why a warning happened, whether data quality is reliable, or whether follow-up was completed. ORBIT, short for Observational Risk Baselines, Investigation & Tracking, demonstrates a more structured health-monitoring workflow using simulated astronaut telemetry.

## Objectives

- Collect simulated, imported, manual, and daily self-assessment health measurements.
- Establish personal baselines.
- Detect multi-signal health drift.
- Explain alerts using evidence and baseline comparisons.
- Track acknowledgement, follow-up, and resolution.
- Keep the core system offline-first.

## Scope

The project is a local educational prototype. It does not perform clinical diagnosis and is not validated for real health use.

## System Design

The backend exposes API endpoints for mission data, measurements, baselines, simulator scenarios, investigations, alerts, follow-ups, AI fallback explanations, and CSV reports. The frontend is a mission-control style dashboard with six sections matching the specification.

## Implementation

Core logic is implemented in `src/core.js`. The HTTP API and JSON persistence are implemented in `server.js`. The browser UI source is implemented in `frontend/` using React, TypeScript, Recharts, and Lucide. The production build is emitted into `web/`.

## Algorithms

Baselines use valid historical measurements only and require at least eight samples. The drift investigator evaluates recent measurements against personal bounds and creates medium or high alerts only for overlapping multi-signal deviations.

## Testing And Results

Automated Node tests cover the main algorithms and workflow boundaries. Run `node --test tests/*.test.js` to reproduce results.

## Limitations

The backend uses JSON persistence rather than SQLite or FastAPI. Gemini SDK calls are not enabled by default because the core system must work without an API key. Browser E2E tests were not added in this version.

## Future Improvements

- Replace JSON persistence with SQLite.
- Add React and charting once package installation is available.
- Add official Gemini SDK integration behind the backend.
- Add Playwright end-to-end tests.
- Add multi-crew management.

## Conclusion

ORBIT demonstrates offline simulated telemetry, personal baselines, explainable drift investigation, persistent incident workflow, follow-up tracking, CSV import/export, and local fallback explanations in a runnable local web application.
