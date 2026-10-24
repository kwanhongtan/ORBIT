# ORBIT Improvement Plan

Checkpoint before improvements: commit `373b2fb`, tag `before-improvements-2026-10-24`.

## 1. Reading context

Implemented and covered by reading-history and freshness regression tests.

- Display timestamp, source, input quality, and current freshness for each latest metric.
- Fetch latest readings from full crew history rather than a limited timeline page.
- Anchor body points to the image coordinates; use heart rate and fingertip oxygenation associations.
- Keep self-report and whole-body metrics in the reading list rather than placing them on organs.
- Preserve missing and questionable readings explicitly.

## 2. Detection reliability

Input validation, future-record window protection, and explicit investigation coverage are implemented. Sustained-change and activity-context evaluation remain pending.

- Validate timestamps and missing numeric inputs before conversion.
- Evaluate sustained changes, missing data, and activity context using documented fixtures.
- Review how individual readings and two-signal deviations should be handled.
- Specify evaluation criteria with domain reviewers before making clinical claims.

## 3. Gemini explanations

- Add a server-side provider using validated evidence, structured responses, timeouts, and local fallback.
- Keep alert decisions in traceable rules.
- Requires a Gemini API key supplied through the environment, not committed to Git or entered in chat.

## 4. Real data source

Selected first source: CSV exports from a device or dataset.

- Agree on one device or dataset, data format, units, and access method.
- Add ingestion with source attribution and duplicate handling.
- Requires a selected source and representative non-sensitive sample records.

## 5. Team operation

- Add crew selection, accounts, permissions, database migrations, backups, and live updates.
- Choose hosting and account requirements before implementing shared access.

Each stage should have focused verification and a separate commit. Core test results describe demo behavior, not medical accuracy.
