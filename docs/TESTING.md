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

Browser-level tests were not added. The production React build was verified with Vite, and the served app endpoint returned HTTP 200.
