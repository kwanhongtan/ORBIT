# ORBIT User Guide

## Mission Overview

Use this screen to see the fictional mission profile, current telemetry count, quality warnings, active alerts, open follow-ups, and the latest investigator finding.

Latest readings include timestamp, source, input quality, and freshness. These checks do not establish medical normality. The heart-rate and fingertip-oxygen dots show details on hover, keyboard focus, or tap. Whole-body and self-report metrics are listed separately.

## Health Timeline

Review trends, measurement records, source labels, and quality status.

Select any health metric in **Health graphs** to review its full recorded history. Filter by local start/end dates, source, or quality and switch between line and bar graphs. Hover a plotted reading for its value, time, source, and quality flags. The records table follows the same filters and uses 50-record pages. Use the reset icon to clear filters. Metrics without matching data show an empty state.

## Drift Investigation

Recalculate baselines after generating stable data. Run the investigator after each scenario. Findings show the supporting measurements, baseline comparisons, severity, and quality limitations.

## Daily Check-in

Submit mood, fatigue, stress, sleep quality, symptom severity, and notes. Manual measurements can also be entered for oxygen saturation, blood pressure, simulated radiation-dose placeholders, and bone-assessment placeholders.

## Action Centre

Alerts can be acknowledged, moved to investigation, marked false positive, resolved with required notes, or linked to follow-up actions. Completing a follow-up does not automatically resolve an alert.

## AI Health Assistant

The assistant screen generates a local structured fallback explanation. It is not a diagnosis and does not send data externally.

The chat panel answers supported questions about stored metrics, personal baseline comparisons, recorded changes, alerts, quality, and pending follow-ups. It is a rule-based local assistant, not a connected language model. Suggested questions are available when starting a conversation. Supporting readings include their record IDs, sources, times, and quality; navigation buttons open the relevant screen without changing records.

Metric follow-ups such as "What about its baseline?" reuse the previous metric. Unsupported questions are reported explicitly. Replies are snapshots of the database when the question was submitted. The assistant does not run investigations, recalculate baselines, or resolve alerts. Questions and conversation replies remain in the current app session and are not saved as chat history or sent externally; refreshing the page clears them.

## Data And Simulation Lab

Generate reproducible scenarios, reset demo data with confirmation, export measurements, alerts, and follow-ups as CSV, or paste CSV in the documented template format to import measurements with validation.

The isolated unusual measurement scenario places one heart-rate spike on a seeded random interior day, excluding the first and last days when generating at least three days. A two-day run uses the first day. The same seed reproduces its position. An investigation of the latest readings may no longer include a spike that occurred earlier; use Health Timeline to review it. Existing generated batches are unchanged, and repeating the same scenario, days, and seed is skipped as a duplicate batch.

Select a CSV file (up to 1 MB) or paste its contents, then choose **Validate CSV**. Review the ready count, rejected records, duplicate count, and first 20 accepted records. Choose **Import Valid Records** to save only accepted records. Validation does not import data; imported records are revalidated before saving.

Required columns: `crew_id`, `metric_type`, `value`, `measured_at`. Optional columns include `unit`, `source`, and `notes`. Use `crew-aurora` for the current crew and ISO timestamps with a timezone, such as `2026-10-24T08:00:00Z`. Vendor exports with other headers need mapping to this schema. See `data/import_template.csv` for an example.

## Delete CSV Imports

Under **Data & Simulation Lab > Import History**, choose **Delete Import** and confirm the filename and reading count. Readings are removed from active graphs and records and kept in **Deleted Imports** for recovery in the same local JSON database. This is recoverable deletion, not permanent erasure. Manual readings, simulated readings, and other imports remain active.

Findings and alerts that reference removed readings, and follow-ups linked to those alerts, are archived with the import. Affected crew baselines and generated explanations are cleared to avoid stale results. **Restore Readings** restores the measurements only; recalculate baselines and rerun investigations afterward. Restore is refused if equivalent readings already exist.

New imports are tracked separately by upload with their filename (or `Pasted CSV`). Older records explicitly marked `csv_import` or `imported_sample` are grouped under **Earlier CSV imports (grouped)** because their original upload boundaries are unavailable. Older custom source labels cannot be reliably identified as CSV imports and are not automatically included.
