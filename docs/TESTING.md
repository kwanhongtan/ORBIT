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

Additional regression tests cover full-history latest readings, current freshness, missing input rejection, invalid timestamps, future-record window protection, missing investigation data, multiline CSV, validation-only preview, duplicate imports, seeded interior anomaly placement, import batch deletion, linked workflow cleanup, persistence of recoverable readings, legacy imports, restore conflicts, assistant evidence accuracy, metric context, missing data, unsupported questions, read-only behavior, quality handling, and medical-question limits. The suite currently contains 26 tests.

Type-check the frontend with `pnpm run typecheck`. The frontend build and type check pass. Interactive browser checks exercised CSV validation without importing records and checked overview tooltip bounds at desktop and narrow mobile widths, including 320px. These browser checks are manual verification, not an automated browser suite.

Delete confirmation, cancellation, deletion, and restoration were checked through the UI against a separate temporary database containing only two synthetic readings. Existing user records were not deleted.

Assistant browser checks exercised suggested and typed questions, supporting reading expansion, metric follow-up context, navigation with conversation retention, conversation clearing, and mobile layout without horizontal overflow.
