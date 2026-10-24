# Testing

Run:

```powershell
node tests/run-core-tests.js
```

Build:

```powershell
pnpm run build
```

The automated tests cover:

- Stable baseline behavior
- Multi-signal drift alert creation
- Duplicate alert prevention
- Isolated unusual measurements
- Poor-quality data exclusion
- Future-data leakage prevention
- Alert acknowledgement and resolution
- Follow-up completion remaining separate from alert resolution
- AI fallback schema

`node --test` was also prepared in `tests/core.test.js`, but this Windows sandbox returned `spawn EPERM` before executing test files. `tests/run-core-tests.js` runs the same checks without spawning worker processes.

Additional regression tests cover full-history latest readings, current freshness, missing input rejection, invalid timestamps, future-record window protection, missing investigation data, multiline CSV, validation-only preview, and duplicate imports. The suite currently contains 15 tests.

Type-check the frontend with `pnpm run typecheck`. The frontend build and type check pass. Interactive browser checks exercised CSV validation without importing records and checked overview tooltip bounds at desktop and narrow mobile widths, including 320px. These browser checks are manual verification, not an automated browser suite.
