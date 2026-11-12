# ORBIT Improvement Plan

## Crew workflows

1. **Mission Routine** — Select a crew member, review today's scheduled measurements, open a task, and save a linked reading through Daily Check-in. Track completion and overdue tasks. Use the mission clock and save schedule changes per crew profile.
2. **Environment context** — Select the mission environment and tag a reading with the activity at measurement time. Show the tag in Health Timeline and Mission Replay. Define demo checklists for each environment and verify older readings still work without a tag.
3. **Measurement cards** — Open a card from Daily Check-in or a body hotspot. Read how to record the indicator and which context to capture, then open the measurement form with the metric selected. Reuse the existing guidance and source links.
4. **Crew readiness** — Show daily routine completion for the selected crew member.

Checkpoint before improvements: commit `373b2fb`, tag `before-improvements-2026-10-24`.

## Mission Replay

The existing version was pushed with checkpoint tag `before-mission-replay-2026-10-28` before this stage.

Implemented: a dedicated replay view with play/pause, stepping, restart, speed, time selection, progressive metric graphs, and investigation previews. Snapshots exclude future evidence and baseline data, evaluate freshness at mission time, and never mutate live workflows. Playback uses existing records and is local to the open replay session. It does not generate new telemetry or reconstruct previous user decisions.

Next planned stage: CSV column mapping and unit normalisation while preserving original inputs.

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

Deferred: Gemini's developer service has an 18+ requirement. ORBIT continues using its deterministic local explanations.

- Add a server-side provider using validated evidence, structured responses, timeouts, and local fallback.
- Keep alert decisions in traceable rules.

## 4. Real data source

Selected first source: CSV exports from a device or dataset.

Implemented: file selection, validation preview, per-record errors, duplicate skipping, quoted and multiline field handling, and 1 MB request limit. Files must use the ORBIT columns; vendor-specific mapping requires an example export format.

- Agree on one device or dataset, data format, units, and access method.
- Add ingestion with source attribution and duplicate handling.
- Requires a selected source and representative non-sensitive sample records.

## 5. Team operation

- Add crew selection, accounts, permissions, database migrations, backups, and live updates.
- Choose hosting and account requirements before implementing shared access.

Each stage should have focused verification and a separate commit. Core test results describe demo behavior, not medical accuracy.
